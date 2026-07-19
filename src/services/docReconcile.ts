import type { Observation } from "../store/db";

/**
 * Best-match reconciliation planner for **document-scope** observations
 * (`scope === "document"`: missing_topic, underexposed_topic, structure_flow,
 * audience_mismatch). See docs/projects/doc_scope_reconciliation.md (Tier 1).
 *
 * The old doc-scope reconciler matched on **type alone, positionally** — it
 * grabbed the first unconsumed existing observation of the same type, so a fresh
 * regeneration could "supersede" an unrelated note, flicker stable notes, and
 * mislabel the archive trail. This planner instead pairs each incoming note to
 * the existing note it is most *similar* to (above a floor), within its type
 * bucket.
 *
 * It is intentionally **pure**: no DB, no suppression, no side effects. The
 * similarity function and floor are injected so the metric (D1) and threshold
 * (D6) are seams the caller owns — and so tests can assert behavioural
 * invariants rather than scoring internals.
 */

/** An incoming (freshly-computed) observation has no id/status yet. */
export type IncomingObservation = Omit<Observation, "id" | "docId" | "status">;

/** Floor similarity for treating two doc-scope notes as "the same note" (D6).
 *  Inherited from the OBS-012 dedupe threshold. Lives here — beside the planner
 *  it is injected into — so the external-observation boundary can dedupe an
 *  agent's doc-scope submission against the feed at the *same* threshold the
 *  evaluator uses, without importing the DB-touching reconcile module. */
export const DOC_DEDUPE_FLOOR = 0.6;

export interface DocReconcilePlan {
  /** Incoming note matched an existing one → keep the existing record (and id);
   *  caller resets its absence counter. Existing wording is preserved (D5: freeze). */
  dedupes: { existingId: string; incoming: IncomingObservation }[];
  /** Incoming note with no existing counterpart → genuinely new, insert active. */
  inserts: IncomingObservation[];
  /** Existing active note with no incoming counterpart → orphan; caller applies
   *  the absence grace period before closing. */
  orphans: Observation[];
}

type Sim = (a: string, b: string) => number;

/** Group items by their observation `type` so matching never crosses types. */
function byType<T extends { type: Observation["type"] }>(
  items: T[]
): Map<Observation["type"], T[]> {
  const m = new Map<Observation["type"], T[]>();
  for (const it of items) {
    const bucket = m.get(it.type);
    if (bucket) bucket.push(it);
    else m.set(it.type, [it]);
  }
  return m;
}

/**
 * Plan a doc-scope reconciliation pass.
 *
 * @param existing   Currently-active document-scope observations.
 * @param incoming   Freshly-regenerated document-scope observations (already
 *                   suppression-filtered by the caller).
 * @param similarity Pairwise text similarity in [0, 1] (e.g. Jaccard).
 * @param floor      Minimum similarity to treat two notes as "the same note".
 */
export function planDocReconciliation(
  existing: Observation[],
  incoming: IncomingObservation[],
  similarity: Sim,
  floor: number
): DocReconcilePlan {
  const plan: DocReconcilePlan = { dedupes: [], inserts: [], orphans: [] };

  const existingByType = byType(existing);
  const incomingByType = byType(incoming);

  // Every type present on either side gets reconciled; types with no incoming
  // contribute only orphans, types with no existing contribute only inserts.
  const allTypes = new Set<Observation["type"]>([
    ...existingByType.keys(),
    ...incomingByType.keys(),
  ]);

  for (const type of allTypes) {
    const exist = existingByType.get(type) ?? [];
    // 1. Collapse incoming-vs-incoming duplicates above the floor, so two
    //    rephrasings of the same point don't both survive (doc-scope lacked this).
    const kept: IncomingObservation[] = [];
    for (const inc of incomingByType.get(type) ?? []) {
      const dup = kept.some((k) => similarity(k.text, inc.text) >= floor);
      if (!dup) kept.push(inc);
    }

    // 2. Best-match assignment: score every (incoming × existing) pair, then
    //    greedily bind the highest score ≥ floor first, each side used once.
    //    N is tiny (≤ ~7 per type) so greedy-by-descending-score is both cheap
    //    and deterministic; optimal (Hungarian) buys nothing here.
    const pairs: { score: number; inc: IncomingObservation; ex: Observation }[] = [];
    for (const inc of kept) {
      for (const ex of exist) {
        const score = similarity(ex.text, inc.text);
        if (score >= floor) pairs.push({ score, inc, ex });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const usedIncoming = new Set<IncomingObservation>();
    const usedExisting = new Set<string>();
    for (const { inc, ex } of pairs) {
      if (usedIncoming.has(inc) || usedExisting.has(ex.id)) continue;
      usedIncoming.add(inc);
      usedExisting.add(ex.id);
      plan.dedupes.push({ existingId: ex.id, incoming: inc });
    }

    // 3. Leftovers: unmatched incoming are new; unmatched existing are orphans.
    for (const inc of kept) if (!usedIncoming.has(inc)) plan.inserts.push(inc);
    for (const ex of exist) if (!usedExisting.has(ex.id)) plan.orphans.push(ex);
  }

  return plan;
}
