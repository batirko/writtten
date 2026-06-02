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

import { type EvalTrigger, type EvalContext } from "./types";
import { evaluateBlock } from "./evaluator";
import {
  loadActiveObservationsForDocument,
  orphanClaimsForBlock,
  updateObservationStatus,
} from "../store/db";
import { llmLogger } from "../model/logger";
import { harness } from "../debug/harness";

// ---------------------------------------------------------------------------
// Module-level state (there is one editor / one doc at a time)
// ---------------------------------------------------------------------------

/** 250 ms window to collapse pause+blur double-fires for the same block. */
const COALESCE_MS = 250;

interface CoalesceEntry {
  timer: ReturnType<typeof setTimeout>;
  text: string;
  triggerKind: string;
  onComplete?: () => void;
}

interface PendingEntry {
  text: string;
  ctx: EvalContext;
  triggerKind: string;
  onComplete?: () => void;
}

const coalesceTimers = new Map<string, CoalesceEntry>();
const inFlightBlocks = new Set<string>();
const pendingAfterInflight = new Map<string, PendingEntry>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Push the current "work outstanding" count to the readiness signal. Idle (0)
 *  means nothing is debouncing, queued, or in flight. */
function recomputePending(): void {
  if (import.meta.env.DEV) {
    harness.setPending(
      coalesceTimers.size + inFlightBlocks.size + pendingAfterInflight.size,
    );
  }
}

function logTrigger(triggerKind: string, blockId: string): void {
  llmLogger.log({
    type: "trigger",
    model: "",
    endpoint: "",
    payload: { system: "", user: "" },
    triggerKind,
    blockId,
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

  // Auto-close all observations anchored to or conflicting with this block
  const active = await loadActiveObservationsForDocument(ctx.docId);
  const toClose = active.filter(
    (o) => o.blockId === blockId || o.conflictingBlockId === blockId,
  );
  await Promise.all(toClose.map((o) => updateObservationStatus(o.id, "auto_closed")));

  onComplete?.();
}

async function dispatch(
  blockId: string,
  text: string,
  ctx: EvalContext,
  triggerKind: string,
  onComplete?: () => void,
): Promise<void> {
  // If in-flight, queue a re-run with the latest data
  if (inFlightBlocks.has(blockId)) {
    pendingAfterInflight.set(blockId, { text, ctx, triggerKind: "rerun", onComplete });
    recomputePending();
    return;
  }

  inFlightBlocks.add(blockId);
  recomputePending();
  logTrigger(triggerKind, blockId);
  if (import.meta.env.DEV) harness.emit("settle", { trigger: triggerKind, block: blockId });

  try {
    await evaluateBlock(ctx.docId, blockId, text, ctx.stage, ctx.apiKey);
  } catch (err) {
    console.error("[orchestrator] evaluateBlock threw:", err);
  } finally {
    inFlightBlocks.delete(blockId);
    onComplete?.();

    // Dispatch the queued re-run if one arrived while we were in-flight
    const pending = pendingAfterInflight.get(blockId);
    if (pending) {
      pendingAfterInflight.delete(blockId);
      recomputePending();
      dispatch(blockId, pending.text, pending.ctx, pending.triggerKind, pending.onComplete);
    } else {
      recomputePending();
    }
  }
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

  if (trigger.kind === "block-paste") {
    // Phase 3: coalesce into a batched fast call.
    // For now each block will settle individually via normal pause/blur triggers.
    return;
  }

  // block-settle-pause | block-settle-blur
  if (!text) return;
  const { blockId } = trigger;
  const triggerKind =
    trigger.kind === "block-settle-pause"
      ? "settle-pause"
      : `settle-blur:${trigger.reason}`;

  // Collapse into the coalesce window
  const existing = coalesceTimers.get(blockId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    coalesceTimers.delete(blockId);
    recomputePending();
    dispatch(blockId, text, ctx, triggerKind, onComplete);
  }, COALESCE_MS);

  coalesceTimers.set(blockId, { timer, text, triggerKind, onComplete });
  recomputePending();
}
