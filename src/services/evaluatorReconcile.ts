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
import { computePriority, docGapKind } from "./priority";
import { type MaturityLevel } from "./documentMaturity";
import {
  normalizeText,
  spanSig,
  contentSig,
  textSimilarity,
  spansOverlap,
  conflictPairKey,
  blockPairKey,
  type NewObservation,
} from "./evaluatorAnchoring";

/** Cross-claim observation types (a `contradiction` or a `strategic_tension`). Their
 *  identity is the order-independent block pair, and their edit-time close/keep/re-anchor
 *  is owned by `reconcileConflictCardsOnEdit`, not the span-card decision table. */
export function isConflictType(t: Observation["type"]): boolean {
  return t === "contradiction" || t === "strategic_tension";
}

/** Injected strong-tier "do these two claims still conflict?" adjudication (the B call).
 *  Kept as a callback so the DB-only reconcile module never imports the model router;
 *  `evaluateSection` builds it from `router.strong` + `CONTRADICTION_SYSTEM_PROMPT`, and
 *  unit tests inject a stub. Returns true when the reworded pair still conflicts. */
export type ConfirmConflictFn = (
  newClaimText: string,
  existingClaimText: string
) => Promise<boolean>;

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
  // Every active observation primary-anchored to one of this section's member blocks.
  // Superset used by the resolved_prior 0-pre close (which mirrors the fast model's
  // confirmation over prior span obs, conflicts included).
  const memberAnchored = allActive.filter((o) => o.blockId != null && memberSet.has(o.blockId));
  // Conflict cards (contradiction / strategic_tension) LEAVE the span-card decision
  // table: their edit-time close/keep/re-anchor is owned by reconcileConflictCardsOnEdit
  // (either side, grace/B). Excluding them from `existing` keeps step 4's blanket close —
  // which has no grace and only sees the primary anchor — from false-closing a still-valid
  // conflict whose pair merely wasn't re-emitted this settle.
  const existing = memberAnchored.filter((o) => !isConflictType(o.type));
  const matchedExistingIds = new Set<string>();
  // Tracks content signatures already kept/inserted this pass, so two new
  // observations that say the same thing (or one that duplicates a kept
  // existing one at a different offset) collapse to a single card.
  const seenContent = new Set<string>();
  // L5c: conflict types are deduped by their (offset-free) block-pair key, so
  // they coalesce across the per-section and ledger-sweep paths.
  const seenPairKeys = new Set<string>();
  // Cross-type precedence: a strategic_tension yields to a contradiction on the
  // same block pair. Seed from ALL active contradictions (not just this section's)
  // so an incoming tension is dropped whenever any section already carries the
  // covering contradiction. The sweep reconciler supersedes existing tensions.
  const contraPairs = new Set<string>();
  for (const e of allActive) if (e.type === "contradiction") contraPairs.add(blockPairKey(e));
  for (const o of newObs) if (o.type === "contradiction") contraPairs.add(blockPairKey(o));

  // 0-pre. Force-close any observation the model explicitly confirmed resolved.
  // This happens before the normal loop so the force-closed obs are already
  // matched and won't be re-inserted via content-sig dedup (OBS-021). Iterates the
  // member-anchored superset (incl. conflicts) so a conflict card the fast model
  // confirms resolved still closes here, as before.
  for (const obs of memberAnchored) {
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
      // A contradiction outranks a tension on the same block pair — drop the tension.
      if (newO.type === "strategic_tension" && contraPairs.has(blockPairKey(newO))) continue;
      // Coalesce against ALL active conflicts, not just this section's primary-anchored
      // ones: a re-emitted pair whose existing card is anchored primary-side in ANOTHER
      // section (the secondary side sits here) must match its card, not insert a duplicate.
      const pairMatch = allActive.find(
        (e) => isConflictType(e.type) && conflictPairKey(e) === pk && !matchedExistingIds.has(e.id)
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
  opts?: { resolvedPriorIds?: Set<string>; persistIds?: Set<string>; maturity?: MaturityLevel }
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

  const {
    resolvedPriorIds = new Set<string>(),
    persistIds = new Set<string>(),
    maturity,
  } = opts ?? {};
  const now = Date.now();

  // R2 in-place promotion: a kept doc-scope gap is the *same* finding, but its
  // seriousness tracks the document's maturity. When maturity is provided,
  // re-derive kind/severity/priority so a persisting gap promotes
  // (opportunity → warning) in place — same id, frozen wording (D5), same
  // anchor — instead of churning through a supersede (the UX-012 anti-pattern).
  // Undefined maturity (legacy path) freezes every field as before.
  const restamp = (e: Observation): Observation => {
    if (maturity === undefined) return e;
    const kind = docGapKind(e.type, maturity);
    const { severity, priority } = computePriority({ type: e.type, maturity });
    return { ...e, kind, severity, priority };
  };

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
      await saveObservation({ ...restamp(e), missCount: 0, lastSeenAt: now });
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
    if (ex) await saveObservation({ ...restamp(ex), missCount: 0, lastSeenAt: now });
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

  // Cross-type precedence: a contradiction outranks a strategic_tension on the
  // same block pair (the same conflict, more sharply stated). Drop incoming
  // tensions whose pair carries a contradiction (incoming or existing), and
  // supersede any existing tension a contradiction now covers so it doesn't
  // linger as a duplicate card.
  const contraPairs = new Set<string>();
  for (const o of dedupedNewObs) if (o.type === "contradiction") contraPairs.add(blockPairKey(o));
  for (const o of existingConflicts)
    if (o.type === "contradiction") contraPairs.add(blockPairKey(o));

  const supersededByContra = new Set<string>();
  for (const ex of existingConflicts) {
    if (ex.type === "strategic_tension" && contraPairs.has(blockPairKey(ex))) {
      await updateObservationStatus(ex.id, "superseded", "superseded");
      archiveObs(ex, "superseded", evalId);
      supersededByContra.add(ex.id);
    }
  }

  const rankedNewObs = dedupedNewObs.filter(
    (o) => !(o.type === "strategic_tension" && contraPairs.has(blockPairKey(o)))
  );
  const rankedExisting = existingConflicts.filter((o) => !supersededByContra.has(o.id));

  if (capability.driveResolution) {
    // Authoritative-with-grace: sweep output is the source of truth.
    const now = Date.now();
    const newKeys = new Set(rankedNewObs.map(conflictPairKey));
    const insertedKeys = new Set<string>();

    for (const ex of rankedExisting) {
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
    for (const newO of rankedNewObs) {
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
    const existingKeys = new Set(rankedExisting.map(conflictPairKey));
    for (const newO of rankedNewObs) {
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

// ---------------------------------------------------------------------------
// Edit-scoped conflict-card reconciler (either-side close / keep / re-anchor)
// ---------------------------------------------------------------------------

/** Minimal shape of this settle's freshly-extracted, member-anchored claims — the
 *  fields the arm reads to judge presence and re-anchor a kept card. `evaluateSection`
 *  passes `anchorClaimsToMembers(...)` output, which is structurally compatible. */
export interface FreshClaim {
  text: string;
  anchorBlockId?: string;
  anchorStartOffset?: number;
  anchorEndOffset?: number;
  anchorQuote?: string;
}

/** One side of a conflict card whose anchor block sits in the edited section. */
interface EditedSide {
  side: "primary" | "secondary";
  blockId: string;
  /** The card's stored claim text for this side. */
  anchorText: string;
  /** Verbatim source slice, when the card anchored precisely (primary side only today). */
  anchorQuote?: string;
}

/** The conflict card's anchor sides that fall inside the edited section. */
function editedSides(card: Observation, memberSet: Set<string>): EditedSide[] {
  const sides: EditedSide[] = [];
  if (card.blockId != null && memberSet.has(card.blockId)) {
    sides.push({
      side: "primary",
      blockId: card.blockId,
      anchorText: card.anchorText ?? "",
      anchorQuote: card.anchorQuote,
    });
  }
  if (card.conflictingBlockId != null && memberSet.has(card.conflictingBlockId)) {
    sides.push({
      side: "secondary",
      blockId: card.conflictingBlockId,
      anchorText: card.conflictingAnchorText ?? "",
      // No conflictingAnchorQuote on the record — the secondary side relies on the
      // extraction/containment signals below (never on a stored verbatim quote).
    });
  }
  return sides;
}

/** Smart-immediate presence: is the edited side's claim still in the document? Only
 *  ever asserts *present* (never *gone*), so no single signal can false-close a card:
 *  a verbatim anchor still literally in the block (whiff-proof), the stored claim text
 *  literally present, or a fresh extracted claim that still resembles it (reworded but
 *  present). Absence of ALL three ⇒ genuinely gone. */
function sideClaimPresent(
  s: EditedSide,
  memberText: Map<string, string>,
  fresh: FreshClaim[]
): boolean {
  const a = normalizeText(s.anchorText);
  if (!a) return true; // no claim text to judge — conservatively keep the card
  const normBlock = normalizeText(memberText.get(s.blockId) ?? "");
  if (s.anchorQuote && normBlock.includes(normalizeText(s.anchorQuote))) return true;
  if (normBlock.includes(a)) return true;
  return fresh.some((c) => {
    const cn = normalizeText(c.text);
    return cn === a || cn.includes(a) || a.includes(cn) || textSimilarity(c.text, s.anchorText) >= DOC_DEDUPE_FLOOR;
  });
}

/** The fresh claim that best matches an edited side, used to re-anchor a B-kept card. */
function bestFreshMatch(s: EditedSide, fresh: FreshClaim[]): FreshClaim | undefined {
  const a = normalizeText(s.anchorText);
  if (!a) return undefined;
  let best: FreshClaim | undefined;
  let bestScore = 0;
  for (const c of fresh) {
    const cn = normalizeText(c.text);
    const score = cn === a ? 2 : cn.includes(a) || a.includes(cn) ? 1 : textSimilarity(c.text, s.anchorText);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= DOC_DEDUPE_FLOOR ? best : undefined;
}

/** Move the edited side's anchor onto the reworded claim; freeze the card message. */
function reanchorEditedSide(
  card: Observation,
  side: "primary" | "secondary",
  fresh: FreshClaim | undefined,
  now: number
): Observation {
  const base: Observation = { ...card, missCount: 0, lastSeenAt: now };
  if (!fresh || fresh.anchorBlockId == null) return base; // nothing better to point at
  if (side === "primary") {
    return {
      ...base,
      blockId: fresh.anchorBlockId,
      startOffset: fresh.anchorStartOffset ?? 0,
      endOffset: fresh.anchorEndOffset ?? 9999,
      anchorText: fresh.text,
      anchorQuote: fresh.anchorQuote,
    };
  }
  return {
    ...base,
    conflictingBlockId: fresh.anchorBlockId,
    conflictingStartOffset: fresh.anchorStartOffset ?? 0,
    conflictingEndOffset: fresh.anchorEndOffset ?? 9999,
    conflictingAnchorText: fresh.text,
  };
}

/**
 * Edit-scoped re-verification of the conflict cards an edit touched — the resolution
 * counterpart to the detection-side per-section contradiction check. Runs on every
 * section settle (after `reconcileObservations`), NOT a ledger sweep (invariant #3).
 *
 * For each active `contradiction`/`strategic_tension` touching a member block on EITHER
 * side (mirroring `handleBlockRemoved`):
 *   - re-emitted this settle (`freshPairKeys`)  → keep, reset grace;
 *   - edited-side claim gone from the document  → close immediately (smart-immediate);
 *   - present but not re-emitted (reworded/ambiguous) → one strong 2-claim confirm (B),
 *     capped at one card per settle and skipped on the weak tier; the rest age out via
 *     the shared absence grace.
 *
 * See docs/projects/contradiction_resolution.md § Build spec.
 */
export async function reconcileConflictCardsOnEdit(
  docId: string,
  members: { blockId: string; text: string }[],
  extractedClaims: FreshClaim[],
  freshPairKeys: ReadonlySet<string>,
  capability: ModelCapability,
  confirmConflict: ConfirmConflictFn | undefined,
  evalId?: string,
  isLive: () => boolean = () => true
): Promise<void> {
  const memberSet = new Set(members.map((m) => m.blockId));
  const memberText = new Map(members.map((m) => [m.blockId, m.text] as const));
  const allActive = await loadActiveObservationsForDocument(docId);
  if (!isLive()) return; // a block-removed during the load already closed these cards
  const relevant = allActive.filter(
    (o) =>
      isConflictType(o.type) &&
      ((o.blockId != null && memberSet.has(o.blockId)) ||
        (o.conflictingBlockId != null && memberSet.has(o.conflictingBlockId)))
  );
  if (relevant.length === 0) return;

  const now = Date.now();
  const ambiguous: {
    card: Observation;
    editedSide: "primary" | "secondary";
    newText: string;
    existingText: string;
    freshMatch?: FreshClaim;
  }[] = [];

  for (const card of relevant) {
    // Re-emitted this settle → still conflicts → keep, reset the absence counter.
    // Only write when there is grace to clear, so a steadily-re-emitted conflict
    // (the common case) costs no redundant DB write per settle.
    if (freshPairKeys.has(conflictPairKey(card))) {
      if ((card.missCount ?? 0) !== 0) {
        await saveObservation({ ...card, missCount: 0, lastSeenAt: now });
      }
      continue;
    }

    const sides = editedSides(card, memberSet);
    // A conflict needs both claims: if ANY edited side's claim is genuinely gone from
    // the document, the conflict is resolved → close immediately (no grace wait).
    if (sides.some((s) => !sideClaimPresent(s, memberText, extractedClaims))) {
      await updateObservationStatus(card.id, "auto_closed", "resolved_by_edit");
      archiveObs(card, "auto_closed", evalId);
      continue;
    }

    // Present but not re-emitted → ambiguous. Re-confirm the edited side against the
    // other side's frozen text. Prefer the primary anchor as the "new" side.
    const s = sides.find((x) => x.side === "primary") ?? sides[0];
    const existingText = (s.side === "primary" ? card.conflictingAnchorText : card.anchorText) ?? "";
    const freshMatch = bestFreshMatch(s, extractedClaims);
    ambiguous.push({
      card,
      editedSide: s.side,
      newText: freshMatch?.text ?? s.anchorText,
      existingText,
      freshMatch,
    });
  }

  if (ambiguous.length === 0) return;

  // B — at most one targeted 2-claim confirm per settle (strong tier only), on the
  // highest-priority ambiguous card; the rest take the grace path this settle.
  const bTarget =
    capability.adjudicateConfidently && confirmConflict
      ? ambiguous.reduce((a, b) => ((b.card.priority ?? 0) > (a.card.priority ?? 0) ? b : a))
      : undefined;

  for (const item of ambiguous) {
    if (item === bTarget) {
      const stillConflicts = await confirmConflict!(item.newText, item.existingText);
      if (!isLive()) return; // section removed while B was in flight — don't resurrect
      if (!stillConflicts) {
        await updateObservationStatus(item.card.id, "auto_closed", "resolved_by_edit");
        archiveObs(item.card, "auto_closed", evalId);
      } else {
        // Keep: reset grace, move the edited side's highlight to the reworded claim,
        // freeze the card message (D5 — anchor live, prose frozen).
        await saveObservation(reanchorEditedSide(item.card, item.editedSide, item.freshMatch, now));
      }
    } else {
      // Grace path — bump absence; close only after DOC_GRACE_THRESHOLD misses.
      const miss = (item.card.missCount ?? 0) + 1;
      if (miss >= DOC_GRACE_THRESHOLD) {
        await updateObservationStatus(item.card.id, "auto_closed", "resolved_by_edit");
        archiveObs(item.card, "auto_closed", evalId);
      } else {
        await saveObservation({ ...item.card, missCount: miss });
      }
    }
  }
}

