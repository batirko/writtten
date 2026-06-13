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
import { partitionFeed, DEFAULT_FEED_BUDGET } from "./feedBudget";
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

  it("group with hasContradiction is capped by budget like anything else", () => {
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
    // Budget=2 picks high1, high2; [con+cla] group is outside budget
    const visibleIds = visible.map((g) => g.id);
    expect(visibleIds).not.toContain(con.id);
    expect(alsoNoticed.map((g) => g.id)).toContain(con.id);
  });
});

// ---------------------------------------------------------------------------
// Discomfort-budget ceiling
// ---------------------------------------------------------------------------

describe("partitionFeed — discomfort budget ceiling", () => {
  it("low-priority contradiction is pushed to alsoNoticed if it misses the budget cut", () => {
    const contradiction = obs({ type: "contradiction", priority: 0.5, blockId: "b3" });
    const observations = [
      obs({ type: "missing_topic", priority: 1.5, blockId: "b1" }),
      obs({ type: "unsupported_claim", priority: 1.5, blockId: "b2" }),
      contradiction,
    ];
    const { visible, alsoNoticed } = partitionFeed(observations, {
      budget: 2,
      blockOrder: ["b1", "b2", "b3"],
    });
    const visibleIds = visible.map((g) => g.id);
    expect(visibleIds).not.toContain(contradiction.id);
    expect(alsoNoticed.map((g) => g.id)).toContain(contradiction.id);
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
// Document-order display (the key assertion: display ≠ priority order)
// ---------------------------------------------------------------------------

describe("partitionFeed — display is document-order, NOT priority-order", () => {
  it("a high-priority obs anchored late renders BELOW a low-priority obs anchored early", () => {
    // priority-3.0 is late; priority-0.75 is early
    const earlyLow = obs({ type: "clarity", priority: 0.75, blockId: "b1", startOffset: 0 });
    const lateHigh = obs({ type: "contradiction", priority: 3.0, blockId: "b3", startOffset: 0 });
    const mid = obs({ type: "missing_topic", priority: 1.5, blockId: "b2", startOffset: 0 });

    const { visible } = partitionFeed([earlyLow, lateHigh, mid], {
      budget: 3,
      blockOrder: ["b1", "b2", "b3"],
    });

    expect(visible.map((g) => g.blockId)).toEqual(["b1", "b2", "b3"]);
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
  it("doc-scoped observations (no blockId) sort to bottom of their group", () => {
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

    // span anchored at b1 (idx=0) sorts above doc-scoped (Infinity)
    expect(visible[0].id).toBe(spanObs.id);
    expect(visible[1].id).toBe(docObs.id);
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
