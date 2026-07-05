// ---------------------------------------------------------------------------
// Revert-aware evaluation — Mechanism 2 (content-hash snapshot/restore).
//
// A section's identity for eval purposes is its *membership* (which blockIds
// currently make up the section) plus its *text*. A structural toggle (e.g.
// paragraph <-> heading) can transiently resize a section's membership with no
// debounce of its own — see docs/projects/revert_aware_evaluation.md — so the
// same (membership, text) combination can recur under a different
// representative sectionId once the doc returns to a prior shape. Keying the
// snapshot on membership+text (not sectionId) is what makes a toggle->revert
// restore correctly even though the section's *id* differs at capture time vs.
// restore time.
//
// In-memory, per-session, bounded — no IndexedDB schema change (invariant 5).
// ---------------------------------------------------------------------------

import type { ClaimLedgerEntry } from "../store/db";
import type { NewObservation } from "./evaluatorAnchoring";

export interface SectionSnapshot {
  /** The section's representative id at capture time (informational only). */
  sectionId: string;
  summary: string;
  claims: Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">[];
  /** ids of the Observation rows active for this section when captured, so a
   *  restore can reactivate the exact same cards (same id, no feed flicker)
   *  rather than re-inserting content-alike duplicates. */
  observationIds: string[];
}

/** Bound on the pure-content snapshot payload, kept only for documentation —
 *  the store itself caches ids/claims/summary, not the full NewObservation
 *  payload (that would duplicate what's already in IndexedDB). */
export type { NewObservation };

const MAX_SNAPSHOTS_PER_DOC = 100;

// Map<docId, Map<stateKey, SectionSnapshot>>. Insertion order doubles as LRU
// recency — re-inserting a key on access/write moves it to the "most recent"
// end so eviction always drops the true least-recently-used entry.
const store = new Map<string, Map<string, SectionSnapshot>>();

/** State key: section membership (order-independent) + the section's own text
 *  hash. Ignores block *type* (formatting), so a P<->H1<->P toggle with
 *  identical text maps to the same key once membership also returns to its
 *  prior shape. */
export function snapshotKey(memberBlockIds: string[], textHash: string): string {
  return `${[...memberBlockIds].sort().join(",")}::${textHash}`;
}

export function getSectionSnapshot(docId: string, key: string): SectionSnapshot | undefined {
  const docMap = store.get(docId);
  if (!docMap) return undefined;
  const entry = docMap.get(key);
  if (entry) {
    docMap.delete(key);
    docMap.set(key, entry); // bump recency
  }
  return entry;
}

export function setSectionSnapshot(docId: string, key: string, snapshot: SectionSnapshot): void {
  let docMap = store.get(docId);
  if (!docMap) {
    docMap = new Map();
    store.set(docId, docMap);
  }
  docMap.delete(key);
  docMap.set(key, snapshot);
  while (docMap.size > MAX_SNAPSHOTS_PER_DOC) {
    const oldestKey = docMap.keys().next().value;
    if (oldestKey === undefined) break;
    docMap.delete(oldestKey);
  }
}

/** Drop all cached state for a document — call on clear/new-doc so a stale
 *  snapshot from a previous document can never be restored into a new one. */
export function clearSnapshotsForDocument(docId: string): void {
  store.delete(docId);
}

/** Drop every cached snapshot, across all documents. Test-only: the store is
 *  module-level (by design — it must survive across evaluateSection calls
 *  within a real session), so test suites that reuse a docId/blockId/text
 *  fixture across unrelated cases must reset it between tests or a later
 *  fixture can spuriously "restore" from an earlier, unrelated one. */
export function clearAllSnapshots(): void {
  store.clear();
}
