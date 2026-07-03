/**
 * Unit tests for partitionFeed (Milestone E + Aggregation).
 *
 * Key assertions:
 *   - Priority governs membership; document-order governs display.
 *   - Discomfort-budget ceiling caps even high-priority contradictions.
 *   - Same-span observations aggregate into one group (one budget slot).
 *   - Reflection kind excluded.
 *   - Doc-scoped observations (no blockId) sort to bottom within their group.
 */

import { describe, it, expect } from "vitest";
import { partitionFeed, DEFAULT_FEED_BUDGET, CONTRADICTION_CEILING } from "./feedBudget";
import type { Observation } from "../store/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idSeq = 0;
function obs(
  overrides: Partial<Observation> & Pick<Observation, "type" | "priority">
): Observation {
  return {
    id: `obs-${++idSeq}`,
    docId: "doc1",
    scope: "span",
    kind: "problem",
    severity: "medium",
    confidence: "medium",
    text: "test",
    status: "active",
    blockId: undefined,
    startOffset: 0,
    endOffset: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Budget selection
// ---------------------------------------------------------------------------

describe("partitionFeed — budget selection", () => {
  it("high-priority items make the visible cut", () => {
    const observations = [
      obs({ type: "clarity", priority: 0.75, blockId: "b1" }),
      obs({ type: "missing_topic", priority: 1.5, blockId: "b2" }),
      obs({ type: "contradiction", priority: 1.0, blockId: "b3" }),
    ];
    const { visible, alsoNoticed } = partitionFeed(observations, {
      budget: 2,
      blockOrder: ["b1", "b2", "b3"],
    });
    // Top 2 by priority: missing_topic (1.5) + contradiction (1.0).
    expect(visible.length).toBe(2);
    expect(alsoNoticed.length).toBe(1);
    expect(alsoNoticed[0].primary.type).toBe("clarity");
  });

  it("when budget >= count, alsoNoticed is empty", () => {
    const observations = [
      obs({ type: "clarity", priority: 0.75, blockId: "b1" }),
      obs({ type: "missing_topic", priority: 1.5, blockId: "b2" }),
    ];
    const { visible, alsoNoticed } = partitionFeed(observations, {
      budget: 10,
      blockOrder: ["b1", "b2"],
    });
    expect(visible.length).toBe(2);
    expect(alsoNoticed.length).toBe(0);
  });

  it("empty observations → empty partition", () => {
    const { visible, alsoNoticed } = partitionFeed([], {
      budget: DEFAULT_FEED_BUDGET,
      blockOrder: [],
    });
    expect(visible).toEqual([]);
    expect(alsoNoticed).toEqual([]);
  });

  it("budget of 0 means nothing is visible, even contradictions", () => {
    const observations = [
      obs({ type: "clarity", priority: 0.75, blockId: "b1" }),
      obs({ type: "contradiction", priority: 1.0, blockId: "b2" }),
    ];
    const { visible, alsoNoticed } = partitionFeed(observations, {
      budget: 0,
      blockOrder: ["b1", "b2"],
    });
    expect(visible.length).toBe(0);
    expect(alsoNoticed.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Aggregation — same-span observations collapse into one budget slot
// ---------------------------------------------------------------------------

describe("partitionFeed — same-span aggregation", () => {
  it("two observations on the same span consume one budget slot", () => {
    const a = obs({
      type: "clarity",
      priority: 0.75,
      blockId: "b1",
      startOffset: 5,
      endOffset: 20,
    });
    const b = obs({
      type: "unsupported_claim",
      priority: 1.5,
      blockId: "b1",
      startOffset: 5,
      endOffset: 20,
    });
    const c = obs({
      type: "missing_topic",
      priority: 1.0,
      blockId: "b2",
      startOffset: 0,
      endOffset: 10,
    });

    const { visible, alsoNoticed } = partitionFeed([a, b, c], {
      budget: 2,
      blockOrder: ["b1", "b2"],
    });

    // a+b are on the same span → 1 group; c is its own group → 2 groups total
    expect(visible.length + alsoNoticed.length).toBe(2);
  });

  it("grouped card primary is the highest-priority member", () => {
    const lo = obs({
      type: "clarity",
      priority: 0.75,
      blockId: "b1",
      startOffset: 0,
      endOffset: 10,
    });
    const hi = obs({
      type: "contradiction",
      priority: 3.0,
      blockId: "b1",
      startOffset: 0,
      endOffset: 10,
    });

    const { visible } = partitionFeed([lo, hi], {
      budget: 5,
      blockOrder: ["b1"],
    });

    expect(visible).toHaveLength(1);
    expect(visible[0].primary.id).toBe(hi.id);
    expect(visible[0].others).toHaveLength(1);
    expect(visible[0].others[0].id).toBe(lo.id);
  });

  it("contradiction group is floored — stays visible even when lower priority than nits", () => {
    // contradiction is low priority but grouped with clarity on same span
    const con = obs({
      type: "contradiction",
      priority: 0.5,
      blockId: "b3",
      startOffset: 0,
      endOffset: 5,
    });
    const cla = obs({
      type: "clarity",
      priority: 0.5,
      blockId: "b3",
      startOffset: 0,
      endOffset: 5,
    });
    const high1 = obs({ type: "missing_topic", priority: 1.5, blockId: "b1" });
    const high2 = obs({ type: "unsupported_claim", priority: 1.5, blockId: "b2" });

    const { visible, alsoNoticed } = partitionFeed([con, cla, high1, high2], {
      budget: 2,
      blockOrder: ["b1", "b2", "b3"],
    });

    // Groups: [con+cla] on b3, high1 on b1, high2 on b2 → 3 groups
    // Floor: [con+cla] group gets the 1 contradiction slot; remaining budget=1 → high1 visible.
    // high2 goes to alsoNoticed (budget exhausted).
    const visibleIds = visible.map((g) => g.id);
    expect(visibleIds).toContain(con.id);
    expect(alsoNoticed.map((g) => g.id)).not.toContain(con.id);
    expect(visible.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Discomfort-budget ceiling
// ---------------------------------------------------------------------------

describe("partitionFeed — discomfort budget ceiling", () => {
  it("low-priority contradiction stays visible (floor) — nit goes to alsoNoticed instead", () => {
    // Pre-G4: the low-priority contradiction would have been displaced by two higher-priority nits.
    // Post-G4: floor guarantees the contradiction is visible; one nit overflows instead.
    const contradiction = obs({ type: "contradiction", priority: 0.5, blockId: "b3" });
    const hi1 = obs({ type: "missing_topic", priority: 1.5, blockId: "b1" });
    const hi2 = obs({ type: "unsupported_claim", priority: 1.5, blockId: "b2" });
    const { visible, alsoNoticed } = partitionFeed([hi1, hi2, contradiction], {
      budget: 2,
      blockOrder: ["b1", "b2", "b3"],
    });
    // Floor seats the contradiction; remaining budget=1 → one nit visible, one in alsoNoticed.
    expect(visible.map((g) => g.id)).toContain(contradiction.id);
    expect(alsoNoticed.length).toBe(1);
    expect(alsoNoticed[0].primary.type).not.toBe("contradiction");
  });

  it("multiple high-priority contradictions are capped by budget", () => {
    const c1 = obs({ type: "contradiction", priority: 3.0, blockId: "b1" });
    const c2 = obs({ type: "contradiction", priority: 3.0, blockId: "b2" });
    const c3 = obs({ type: "contradiction", priority: 3.0, blockId: "b3" });
    const observations = [c1, c2, c3];
    const { visible, alsoNoticed } = partitionFeed(observations, {
      budget: 2,
      blockOrder: ["b1", "b2", "b3"],
    });
    expect(visible.length).toBe(2);
    expect(alsoNoticed.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// G4 — floor + ceiling hybrid (philosophy_guardrails.md § G4)
// ---------------------------------------------------------------------------

describe("partitionFeed — G4 floor + ceiling", () => {
  it("(a) floor: ≤CEILING contradictions all stay visible even against many higher-priority nits", () => {
    // 2 contradictions (≤3) + 5 high-priority nits, budget=4
    const c1 = obs({ type: "contradiction", priority: 1.0, blockId: "b1" });
    const c2 = obs({ type: "contradiction", priority: 1.0, blockId: "b2" });
    const nits = ["b3", "b4", "b5", "b6", "b7"].map((id) =>
      obs({ type: "clarity", priority: 3.0, blockId: id })
    );
    const { visible, alsoNoticed } = partitionFeed([c1, c2, ...nits], {
      budget: 4,
      blockOrder: ["b1", "b2", "b3", "b4", "b5", "b6", "b7"],
    });
    // Both contradictions must be visible (floor). Remaining 2 budget slots → 2 top nits.
    const visibleIds = visible.map((g) => g.id);
    expect(visibleIds).toContain(c1.id);
    expect(visibleIds).toContain(c2.id);
    expect(visible.length).toBe(4);
    expect(alsoNoticed.length).toBe(3); // 3 nits overflow
  });

  it("(b) ceiling: >CEILING contradictions → exactly CEILING visible, rest in alsoNoticed", () => {
    const contradictions = ["b1", "b2", "b3", "b4", "b5"].map((id) =>
      obs({ type: "contradiction", priority: 3.0, blockId: id })
    );
    const { visible, alsoNoticed } = partitionFeed(contradictions, {
      budget: DEFAULT_FEED_BUDGET,
      blockOrder: ["b1", "b2", "b3", "b4", "b5"],
    });
    expect(visible.length).toBe(CONTRADICTION_CEILING);
    expect(alsoNoticed.length).toBe(contradictions.length - CONTRADICTION_CEILING);
    expect(alsoNoticed.every((g) => g.hasContradiction)).toBe(true);
  });

  it("(c) strategic_tension is not floored — competes for budget like any non-contradiction group", () => {
    const tension = obs({ type: "strategic_tension", kind: "opportunity", priority: 0.5, blockId: "b3" });
    const hi1 = obs({ type: "missing_topic", priority: 1.5, blockId: "b1" });
    const hi2 = obs({ type: "unsupported_claim", priority: 1.5, blockId: "b2" });
    const { visible, alsoNoticed } = partitionFeed([hi1, hi2, tension], {
      budget: 2,
      blockOrder: ["b1", "b2", "b3"],
    });
    // No contradictions → no floor slots consumed; budget=2 picks the two high-priority nits.
    expect(visible.map((g) => g.id)).not.toContain(tension.id);
    expect(alsoNoticed.map((g) => g.id)).toContain(tension.id);
  });
});

// ---------------------------------------------------------------------------
// Priority-banded display (UX-015): a high-priority "Key issues" band renders
// above the low-severity band; document-order is preserved WITHIN each band.
// ---------------------------------------------------------------------------

describe("partitionFeed — display is priority-banded, document-order within each band", () => {
  it("high-priority items rise into the Key band above low-priority nits, regardless of doc position", () => {
    // Key band: mid (b2) + lateHigh (b3), in document order. Rest band: earlyLow (b1).
    const earlyLow = obs({ type: "clarity", priority: 0.75, blockId: "b1", startOffset: 0 });
    const lateHigh = obs({ type: "contradiction", priority: 3.0, blockId: "b3", startOffset: 0 });
    const mid = obs({ type: "missing_topic", priority: 1.5, blockId: "b2", startOffset: 0 });

    const { visible } = partitionFeed([earlyLow, lateHigh, mid], {
      budget: 3,
      blockOrder: ["b1", "b2", "b3"],
    });

    // Key band (>=1.0) first, in doc-order: b2, b3 — then the Rest band nit: b1.
    expect(visible.map((g) => g.blockId)).toEqual(["b2", "b3", "b1"]);
  });

  it("within a band, sorts by document position", () => {
    // Two Key-band items, out of doc order on input → sorted to doc order within the band.
    const late = obs({ type: "missing_topic", priority: 1.5, blockId: "b3", startOffset: 0 });
    const early = obs({ type: "unsupported_claim", priority: 1.5, blockId: "b1", startOffset: 0 });

    const { visible } = partitionFeed([late, early], {
      budget: 5,
      blockOrder: ["b1", "b2", "b3"],
    });

    expect(visible.map((g) => g.blockId)).toEqual(["b1", "b3"]);
  });

  it("within the same block, sorts by startOffset", () => {
    const late = obs({ type: "clarity", priority: 0.75, blockId: "b1", startOffset: 50 });
    const early = obs({ type: "undefined_jargon", priority: 0.75, blockId: "b1", startOffset: 10 });

    const { visible } = partitionFeed([late, early], {
      budget: 5,
      blockOrder: ["b1"],
    });

    expect(visible[0].startOffset).toBe(10);
    expect(visible[1].startOffset).toBe(50);
  });

  it("alsoNoticed is also in document order", () => {
    const hi1 = obs({ type: "missing_topic", priority: 1.5, blockId: "b1" });
    const hi2 = obs({ type: "unsupported_claim", priority: 1.5, blockId: "b2" });
    // These two go to alsoNoticed; doc order should be b4 then doc-scoped
    const lo1 = obs({ type: "clarity", priority: 0.75, blockId: "b4", startOffset: 0 });
    const lo2 = obs({
      type: "structure_flow",
      priority: 0.75,
      scope: "document",
      blockId: undefined,
      startOffset: undefined,
    });
    // lo2 is doc-scoped (no blockId) → bottom of alsoNoticed group

    const { alsoNoticed } = partitionFeed([hi1, hi2, lo1, lo2], {
      budget: 2,
      blockOrder: ["b1", "b2", "b3", "b4"],
    });

    expect(alsoNoticed).toHaveLength(2);
    // b4 (idx=3) before doc-scoped (Infinity)
    expect(alsoNoticed[0].id).toBe(lo1.id);
    expect(alsoNoticed[1].id).toBe(lo2.id);
  });
});

// ---------------------------------------------------------------------------
// Reflection exclusion
// ---------------------------------------------------------------------------

describe("partitionFeed — reflection kind excluded", () => {
  it("reflection observations are excluded from both sets", () => {
    const reflection = obs({ type: "clarity", priority: 3.0, blockId: "b1", kind: "reflection" });
    const problem = obs({ type: "clarity", priority: 0.75, blockId: "b2" });

    const { visible, alsoNoticed } = partitionFeed([reflection, problem], {
      budget: DEFAULT_FEED_BUDGET,
      blockOrder: ["b1", "b2"],
    });

    const allIds = [...visible, ...alsoNoticed].map((g) => g.id);
    expect(allIds).not.toContain(reflection.id);
    expect(allIds).toContain(problem.id);
  });
});

// ---------------------------------------------------------------------------
// Doc-scoped observations
// ---------------------------------------------------------------------------

describe("partitionFeed — doc-scoped observations", () => {
  it("a high-priority doc-scoped observation rises above a low-priority span nit (UX-015)", () => {
    const spanObs = obs({ type: "clarity", priority: 0.75, blockId: "b1", scope: "span" });
    const docObs = obs({
      type: "missing_topic",
      priority: 1.5,
      blockId: undefined,
      scope: "document",
    });

    const { visible } = partitionFeed([spanObs, docObs], {
      budget: DEFAULT_FEED_BUDGET,
      blockOrder: ["b1"],
    });

    // docObs (1.5) is in the Key band; spanObs (0.75) is in the Rest band below it.
    // The old contract pinned the doc-scoped note to the very bottom — UX-015 reverses that.
    expect(visible[0].id).toBe(docObs.id);
    expect(visible[1].id).toBe(spanObs.id);
  });

  it("within the Key band, a doc-scoped obs sorts below anchored ones — but still above the Rest band", () => {
    const anchoredKey = obs({ type: "contradiction", priority: 3.0, blockId: "b1", scope: "span" });
    const docKey = obs({
      type: "missing_topic",
      priority: 1.5,
      blockId: undefined,
      scope: "document",
    });
    const restNit = obs({ type: "clarity", priority: 0.75, blockId: "b1", startOffset: 40, scope: "span" });

    const { visible } = partitionFeed([restNit, docKey, anchoredKey], {
      budget: DEFAULT_FEED_BUDGET,
      blockOrder: ["b1"],
    });

    // Key band: anchoredKey (b1) then docKey (Infinity); Rest band: restNit.
    expect(visible.map((g) => g.id)).toEqual([anchoredKey.id, docKey.id, restNit.id]);
  });

  it("multiple doc-scoped obs maintain stable relative order", () => {
    const docA = obs({
      type: "missing_topic",
      priority: 1.5,
      blockId: undefined,
      scope: "document",
      startOffset: undefined,
    });
    const docB = obs({
      type: "audience_mismatch",
      priority: 0.75,
      blockId: undefined,
      scope: "document",
      startOffset: undefined,
    });

    const { visible } = partitionFeed([docA, docB], {
      budget: DEFAULT_FEED_BUDGET,
      blockOrder: [],
    });

    // Both Infinity blockId, both Infinity startOffset → stable by source order
    expect(visible).toHaveLength(2);
  });
});
