/**
 * Feed budget model — Phase 4 Milestone E + Aggregation.
 *
 * Pure, synchronous, zero side-effects. Two concerns:
 *   - Aggregation: observations on the same span collapse into GroupedObservations.
 *   - Selection by priority: which groups are in the visible top-N budget?
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
import { groupObservations } from "./obsAggregation";
import type { GroupedObservation } from "./obsAggregation";

export type { GroupedObservation };

export const DEFAULT_FEED_BUDGET = 7;

export interface FeedPartitionOptions {
  /** Maximum number of groups in the visible set. */
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
  visible: GroupedObservation[];
  /** Overflow below budget, shown in the "also noticed" collapsed drawer. */
  alsoNoticed: GroupedObservation[];
}

/**
 * Partition active observations into a visible set and an "also noticed" overflow.
 *
 * Rules:
 * 1. `kind === "reflection"` — excluded (Milestone D; not yet produced).
 * 2. Aggregation — observations sharing the same exact span collapse into one group.
 * 3. Budget selection — sort groups by priority desc; top `budget` groups are visible.
 * 4. Discomfort-budget ceiling — contradictions natively sort to the top
 *    but are strictly capped by the budget to prevent overwhelming feeds.
 * 5. Display order — each set sorted by document position (blockId index → startOffset).
 *    Document-scoped groups sort to the bottom.
 */
export function partitionFeed(
  observations: Observation[],
  { budget, blockOrder }: FeedPartitionOptions
): FeedPartition {
  // 1. Exclude reflection kind (Milestone D — none produced yet; defensive).
  const eligible = observations.filter((o) => o.kind !== "reflection");

  // 2. Group by span.
  const groups = groupObservations(eligible);

  // 3. Sort by priority descending to determine budget membership.
  const byPriority = [...groups].sort((a, b) => b.priority - a.priority);

  // 4. Select by budget (includes G4 discomfort ceiling).
  // Contradictions natively sort to the top via priority, but are capped
  // by the budget to prevent overwhelming the user with a wall of red.
  const visibleIds = new Set<string>();
  let budgetUsed = 0;
  for (const g of byPriority) {
    if (budgetUsed < budget) {
      visibleIds.add(g.id);
      budgetUsed++;
    } else {
      break;
    }
  }

  const visibleSet = groups.filter((g) => visibleIds.has(g.id));
  const alsoNoticedSet = groups.filter((g) => !visibleIds.has(g.id));

  // 5. Sort each set into document order.
  const blockIndexMap = new Map(blockOrder.map((id, i) => [id, i]));

  const docOrder = (g: GroupedObservation): number => {
    const idx = g.blockId != null ? (blockIndexMap.get(g.blockId) ?? Infinity) : Infinity;
    return idx * 1e6 + (g.startOffset ?? 0);
  };

  visibleSet.sort((a, b) => docOrder(a) - docOrder(b));
  alsoNoticedSet.sort((a, b) => docOrder(a) - docOrder(b));

  return { visible: visibleSet, alsoNoticed: alsoNoticedSet };
}
