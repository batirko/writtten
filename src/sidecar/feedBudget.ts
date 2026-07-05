/**
 * Feed budget model — Phase 4 Milestone E + Aggregation.
 *
 * Pure, synchronous, zero side-effects. Three concerns:
 *   - Aggregation: observations on the same span collapse into GroupedObservations.
 *   - Selection by priority: which groups are in the visible top-N budget?
 *   - Display by priority band, then document order within each band.
 *
 * This resolves the tension between the taxonomy doc ("sort by priority") and the
 * feed-contract doc §8 ("feed stability is sacred / nothing shuffles"):
 *   priority governs MEMBERSHIP in the visible set;
 *   priority BANDS govern cross-band display placement;
 *   document-order governs DISPLAY within each band.
 *
 * UX-015 (2026-07-02): pure document-order display buried the highest-priority
 * observations — doc-scoped notes (no anchor) pinned to the bottom, so a
 * priority-1.5 missing_topic rendered beneath priority-0.75 clarity nits. The blend
 * lifts high-priority items (incl. unanchored doc-scoped ones) into a "Key issues"
 * band above the low-severity nits, while document-order stays stable WITHIN each
 * band. Band membership is derived from `priority`, which is set at observation
 * creation and only changes on eval-settle — so nothing reshuffles per keystroke.
 *
 * Design: docs/projects/observation_taxonomy_and_priority.md → Milestone E
 * Feed contract: docs/projects/message_generation_workflow.md → §8 (UX-015 revision)
 */

import type { Observation } from "../store/db";
import { groupObservations } from "./obsAggregation";
import type { GroupedObservation } from "./obsAggregation";

export type { GroupedObservation };

export const DEFAULT_FEED_BUDGET = 7;

/** Maximum number of contradiction groups shown in the visible feed at once (G4). */
export const CONTRADICTION_CEILING = 3;

/**
 * Priority at/above which a group rises into the "Key issues" band (UX-015).
 *
 * On the priority scale (`src/services/priority.ts`) every medium+ item —
 * contradiction, strategic_tension, unsupported_claim, missing_topic — computes
 * to >= 1.0, while the low-severity nits (clarity, undefined_jargon,
 * underexposed_topic, audience_mismatch, structure_flow) are all exactly 0.75.
 * Banding on the existing `priority` float (not a fresh severity read) keeps the
 * blend to one transform AND composes with maturity-aware severity (R2): promoting
 * a structural gap low→medium raises its priority 0.75→>=1.0, so it lifts into the
 * Key band automatically.
 */
export const KEY_BAND_MIN_PRIORITY = 1.0;

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
 * 3 & 4. Floor + ceiling for contradictions (G4): the top CONTRADICTION_CEILING contradiction
 *    groups are guaranteed visible (floor — nits can never displace them); no more than
 *    CONTRADICTION_CEILING contradictions are visible at once (ceiling — prevents wall-of-red).
 *    strategic_tension is excluded (kind="opportunity", hasContradiction=false — competes
 *    normally). Remaining budget slots filled by top non-contradiction groups by priority.
 * 5. Display order (UX-015) — each set is split into two priority bands and each
 *    band is sorted by document position (blockId index → startOffset), with
 *    document-scoped groups at the bottom OF THEIR BAND. The high-priority "Key
 *    issues" band (priority >= KEY_BAND_MIN_PRIORITY) renders above the low-severity
 *    band, so contradictions / missing_topic rise above clarity nits while reading
 *    order is preserved within each band.
 */
export function partitionFeed(
  observations: Observation[],
  { budget, blockOrder }: FeedPartitionOptions
): FeedPartition {
  // 1. Exclude reflection kind (Milestone D — none produced yet; defensive).
  const eligible = observations.filter((o) => o.kind !== "reflection");

  // 2. Group by span.
  const groups = groupObservations(eligible);

  // 3 & 4. Floor + ceiling for contradictions (G4).
  const sortByPriority = (arr: GroupedObservation[]) =>
    [...arr].sort((a, b) => b.priority - a.priority);

  const contradictionGroups = sortByPriority(groups.filter((g) => g.hasContradiction));
  const otherGroups = sortByPriority(groups.filter((g) => !g.hasContradiction));

  const visibleContraCount = Math.min(CONTRADICTION_CEILING, budget, contradictionGroups.length);
  const visibleContradictions = contradictionGroups.slice(0, visibleContraCount);
  const overflowContradictions = contradictionGroups.slice(visibleContraCount);

  const remainingBudget = budget - visibleContraCount;
  const visibleOthers = otherGroups.slice(0, remainingBudget);
  const overflowOthers = otherGroups.slice(remainingBudget);

  const visibleSet = [...visibleContradictions, ...visibleOthers];
  const alsoNoticedSet = [...overflowContradictions, ...overflowOthers];

  // 5. Order each set by priority band, then document position within each band.
  const blockIndexMap = new Map(blockOrder.map((id, i) => [id, i]));

  const docOrder = (g: GroupedObservation): number => {
    const idx = g.blockId != null ? (blockIndexMap.get(g.blockId) ?? Infinity) : Infinity;
    return idx * 1e6 + (g.startOffset ?? 0);
  };

  // "Key issues" band (priority >= threshold) renders above the low-severity band;
  // within each band, document order is preserved (feed stays stable per keystroke).
  const orderByBand = (groups: GroupedObservation[]): GroupedObservation[] => {
    const keyBand = groups.filter((g) => g.priority >= KEY_BAND_MIN_PRIORITY);
    const restBand = groups.filter((g) => g.priority < KEY_BAND_MIN_PRIORITY);
    keyBand.sort((a, b) => docOrder(a) - docOrder(b));
    restBand.sort((a, b) => docOrder(a) - docOrder(b));
    return [...keyBand, ...restBand];
  };

  return { visible: orderByBand(visibleSet), alsoNoticed: orderByBand(alsoNoticedSet) };
}

/**
 * The set of individual observation ids that are *surfaced* (in the visible
 * budget), including every member of each visible group. Downgraded
 * "also noticed" observations are excluded. Used to gate canvas highlights:
 * only surfaced observations mark the text — highlight-presence is the visible
 * differentiator between a surfaced and a downgraded observation. See UX-006/R7b.
 */
export function surfacedObservationIds(
  observations: Observation[],
  options: FeedPartitionOptions
): Set<string> {
  const { visible } = partitionFeed(observations, options);
  const ids = new Set<string>();
  for (const g of visible) {
    ids.add(g.primary.id);
    for (const o of g.others) ids.add(o.id);
  }
  return ids;
}
