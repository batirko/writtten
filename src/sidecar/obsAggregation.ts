import type { Observation } from "../store/db";

/**
 * A group of one or more observations anchored to the same text span.
 * When multiple checks fire on the same sentence, they collapse into a single
 * card rather than flooding the feed with separate cards for one underlying issue.
 *
 * Singleton groups (most observations) have `others: []` and render identically
 * to the old per-observation cards.
 */
export interface GroupedObservation {
  /** Stable React key — equals primary.id */
  id: string;
  /** Highest-priority member; displayed prominently on the card. */
  primary: Observation;
  /** Remaining members; collapsed by default ("N more on this passage"). */
  others: Observation[];
  /** max(members.priority) — used for budget selection in partitionFeed. */
  priority: number;
  /** True if any member is type === "contradiction" — contradiction floor applies. */
  hasContradiction: boolean;
  // Span coordinates (same for all members — that is the grouping invariant):
  blockId?: string;
  startOffset?: number;
  endOffset?: number;
}

/**
 * Collapse observations that share the same exact span into grouped cards.
 *
 * Grouping key: `blockId:startOffset:endOffset` for span observations.
 * Doc-scoped observations (no blockId) never aggregate — each becomes its own
 * singleton group because `missing_topic` and `structure_flow` are unrelated
 * even though both lack a span anchor.
 *
 * Within each group, the highest-priority observation becomes `primary`; the
 * rest go into `others`. Group priority = primary.priority = max(members).
 */
export function groupObservations(observations: Observation[]): GroupedObservation[] {
  const buckets = new Map<string, Observation[]>();

  for (const obs of observations) {
    // Unique key per doc-scoped observation → no aggregation across doc-level obs
    const key =
      obs.blockId != null
        ? `${obs.blockId}:${obs.startOffset ?? ""}:${obs.endOffset ?? ""}`
        : `__doc__:${obs.id}`;

    const bucket = buckets.get(key) ?? [];
    bucket.push(obs);
    buckets.set(key, bucket);
  }

  return [...buckets.values()].map((members) => {
    // Sort descending by priority so primary is always the most urgent member
    const sorted = [...members].sort((a, b) => b.priority - a.priority);
    const [primary, ...others] = sorted;

    return {
      id: primary.id,
      primary,
      others,
      priority: primary.priority,
      hasContradiction: sorted.some((o) => o.type === "contradiction"),
      blockId: primary.blockId,
      startOffset: primary.startOffset,
      endOffset: primary.endOffset,
    };
  });
}

/**
 * Find the grouped card that contains a given observation id — matching either
 * the group's `primary` or any of its `others`. Used by reverse hover (UX-006):
 * a highlighted span in the editor carries the raw observation id (`data-obs-id`),
 * which must resolve to the id of the *card* that renders it. For a contradiction
 * both spans share one observation id, so hovering either resolves to one card.
 */
export function findGroupForObs(
  groups: GroupedObservation[],
  obsId: string
): GroupedObservation | undefined {
  return groups.find(
    (g) => g.primary.id === obsId || g.others.some((o) => o.id === obsId)
  );
}
