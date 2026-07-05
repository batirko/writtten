// ---------------------------------------------------------------------------
// Observation reconciliation — dedupe / supersede / auto-close / insert.
//
// These functions read from and write to the DB, so they are the "impure"
// layer separated out from the pure anchoring and prompt modules. Follows
// the seam proved by docReconcile.ts — planDocReconciliation() is the pure
// planner injected here, keeping the DB-interleaved logic visible and
// independently testable.
//
// See docs/projects/message_generation_workflow.md §7
// ---------------------------------------------------------------------------

import { nanoid } from "nanoid";
import { harness } from "../debug/harness";
import { type ArchiveInfo } from "../model/logger";
import {
  saveObservation,
  loadActiveObservationsForDocument,
  updateObservationStatus,
  loadSuppressionsForDocument,
  type DismissalSuppression,
  type Observation,
} from "../store/db";
import { planDocReconciliation } from "./docReconcile";
import { type ModelCapability } from "../model/capability";
import {
  normalizeText,
  spanSig,
  contentSig,
  textSimilarity,
  spansOverlap,
  conflictPairKey,
  type NewObservation,
} from "./evaluatorAnchoring";

/** Record a system-driven observation closure in the debug log (dev-only).
 *  Mirrors the user-driven archives emitted from App.tsx, so the log shows every
 *  status transition with its actor + reason. See docs/projects/debug_log.md.
 *  Exported for reuse by evaluator.ts's snapshot-restore path (Mechanism 2,
 *  revert_aware_evaluation.md), which closes stray observations the same way
 *  the normal reconciler does. */
export function archiveObs(
  o: Observation,
  reason: ArchiveInfo["reason"],
  evalId?: string,
  supersededBy?: string
): void {
  if (!import.meta.env.DEV) return;
  harness.archive(
    {
      observationId: o.id,
      obsType: o.type,
      kind: o.kind,
      severity: o.severity,
      scope: o.scope,
      blockId: o.blockId,
      text: o.text,
      reason,
      actor: "system",
      supersededBy,
    },
    evalId
  );
}

// ---------------------------------------------------------------------------
// Suppression check
// ---------------------------------------------------------------------------

export function isSpanSuppressed(newO: NewObservation, suppressions: DismissalSuppression[]): boolean {
  const spanKey =
    newO.blockId != null
      ? `${newO.blockId}:${newO.startOffset ?? ""}:${newO.endOffset ?? ""}`
      : undefined;
  const isConflict = newO.type === "contradiction" || newO.type === "strategic_tension";
  const newAnchorNorm = newO.anchorText ? normalizeText(newO.anchorText) : "";
  return suppressions.some((s) => {
    if (s.type !== newO.type) return false;

    // G1: Flattery-resistant dismissal
    // High-severity observations and critical defects are span-only suppressions.
    // Low/medium severity observations are category-wide.
    const isSpanOnly =
      s.severity === "high" || s.type === "contradiction" || s.type === "unsupported_claim";

    if (!isSpanOnly) {
      // Category-wide suppression for this document
      return true;
    }

    // L5 — match by content identity, with the offset signature as fallback so
    // legacy suppressions (and observations without anchor text) still work.
    if (isConflict) {
      // Conflicts are identified by their (order-independent) block pair, which
      // is offset-free — so a dismissal holds whether the pair is re-emitted by
      // the per-section path (precise offsets) or the ledger sweep (0:9999).
      if (s.conflictPairKey) return s.conflictPairKey === conflictPairKey(newO);
      return s.spanSignature != null && s.spanSignature === spanKey;
    }

    // Span observations (clarity / unsupported_claim / undefined_jargon): match
    // on (blockId + normalized anchor text) so the dismissal survives edits that
    // shift offsets. blockId keeps it precise (the same phrase in another block
    // is a genuinely different span). blockId is recovered from the suppression's
    // spanSignature ("blockId:start:end").
    if (s.anchorText && s.anchorText.trim() && newAnchorNorm) {
      const suppressedBlockId = s.spanSignature?.split(":")[0];
      return (
        suppressedBlockId != null &&
        suppressedBlockId === newO.blockId &&
        normalizeText(s.anchorText) === newAnchorNorm
      );
    }
    return s.spanSignature != null && s.spanSignature === spanKey;
  });
}

// ---------------------------------------------------------------------------
// Section-scope reconciler
// ---------------------------------------------------------------------------

/**
 * Compare the freshly-computed set of observations for a block against what is
 * already active in the DB, then apply the decision table:
 *
 *   same (type + span + text)  → dedupe  (keep existing id)
 *   same type + overlapping span, different text → supersede old, insert new
 *   new type / new span        → insert
 *   existing with no new match → auto_close
 *
 * This replaces the old blanket "close everything, re-insert" approach that
 * caused observation flicker and broke dismissal suppression.
 */
export async function reconcileObservations(
  docId: string,
  memberBlockIds: string[],
  newObs: NewObservation[],
  /** Observation ids the model explicitly confirmed are resolved. Force-closed
   *  before the normal step-4 orphan pass so they aren't re-inserted. */
  resolvedPriorIds: ReadonlySet<string> = new Set(),
  evalId?: string
): Promise<void> {
  const [allActive, suppressions] = await Promise.all([
    loadActiveObservationsForDocument(docId),
    loadSuppressionsForDocument(docId),
  ]);
  // A section eval reconciles every observation anchored to one of its member
  // blocks — not just a single block. Keep the section keyed by representative
  // id in memberBlockIds so contradictions (anchored there) reconcile too.
  const memberSet = new Set(memberBlockIds);
  const existing = allActive.filter((o) => o.blockId != null && memberSet.has(o.blockId));
  const matchedExistingIds = new Set<string>();
  // Tracks content signatures already kept/inserted this pass, so two new
  // observations that say the same thing (or one that duplicates a kept
  // existing one at a different offset) collapse to a single card.
  const seenContent = new Set<string>();
  // L5c: conflict types are deduped by their (offset-free) block-pair key, so
  // they coalesce across the per-section and ledger-sweep paths.
  const seenPairKeys = new Set<string>();

  // 0-pre. Force-close any observation the model explicitly confirmed resolved.
  // This happens before the normal loop so the force-closed obs are already
  // matched and won't be re-inserted via content-sig dedup (OBS-021).
  for (const obs of existing) {
    if (resolvedPriorIds.has(obs.id)) {
      await updateObservationStatus(obs.id, "auto_closed", "resolved_prior");
      archiveObs(obs, "resolved_prior", evalId);
      matchedExistingIds.add(obs.id);
    }
  }

  for (const newO of newObs) {
    // Suppression check — never re-insert a dismissed span
    if (isSpanSuppressed(newO, suppressions)) continue;

    // L5c: contradictions / strategic_tension are identified by their
    // order-independent block pair (offset-free), the same key the ledger sweep
    // uses. Matching on it (instead of contentSig/spanSig) means a per-section
    // emission and the sweep's re-emission of the same conflict coalesce into a
    // single card — and a re-emission with reworded text keeps the existing
    // record (id + wording frozen, no flicker), preserving any sweep grace
    // state (missCount/lastSeenAt) on it.
    if (newO.type === "contradiction" || newO.type === "strategic_tension") {
      const pk = conflictPairKey(newO);
      if (seenPairKeys.has(pk)) continue; // in-batch dupe
      const pairMatch = existing.find(
        (e) =>
          (e.type === "contradiction" || e.type === "strategic_tension") &&
          conflictPairKey(e) === pk &&
          !matchedExistingIds.has(e.id)
      );
      if (pairMatch) {
        matchedExistingIds.add(pairMatch.id);
        seenPairKeys.add(pk);
        continue;
      }
      await saveObservation({ id: nanoid(10), docId, status: "active", ...newO });
      seenPairKeys.add(pk);
      if (import.meta.env.DEV) {
        const blockIds = [newO.blockId, newO.conflictingBlockId].filter(Boolean);
        harness.emit("observation", { type: newO.type, blocks: blockIds });
      }
      continue;
    }

    const csig = contentSig(newO);
    // Already kept/inserted an equivalent observation in this batch → drop dupe.
    if (seenContent.has(csig)) continue;

    // 0. Content match against an existing active obs → dedupe: keep it as-is
    //    even if its offsets drifted slightly. Prevents duplicate cards.
    const contentMatch = existing.find(
      (e) => !matchedExistingIds.has(e.id) && contentSig(e) === csig
    );
    if (contentMatch) {
      matchedExistingIds.add(contentMatch.id);
      seenContent.add(csig);
      continue;
    }

    const newSig = spanSig(newO);

    // 1. Exact match → dedupe: keep the existing record untouched
    const exactMatch = existing.find(
      (e) =>
        spanSig(e) === newSig &&
        normalizeText(e.text) === normalizeText(newO.text) &&
        !matchedExistingIds.has(e.id)
    );
    if (exactMatch) {
      matchedExistingIds.add(exactMatch.id);
      seenContent.add(csig);
      continue;
    }

    // 2. Same type + overlapping span, different text → supersede old, insert new
    const newId = nanoid(10);
    const supersedable = existing.find(
      (e) => e.type === newO.type && spansOverlap(e, newO) && !matchedExistingIds.has(e.id)
    );
    if (supersedable) {
      await updateObservationStatus(supersedable.id, "superseded", "superseded");
      archiveObs(supersedable, "superseded", evalId, newId);
      matchedExistingIds.add(supersedable.id);
    }

    // 3. Insert new observation
    await saveObservation({
      id: newId,
      docId,
      status: "active",
      ...newO,
    });
    seenContent.add(csig);
    if (import.meta.env.DEV) {
      const blockIds = [newO.blockId, newO.conflictingBlockId].filter(Boolean);
      harness.emit("observation", { type: newO.type, blocks: blockIds });
    }
  }

  // 4. Auto-close existing observations that have no counterpart in the new set.
  // All entries in `existing` are pre-filtered to memberBlockIds (see the filter
  // above), so closureReason is always "resolved_by_edit" — "text_removed" is
  // unreachable here (L6 dead-code removal).
  for (const e of existing) {
    if (!matchedExistingIds.has(e.id)) {
      await updateObservationStatus(e.id, "auto_closed", "resolved_by_edit");
      archiveObs(e, "auto_closed", evalId);
    }
  }
}

// ---------------------------------------------------------------------------
// Document-scope reconciler
// ---------------------------------------------------------------------------

/** Consecutive doc-idle runs a doc-scope observation may be absent from the
 *  regenerated set before it is auto-closed. Absorbs LLM sampling variance so a
 *  still-true note isn't dropped the first time the model forgets to re-emit it.
 *  See docs/projects/doc_scope_reconciliation.md (D4 — starting policy). */
const DOC_GRACE_THRESHOLD = 2;

/** Floor similarity for treating two doc-scope notes as "the same note" (D6).
 *  Inherited from the OBS-012 dedupe threshold. */
const DOC_DEDUPE_FLOOR = 0.6;

/**
 * Reconcile freshly-regenerated document-scope observations against the active
 * set. Unlike the old type-bucketed positional supersession, this pairs each
 * incoming note to the existing note it is most *similar* to (best-match, via
 * `planDocReconciliation`), and applies an absence grace period before closing
 * orphans — so stable notes keep their ids (no flicker), the archive trail is
 * honest (no false `superseded` links), and a single stochastic omission no
 * longer drops a still-true note. See docs/projects/doc_scope_reconciliation.md.
 */
export async function reconcileDocumentObservations(
  docId: string,
  newObs: NewObservation[],
  evalId?: string,
  opts?: { resolvedPriorIds?: Set<string>; persistIds?: Set<string> }
): Promise<void> {
  const [allActive, suppressions] = await Promise.all([
    loadActiveObservationsForDocument(docId),
    loadSuppressionsForDocument(docId),
  ]);
  const existing = allActive.filter((o) => o.scope === "document");

  // Doc-level suppression is keyed on type alone (no spanSignature). Drop any
  // incoming note whose type the user has muted before planning.
  const incoming = newObs.filter(
    (o) => !suppressions.some((s) => s.type === o.type && !s.spanSignature)
  );

  const { resolvedPriorIds = new Set<string>(), persistIds = new Set<string>() } = opts ?? {};
  const now = Date.now();

  // Pass 0-pre (paid tier): model-confirmed resolutions → force-close now.
  // Mirrors section-eval's resolved_prior handling at line ~853.
  const modelResolved = new Set<string>();
  for (const e of existing) {
    if (resolvedPriorIds.has(e.id)) {
      await updateObservationStatus(e.id, "auto_closed", "resolved_prior");
      archiveObs(e, "resolved_prior", evalId);
      modelResolved.add(e.id);
    }
  }

  // Pass 1 (paid tier): persists — the model confirmed the note still holds
  // (possibly rephrased). Keep the existing card (id + frozen text); reset the
  // absence counter so it never ages toward closure.
  const modelPersisted = new Set<string>();
  for (const e of existing) {
    if (modelResolved.has(e.id)) continue;
    if (persistIds.has(e.id)) {
      await saveObservation({ ...e, missCount: 0, lastSeenAt: now });
      modelPersisted.add(e.id);
    }
  }

  // Pass 2: lexical best-match fallback over the remaining unmatched existing
  // notes vs the newObs that had no priorId mapping (or free tier: all of them).
  const remainingExisting = existing.filter(
    (e) => !modelResolved.has(e.id) && !modelPersisted.has(e.id)
  );
  const plan = planDocReconciliation(remainingExisting, incoming, textSimilarity, DOC_DEDUPE_FLOOR);

  // Matched → keep the existing record (and its id); reset the absence counter
  // so a re-confirmed note never ages toward closure. Wording is intentionally
  // frozen (D5 default): we keep the existing text, not the rephrase.
  for (const { existingId } of plan.dedupes) {
    const ex = remainingExisting.find((e) => e.id === existingId);
    if (ex) await saveObservation({ ...ex, missCount: 0, lastSeenAt: now });
  }

  // Genuinely new → insert active.
  for (const inc of plan.inserts) {
    await saveObservation({
      ...inc,
      id: nanoid(10),
      docId,
      status: "active",
      missCount: 0,
      lastSeenAt: now,
    });
    if (import.meta.env.DEV) {
      harness.emit("observation", { type: inc.type, blocks: [] });
    }
  }

  // Orphaned → apply the grace period: only close once a note has been absent
  // for DOC_GRACE_THRESHOLD consecutive runs; otherwise bump its counter and
  // leave it active. Closures are honestly labelled `auto_closed` (never a
  // positional `superseded`).
  for (const e of plan.orphans) {
    const miss = (e.missCount ?? 0) + 1;
    if (miss >= DOC_GRACE_THRESHOLD) {
      await updateObservationStatus(e.id, "auto_closed", "resolved_by_edit");
      archiveObs(e, "auto_closed", evalId);
    } else {
      await saveObservation({ ...e, missCount: miss });
    }
  }
}

// ---------------------------------------------------------------------------
// Sweep reconciler (bootstrap contradiction sweep)
// ---------------------------------------------------------------------------

/**
 * Reconcile sweep contradictions against the active set.
 *
 * **Weak model (`!capability.driveResolution`):** additive only — insert new
 * conflict-pairs, never close existing ones. Safe to re-run; won't disturb
 * per-section contradictions. A weak model could drop a real conflict on a
 * stochastic miss, so it is not trusted to drive closures.
 *
 * **Strong model (`capability.driveResolution`):** authoritative-with-grace —
 * the sweep is treated as the full all-pairs authority. A conflict the sweep no
 * longer emits is an orphan; it ages out via DOC_GRACE_THRESHOLD consecutive
 * misses before being auto_closed. A re-emitted pair resets its missCount. This
 * makes stale contradiction/strategic_tension notes close when the underlying
 * claims change, without being brittle to single stochastic omissions.
 */
export async function reconcileSweepContradictions(
  docId: string,
  newObs: NewObservation[],
  capability: ModelCapability,
  evalId?: string
): Promise<void> {
  const [allActive, suppressions] = await Promise.all([
    loadActiveObservationsForDocument(docId),
    loadSuppressionsForDocument(docId),
  ]);
  const existingConflicts = allActive.filter(
    (o) => o.type === "contradiction" || o.type === "strategic_tension"
  );

  // OBS-025: collapse near-identical strategic_tension observations via text similarity.
  // Two sections can express the same intent, producing near-duplicate tensions with
  // different conflictPairKeys that the key-based check below would miss.
  const existingTensions = existingConflicts.filter((o) => o.type === "strategic_tension");
  const incomingTensions = newObs.filter((o) => o.type === "strategic_tension");
  const tensionPlan = planDocReconciliation(
    existingTensions,
    incomingTensions,
    textSimilarity,
    DOC_DEDUPE_FLOOR
  );
  // Existing tensions matched by text similarity are "virtually re-emitted" so they
  // stay alive without accumulating grace misses.
  const virtuallyReemittedIds = new Set(tensionPlan.dedupes.map((d) => d.existingId));
  // Only genuinely novel tensions proceed to the insert loop.
  const dedupedNewObs: NewObservation[] = [
    ...newObs.filter((o) => o.type !== "strategic_tension"),
    ...(tensionPlan.inserts as NewObservation[]),
  ];

  if (capability.driveResolution) {
    // Authoritative-with-grace: sweep output is the source of truth.
    const now = Date.now();
    const newKeys = new Set(newObs.map(conflictPairKey));
    const insertedKeys = new Set<string>();

    for (const ex of existingConflicts) {
      const key = conflictPairKey(ex);
      if (newKeys.has(key) || virtuallyReemittedIds.has(ex.id)) {
        // Re-emitted → still active; reset absence counter.
        await saveObservation({ ...ex, missCount: 0, lastSeenAt: now });
        insertedKeys.add(key); // suppress re-insert below
      } else {
        // Absent → bump grace counter; close if threshold reached.
        const miss = (ex.missCount ?? 0) + 1;
        if (miss >= DOC_GRACE_THRESHOLD) {
          await updateObservationStatus(ex.id, "auto_closed", "resolved_by_edit");
          archiveObs(ex, "auto_closed", evalId);
        } else {
          await saveObservation({ ...ex, missCount: miss });
        }
      }
    }

    // Insert genuinely new conflict-pairs (not already present, not suppressed).
    for (const newO of dedupedNewObs) {
      const key = conflictPairKey(newO);
      if (insertedKeys.has(key)) continue;
      if (isSpanSuppressed(newO, suppressions)) continue;
      await saveObservation({
        id: nanoid(10),
        docId,
        status: "active",
        missCount: 0,
        lastSeenAt: now,
        ...newO,
      });
      if (import.meta.env.DEV) {
        const blocks = [newO.blockId, newO.conflictingBlockId].filter(Boolean);
        harness.emit("observation", { type: newO.type, blocks });
      }
    }
  } else {
    // Weak model: additive only (original behavior).
    const existingKeys = new Set(existingConflicts.map(conflictPairKey));
    for (const newO of dedupedNewObs) {
      const key = conflictPairKey(newO);
      if (existingKeys.has(key)) continue;
      if (isSpanSuppressed(newO, suppressions)) continue;
      await saveObservation({ id: nanoid(10), docId, status: "active", ...newO });
      existingKeys.add(key);
      if (import.meta.env.DEV) {
        const blocks = [newO.blockId, newO.conflictingBlockId].filter(Boolean);
        harness.emit("observation", { type: newO.type, blocks });
      }
    }
  }
}

