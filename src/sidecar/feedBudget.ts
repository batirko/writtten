/**
 * Feed budget model — Phase 4 Milestone E.
 *
 * Pure, synchronous, zero side-effects. Separates two concerns:
 *   - Selection by priority: which observations are in the visible top-N budget?
 *   - Display by document order: in what order do they render?
 *
 * This resolves the tension between the taxonomy doc ("sort by priority") and the
 * feed-contract doc §8 ("feed stability is sacred / nothing shuffles"):
 *   priority governs MEMBERSHIP in the visible set;
 *   document-order governs DISPLAY within each group.
 *
 * Design: docs/projects/observation_taxonomy_and_priority.md → Milestone E
 * Feed contract: docs/projects/message_generation_workflow.md → §8
 */

import type { Observation } from "../store/db";

export const DEFAULT_FEED_BUDGET = 7;

export interface FeedPartitionOptions {
  /** Maximum number of observations in the visible set (before the contradiction floor). */
  budget: number;
  /**
   * Ordered blockIds as they appear in the document (top → bottom).
   * Obtained from the editor via `onBlockOrderChange`.
   * When empty, doc-scoped observations fall back to stable insertion order.
   */
  blockOrder: string[];
}

export interface FeedPartition {
  /** Shown in the main feed, in document order. */
  visible: Observation[];
  /** Overflow below budget, shown in the "also noticed" collapsed drawer. */
  alsoNoticed: Observation[];
}

/**
 * Partition active observations into a visible set and an "also noticed" overflow.
 *
 * Rules:
 * 1. `kind === "reflection"` — excluded from both sets (Milestone D; not yet produced).
 * 2. Budget selection — copy-sort by priority desc; top `budget` entries are visible.
 * 3. Contradiction floor — every `type === "contradiction"` is visible regardless of
 *    whether it fell inside the budget. Dismissed contradictions never reach here
 *    (they are filtered to status "active" upstream).
 * 4. Display order — each group is sorted by document position: blockId index in
 *    `blockOrder`, then startOffset. Document-scoped observations (no blockId) sort
 *    to the bottom of their group.
 */
export function partitionFeed(
  observations: Observation[],
  { budget, blockOrder }: FeedPartitionOptions,
): FeedPartition {
  // 1. Exclude reflection kind (Milestone D — none produced yet; defensive).
  const eligible = observations.filter((o) => o.kind !== "reflection");

  // 2. Sort by priority descending to determine budget membership.
  const byPriority = [...eligible].sort((a, b) => b.priority - a.priority);

  // 3. Select by budget + contradiction floor.
  const visibleSet = new Set<string>();
  let budgetUsed = 0;
  for (const obs of byPriority) {
    if (budgetUsed < budget) {
      visibleSet.add(obs.id);
      budgetUsed++;
    }
  }
  // Contradiction floor: always visible even if outside top-N.
  for (const obs of eligible) {
    if (obs.type === "contradiction") {
      visibleSet.add(obs.id);
    }
  }

  const visibleObs = eligible.filter((o) => visibleSet.has(o.id));
  const alsoNoticedObs = eligible.filter((o) => !visibleSet.has(o.id));

  // 4. Sort each group into document order.
  const blockIndexMap = new Map(blockOrder.map((id, i) => [id, i]));

  const docOrder = (a: Observation, b: Observation): number => {
    const aIdx = a.blockId != null ? (blockIndexMap.get(a.blockId) ?? Infinity) : Infinity;
    const bIdx = b.blockId != null ? (blockIndexMap.get(b.blockId) ?? Infinity) : Infinity;
    if (aIdx !== bIdx) return aIdx - bIdx;
    // Same block (or both doc-scoped): secondary sort by startOffset.
    const aOff = a.startOffset ?? Infinity;
    const bOff = b.startOffset ?? Infinity;
    return aOff - bOff;
  };

  return {
    visible: [...visibleObs].sort(docOrder),
    alsoNoticed: [...alsoNoticedObs].sort(docOrder),
  };
}
