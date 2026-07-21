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
import { evaluateSection, evaluateDocument, evaluateLedgerContradictions } from "./evaluator";
import {
  loadActiveObservationsForDocument,
  orphanClaimsForBlock,
  updateObservationStatus,
  deleteBlockSummary,
} from "../store/db";
import { llmLogger } from "../model/logger";
import { harness } from "../debug/harness";
import { setActivityPending } from "../model/activitySignal";
import { notifyDocSettled } from "../model/docSettleSignal";
import { isNearLimit } from "../model/rpmBudget";
import { isBuiltinEngineActive } from "./evalEngine";
import { nanoid } from "nanoid";

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

/**
 * Eval-generation token per section id. Bumped whenever a block is removed, so
 * an in-flight `evaluateSection` whose response lands *after* the removal can
 * detect it is stale and skip its post-LLM writes — otherwise it would
 * re-insert `active` claims and a summary for a section that no longer exists
 * (zombie claims). See lifecycle_integrity L4.
 */
const sectionEvalGeneration = new Map<string, number>();

/** Invalidate any in-flight eval for this section by bumping its generation. */
function bumpSectionGeneration(sectionId: string): void {
  sectionEvalGeneration.set(sectionId, (sectionEvalGeneration.get(sectionId) ?? 0) + 1);
}

/**
 * Invalidate any pending/in-flight eval for a section whose boundaries just
 * reverted to a previously-committed shape (revert-aware eval, Mechanism 1).
 * Bumps the section's eval generation — so any `evaluateSection` already in
 * flight sees `isLive()` go false and skips its post-LLM writes (the same L4
 * machinery `block-removed` uses) — and drops any not-yet-dispatched coalesce or
 * queued re-run for it. Unlike `handleBlockRemoved`, this fires **no** LLM call
 * and does **not** orphan claims or close observations: the section still exists,
 * only a transient boundary change is being unwound. Mechanism 2's snapshot
 * restore handles the observation side. See docs/projects/revert_aware_evaluation.md
 * and docs/mechanics/evaluation-triggers.md.
 */
export function invalidateSectionEval(sectionId: string): void {
  bumpSectionGeneration(sectionId);
  const entry = coalesceTimers.get(sectionId);
  if (entry) {
    clearTimeout(entry.timer);
    coalesceTimers.delete(sectionId);
  }
  pendingAfterInflight.delete(sectionId);
  recomputePending();
}

let docIdleInFlight = false;
let pendingDocIdle: { ctx: EvalContext; onComplete?: () => void } | null = null;

let bootstrapSweepInFlight = false;
let pendingBootstrapSweep: { ctx: EvalContext; onComplete?: () => void } | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Coalescer for the document-settle signal, deliberately separate from
 * `coalesceTimers`.
 *
 * It shares `COALESCE_MS` — there is one settle window, and two constants would
 * drift — but it is counted by nothing and gated by nothing. `coalesceTimers`
 * feeds `recomputePending()`, so arming one of those under the agent engine
 * would print `evaluating · 1` for work that will never run; and it sits below
 * the engine gate, which is precisely why the bridge went blind (UX-033).
 *
 * Draining to empty is what fires: concurrent sections collapse into a single
 * notification, matching the `wasBusy && n === 0` collapse the bridge relied on
 * back when it derived settle from the activity count.
 */
const settleNoticeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function armDocSettleNotice(sectionId: string): void {
  const existing = settleNoticeTimers.get(sectionId);
  if (existing) clearTimeout(existing);
  settleNoticeTimers.set(
    sectionId,
    setTimeout(() => {
      settleNoticeTimers.delete(sectionId);
      if (settleNoticeTimers.size === 0) notifyDocSettled();
    }, COALESCE_MS)
  );
}

/** Push the current "work outstanding" count to the readiness signal. Idle (0)
 *  means nothing is debouncing, queued, or in flight. */
function recomputePending(): void {
  const count =
    coalesceTimers.size +
    inFlightSections.size +
    pendingAfterInflight.size +
    (docIdleInFlight ? 1 : 0) +
    (pendingDocIdle ? 1 : 0) +
    (bootstrapSweepInFlight ? 1 : 0) +
    (pendingBootstrapSweep ? 1 : 0);
  // Production-safe activity signal drives the activity-center "working" pulse.
  setActivityPending(count);
  // The dev-only acceptance harness mirrors the same count for observability.
  if (import.meta.env.DEV) {
    harness.setPending(count);
  }
}

/** Mint an eval-pass id and log its trigger; the id threads through every call
 *  and archive the pass spawns so they read as one causal unit on export. */
function logTrigger(triggerKind: string, id: string): string {
  const evalId = nanoid(8);
  llmLogger.log({
    type: "trigger",
    model: "",
    endpoint: "",
    payload: { system: "", user: "" },
    triggerKind,
    blockId: id,
    evalId,
  });
  return evalId;
}

async function handleBlockRemoved(
  blockId: string,
  ctx: EvalContext,
  onComplete?: () => void
): Promise<void> {
  // Invalidate any in-flight eval for this section so a late LLM response can't
  // resurrect claims/observations for the now-removed block (L4).
  bumpSectionGeneration(blockId);

  // Cancel any pending coalesce or queued re-run for this block
  const entry = coalesceTimers.get(blockId);
  if (entry) {
    clearTimeout(entry.timer);
    coalesceTimers.delete(blockId);
  }
  pendingAfterInflight.delete(blockId);
  recomputePending();

  const evalId = logTrigger("block-removed", blockId);
  if (import.meta.env.DEV) harness.emit("block-removed", { block: blockId });

  // Orphan claims — no LLM call needed
  await orphanClaimsForBlock(blockId);
  await deleteBlockSummary(blockId);

  // Auto-close all observations anchored to or conflicting with this block
  const active = await loadActiveObservationsForDocument(ctx.docId);
  const toClose = active.filter((o) => o.blockId === blockId || o.conflictingBlockId === blockId);
  await Promise.all(
    toClose.map(async (o) => {
      await updateObservationStatus(o.id, "auto_closed", "text_removed");
      if (import.meta.env.DEV) {
        harness.archive(
          {
            observationId: o.id,
            obsType: o.type,
            kind: o.kind,
            severity: o.severity,
            scope: o.scope,
            blockId: o.blockId,
            text: o.text,
            reason: "block_removed",
            actor: "system",
          },
          evalId
        );
      }
    })
  );

  onComplete?.();
}

async function dispatch(
  sectionId: string,
  text: string,
  members: SectionMember[],
  ctx: EvalContext,
  triggerKind: string,
  onComplete?: () => void
): Promise<void> {
  // If in-flight, queue a re-run with the latest data
  if (inFlightSections.has(sectionId)) {
    pendingAfterInflight.set(sectionId, { text, members, ctx, triggerKind: "rerun", onComplete });
    recomputePending();
    return;
  }

  // Second engine gate, at the fire site. `scheduleEval` stops new work from being
  // ARMED; this stops already-armed work from FIRING after the user switched engines
  // mid-flight — a coalesce timer or the drain below can re-enter here without
  // passing the arming gate again.
  if (!isBuiltinEngineActive()) {
    onComplete?.();
    return;
  }

  inFlightSections.add(sectionId);
  recomputePending();
  const evalId = logTrigger(triggerKind, sectionId);
  if (import.meta.env.DEV) harness.emit("settle", { trigger: triggerKind, sectionId });

  // Capture the section's generation at dispatch time. If a block-removed bumps
  // it while this eval is in flight, isLive() goes false and evaluateSection
  // skips its post-LLM writes (L4).
  const startGeneration = sectionEvalGeneration.get(sectionId) ?? 0;
  const isLive = () => (sectionEvalGeneration.get(sectionId) ?? 0) === startGeneration;

  try {
    await evaluateSection(
      ctx.docId,
      sectionId,
      text,
      members,
      ctx.stage,
      ctx.apiKey,
      ctx.paidKey,
      ctx.jargonAllowlist,
      ctx.skipContradiction,
      evalId,
      ctx.capability,
      isLive,
      ctx.onStageSuggestion
    );
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
      dispatch(
        sectionId,
        pending.text,
        pending.members,
        pending.ctx,
        pending.triggerKind,
        pending.onComplete
      );
    } else {
      recomputePending();
      // Once the last in-flight section finishes, pick up any queued doc-idle.
      // This is the partner to the "defer if sections in flight" check in
      // handleDocIdle — together they ensure the doc-level strong call never
      // overlaps a section's contradiction strong call (OBS-020).
      // Only once every section eval has both drained its coalesce window and
      // finished in-flight — otherwise the strong pass could slip through a
      // transient inFlightSections===0 gap between two coalesced dispatches.
      if (inFlightSections.size === 0 && coalesceTimers.size === 0 && pendingDocIdle) {
        const pd = pendingDocIdle;
        pendingDocIdle = null;
        handleDocIdle(pd.ctx, pd.onComplete);
      }
      // Same drain for the bootstrap sweep: it must see the fully-populated
      // ledger, so it waits for every pasted section's fast eval to finish.
      if (inFlightSections.size === 0 && coalesceTimers.size === 0 && pendingBootstrapSweep) {
        const pb = pendingBootstrapSweep;
        pendingBootstrapSweep = null;
        handleBootstrapSweep(pb.ctx, pb.onComplete);
      }
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

  // Serialise with in-flight section evals: each section eval fires a strong
  // contradiction call. If we start a doc-level strong call simultaneously, the
  // user burns two paid invocations per settle. Queue the doc-idle and let
  // dispatch's finally block trigger it once the last in-flight section
  // finishes (OBS-020).
  // ...including section evals still in their coalesce window: they haven't
  // entered inFlightSections yet, but they're about to write claims, so a
  // strong doc-level call must wait for them too (else it reads a stale ledger).
  if (inFlightSections.size > 0 || coalesceTimers.size > 0) {
    pendingDocIdle = { ctx, onComplete };
    recomputePending();
    return;
  }

  // Engine gate at the fire site: a doc-idle deferred for RPM re-enters here 30s
  // later via setTimeout, long enough for the user to have switched to their agent
  // in between. Firing then would burn the strong call they just opted out of.
  if (!isBuiltinEngineActive()) {
    onComplete?.();
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
  const evalId = logTrigger("doc-idle", "");
  if (import.meta.env.DEV) harness.emit("settle", { trigger: "doc-idle" });

  try {
    await evaluateDocument(
      ctx.docId,
      ctx.stage,
      ctx.apiKey,
      ctx.onStageSuggestion,
      ctx.paidKey,
      evalId,
      ctx.capability,
      ctx.maturity,
      ctx.singleSectionText
    );
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

/**
 * Bootstrap contradiction sweep (block-paste trigger). Mirrors handleDocIdle's
 * serialisation: it must run against the fully-populated ledger, so it defers
 * until every in-flight section eval (the per-section fast calls fired by the
 * same paste) has finished. Also defers under RPM backpressure — like doc-idle,
 * a single strong call that can wait. See docs/projects/bulk_paste_evaluation.md.
 */
async function handleBootstrapSweep(ctx: EvalContext, onComplete?: () => void): Promise<void> {
  if (bootstrapSweepInFlight) {
    pendingBootstrapSweep = { ctx, onComplete };
    recomputePending();
    return;
  }

  // Wait for the paste's section evals to populate the ledger first — including
  // those still in the coalesce window. On a bulk paste/import the section evals
  // and this sweep are scheduled in the same tick, so the sections are queued in
  // coalesceTimers (not yet inFlightSections); without this the sweep would read
  // an empty ledger and find nothing (the import contradiction-sweep race).
  if (inFlightSections.size > 0 || coalesceTimers.size > 0) {
    pendingBootstrapSweep = { ctx, onComplete };
    recomputePending();
    return;
  }

  // Engine gate at the fire site — same 30s deferral window as doc-idle above.
  if (!isBuiltinEngineActive()) {
    onComplete?.();
    return;
  }

  if (isNearLimit()) {
    if (import.meta.env.DEV) {
      harness.emit("settle", { trigger: "bootstrap-sweep-deferred", reason: "rpm-limit" });
    }
    setTimeout(() => handleBootstrapSweep(ctx, onComplete), DOC_IDLE_RPM_DEFER_MS);
    return;
  }

  bootstrapSweepInFlight = true;
  recomputePending();
  const evalId = logTrigger("bootstrap-sweep", "");
  if (import.meta.env.DEV) harness.emit("settle", { trigger: "bootstrap-sweep" });

  try {
    await evaluateLedgerContradictions(
      ctx.docId,
      ctx.stage,
      ctx.apiKey,
      ctx.paidKey,
      evalId,
      ctx.capability
    );
  } catch (err) {
    console.error("[orchestrator] evaluateLedgerContradictions threw:", err);
  } finally {
    bootstrapSweepInFlight = false;
    onComplete?.();

    const pending = pendingBootstrapSweep;
    if (pending) {
      pendingBootstrapSweep = null;
      recomputePending();
      handleBootstrapSweep(pending.ctx, pending.onComplete);
    } else {
      recomputePending();
    }
  }
}

async function handleStageChanged(
  previousStage: string,
  ctx: EvalContext,
  onComplete?: () => void
): Promise<void> {
  logTrigger("stage-changed", "");
  if (import.meta.env.DEV) harness.emit("settle", { trigger: "stage-changed" });

  const isNoneToSuggested = previousStage.trim() === "";

  if (isNoneToSuggested) {
    // Case 1: Auto-applied none -> suggested transition.
    // The content hasn't changed. We skip the wipe entirely, and do not immediately re-run
    // because the existing observations were just graded against this content. The next
    // natural doc-idle will reconcile them resolution-aware.
    onComplete?.();
    return;
  }

  // Case 2: Genuine hand-edited stage change.
  // Instead of superseding everything blindly, we run handleDocIdle. The underlying
  // evaluateDocument call will load the existing active doc-scope notes as priors,
  // and run resolution-aware reconciliation (keeping still-true critiques by id, closing resolved).
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
  onComplete?: () => void
): void {
  if (trigger.kind === "block-removed") {
    handleBlockRemoved(trigger.blockId, ctx, onComplete);
    return;
  }

  // ABOVE the engine gate, and that placement is the whole fix for UX-033: the
  // document settling is a fact about the document, not about whether writtten
  // intends to evaluate it. A connected agent needs the fact; the built-in
  // evaluator standing down must not suppress it.
  //
  // Fires regardless of `text`: an emptied section still changed the document,
  // and the subscriber re-reads it rather than trusting a payload.
  if (
    trigger.kind === "block-settle-pause" ||
    trigger.kind === "block-settle-completion" ||
    trigger.kind === "block-settle-blur"
  ) {
    armDocSettleNotice(trigger.sectionId);
  }

  // Engine exclusivity: the built-in evaluator only arms when it holds the slot
  // (`docs/projects/agent_connected_eval.md` § Engine exclusivity). A key and a
  // connected agent are two ways to get model access, not two sources — running
  // both would bill the user twice for observations competing over one feed budget.
  //
  // `block-removed` sits ABOVE this line deliberately: it fires no LLM call, and a
  // card anchored to a deleted block is dead whoever wrote it (the one auto-close
  // that is not an evaluator judgement — see `isEvaluatorOwned` in
  // evaluatorReconcile.ts). Gating it would strand agent-era cards on deleted blocks.
  //
  // Gating here rather than deeper also keeps the readout honest: no coalesce timer
  // is created, so `recomputePending()` stays at 0 and the activity dot rests instead
  // of pulsing "evaluating · 1" for work that will never run.
  if (!isBuiltinEngineActive()) {
    // Callers treat this as "the scheduled work finished" — App's completion handler
    // retires the welcome modal off it. Same contract the keyless path already has,
    // where evaluateSection returns early and dispatch's `finally` still fires.
    onComplete?.();
    return;
  }

  if (trigger.kind === "doc-idle") {
    handleDocIdle(ctx, onComplete);
    return;
  }

  if (trigger.kind === "stage-changed") {
    handleStageChanged(trigger.previousStage, ctx, onComplete);
    return;
  }

  if (trigger.kind === "block-paste") {
    // Bulk paste / import bootstrap: the editor has already dispatched a
    // fast-tier eval per pasted section; this runs the single ledger-internal
    // contradiction sweep once those drain. See bulk_paste_evaluation.md.
    handleBootstrapSweep(ctx, onComplete);
    return;
  }

  // block-settle-pause | block-settle-completion | block-settle-blur (section-keyed)
  if (!text) return;
  const { sectionId, members } = trigger;
  const triggerKind =
    trigger.kind === "block-settle-pause"
      ? "settle-pause"
      : trigger.kind === "block-settle-completion"
        ? "settle-completion"
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
