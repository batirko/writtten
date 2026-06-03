/**
 * Eval orchestrator — the single entry point between the editor and the
 * evaluator. Handles:
 *   - Coalescing: a 250 ms window collapses pause+blur double-fires for the
 *     same block into one dispatch.
 *   - Serialisation: if a block is already being evaluated, the new trigger
 *     is queued and dispatched the moment the in-flight call resolves.
 *   - block-removed cascade: orphans claims and closes affected observations
 *     without an LLM call.
 *   - Trigger logging: every dispatch gets a "trigger" entry in the debug log.
 *
 * See docs/projects/message_generation_workflow.md §6.
 */

import { type EvalTrigger, type EvalContext, type SectionMember } from "./types";
import { evaluateSection, evaluateDocument } from "./evaluator";
import {
  loadActiveObservationsForDocument,
  orphanClaimsForBlock,
  updateObservationStatus,
  deleteBlockSummary,
} from "../store/db";
import { llmLogger } from "../model/logger";
import { harness } from "../debug/harness";
import { isNearLimit } from "../model/rpmBudget";

/**
 * How long to defer a doc-idle call when RPM is near the free-tier limit.
 * Gives the 60-second window time to drain before burning another strong call
 * on doc-level checks. Block-settle and contradiction always go through
 * immediately — only doc-idle is low enough priority to defer.
 */
const DOC_IDLE_RPM_DEFER_MS = 30_000;

// ---------------------------------------------------------------------------
// Module-level state (there is one editor / one doc at a time)
// ---------------------------------------------------------------------------

/** 250 ms window to collapse pause+blur double-fires for the same block. */
const COALESCE_MS = 250;

interface CoalesceEntry {
  timer: ReturnType<typeof setTimeout>;
  text: string;
  members: SectionMember[];
  triggerKind: string;
  onComplete?: () => void;
}

interface PendingEntry {
  text: string;
  members: SectionMember[];
  ctx: EvalContext;
  triggerKind: string;
  onComplete?: () => void;
}

// Keyed by sectionId — a section (heading + body) is the unit of evaluation.
const coalesceTimers = new Map<string, CoalesceEntry>();
const inFlightSections = new Set<string>();
const pendingAfterInflight = new Map<string, PendingEntry>();

let docIdleInFlight = false;
let pendingDocIdle: { ctx: EvalContext; onComplete?: () => void } | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Push the current "work outstanding" count to the readiness signal. Idle (0)
 *  means nothing is debouncing, queued, or in flight. */
function recomputePending(): void {
  if (import.meta.env.DEV) {
    harness.setPending(
      coalesceTimers.size +
        inFlightSections.size +
        pendingAfterInflight.size +
        (docIdleInFlight ? 1 : 0) +
        (pendingDocIdle ? 1 : 0),
    );
  }
}

function logTrigger(triggerKind: string, id: string): void {
  llmLogger.log({
    type: "trigger",
    model: "",
    endpoint: "",
    payload: { system: "", user: "" },
    triggerKind,
    blockId: id,
  });
}

async function handleBlockRemoved(
  blockId: string,
  ctx: EvalContext,
  onComplete?: () => void,
): Promise<void> {
  // Cancel any pending coalesce or queued re-run for this block
  const entry = coalesceTimers.get(blockId);
  if (entry) {
    clearTimeout(entry.timer);
    coalesceTimers.delete(blockId);
  }
  pendingAfterInflight.delete(blockId);
  recomputePending();

  logTrigger("block-removed", blockId);
  if (import.meta.env.DEV) harness.emit("block-removed", { block: blockId });

  // Orphan claims — no LLM call needed
  await orphanClaimsForBlock(blockId);
  await deleteBlockSummary(blockId);

  // Auto-close all observations anchored to or conflicting with this block
  const active = await loadActiveObservationsForDocument(ctx.docId);
  const toClose = active.filter(
    (o) => o.blockId === blockId || o.conflictingBlockId === blockId,
  );
  await Promise.all(toClose.map((o) => updateObservationStatus(o.id, "auto_closed")));

  onComplete?.();
}

async function dispatch(
  sectionId: string,
  text: string,
  members: SectionMember[],
  ctx: EvalContext,
  triggerKind: string,
  onComplete?: () => void,
): Promise<void> {
  // If in-flight, queue a re-run with the latest data
  if (inFlightSections.has(sectionId)) {
    pendingAfterInflight.set(sectionId, { text, members, ctx, triggerKind: "rerun", onComplete });
    recomputePending();
    return;
  }

  inFlightSections.add(sectionId);
  recomputePending();
  logTrigger(triggerKind, sectionId);
  if (import.meta.env.DEV) harness.emit("settle", { trigger: triggerKind, sectionId });

  try {
    await evaluateSection(ctx.docId, sectionId, text, members, ctx.stage, ctx.apiKey, ctx.paidKey);
  } catch (err) {
    console.error("[orchestrator] evaluateSection threw:", err);
  } finally {
    inFlightSections.delete(sectionId);
    onComplete?.();

    // Dispatch the queued re-run if one arrived while we were in-flight
    const pending = pendingAfterInflight.get(sectionId);
    if (pending) {
      pendingAfterInflight.delete(sectionId);
      recomputePending();
      dispatch(sectionId, pending.text, pending.members, pending.ctx, pending.triggerKind, pending.onComplete);
    } else {
      recomputePending();
    }
  }
}

// ---------------------------------------------------------------------------
// Doc-idle and stage-changed handlers
// ---------------------------------------------------------------------------

async function handleDocIdle(ctx: EvalContext, onComplete?: () => void): Promise<void> {
  if (docIdleInFlight) {
    // Replace any pending re-run with the latest context
    pendingDocIdle = { ctx, onComplete };
    recomputePending();
    return;
  }

  // RPM backpressure: doc-idle is low priority. If we're near the free-tier
  // limit, defer by DOC_IDLE_RPM_DEFER_MS rather than burning a strong call
  // that competes with settling blocks.
  if (isNearLimit()) {
    if (import.meta.env.DEV) {
      harness.emit("settle", { trigger: "doc-idle-deferred", reason: "rpm-limit" });
    }
    setTimeout(() => handleDocIdle(ctx, onComplete), DOC_IDLE_RPM_DEFER_MS);
    return;
  }

  docIdleInFlight = true;
  recomputePending();
  logTrigger("doc-idle", "");
  if (import.meta.env.DEV) harness.emit("settle", { trigger: "doc-idle" });

  try {
    await evaluateDocument(ctx.docId, ctx.stage, ctx.apiKey, ctx.onStageSuggestion, ctx.paidKey);
  } catch (err) {
    console.error("[orchestrator] evaluateDocument threw:", err);
  } finally {
    docIdleInFlight = false;
    onComplete?.();

    const pending = pendingDocIdle;
    if (pending) {
      pendingDocIdle = null;
      recomputePending();
      handleDocIdle(pending.ctx, pending.onComplete);
    } else {
      recomputePending();
    }
  }
}

async function handleStageChanged(ctx: EvalContext, onComplete?: () => void): Promise<void> {
  logTrigger("stage-changed", "");
  if (import.meta.env.DEV) harness.emit("settle", { trigger: "stage-changed" });

  // Supersede all active doc-level observations (they were graded against the old stage)
  const active = await loadActiveObservationsForDocument(ctx.docId);
  const docLevel = active.filter((o) => o.scope === "document");
  await Promise.all(docLevel.map((o) => updateObservationStatus(o.id, "superseded")));

  // Re-run doc-level checks with the new stage
  await handleDocIdle(ctx, onComplete);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Schedule an evaluation from an editor trigger. Safe to call from React
 * callbacks — fire-and-forget, all async work is internal.
 *
 * @param trigger  The originating event (see EvalTrigger).
 * @param text     Raw text of the focal block. Pass null for block-removed.
 * @param ctx      Ambient context (docId, apiKey, stage).
 * @param onComplete  Called once the evaluation (or cascade) completes.
 */
export function scheduleEval(
  trigger: EvalTrigger,
  text: string | null,
  ctx: EvalContext,
  onComplete?: () => void,
): void {
  if (trigger.kind === "block-removed") {
    handleBlockRemoved(trigger.blockId, ctx, onComplete);
    return;
  }

  if (trigger.kind === "doc-idle") {
    handleDocIdle(ctx, onComplete);
    return;
  }

  if (trigger.kind === "stage-changed") {
    handleStageChanged(ctx, onComplete);
    return;
  }

  if (trigger.kind === "block-paste") {
    // Phase 3: coalesce into a batched fast call.
    // For now each block will settle individually via normal pause/blur triggers.
    return;
  }

  // block-settle-pause | block-settle-blur (section-keyed)
  if (!text) return;
  const { sectionId, members } = trigger;
  const triggerKind =
    trigger.kind === "block-settle-pause"
      ? "settle-pause"
      : `settle-blur:${trigger.reason}`;

  // Collapse into the coalesce window
  const existing = coalesceTimers.get(sectionId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    coalesceTimers.delete(sectionId);
    recomputePending();
    dispatch(sectionId, text, members, ctx, triggerKind, onComplete);
  }, COALESCE_MS);

  coalesceTimers.set(sectionId, { timer, text, members, triggerKind, onComplete });
  recomputePending();
}
