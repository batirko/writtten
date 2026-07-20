import { describe, it, expect } from "vitest";
import { groupObservations } from "./obsAggregation";
import type { Observation } from "../store/db";

function makeObs(overrides: Partial<Observation> = {}): Observation {
  return {
    id: `obs-${Math.random().toString(36).slice(2, 7)}`,
    docId: "doc1",
    type: "clarity",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.75,
    scope: "span",
    blockId: "b1",
    startOffset: 0,
    endOffset: 10,
    text: "Some observation.",
    status: "active",
    ...overrides,
  };
}

describe("groupObservations", () => {
  it("two observations on the same span collapse into one group", () => {
    const a = makeObs({
      id: "a",
      blockId: "b1",
      startOffset: 5,
      endOffset: 20,
      priority: 1.5,
      type: "contradiction",
    });
    const b = makeObs({
      id: "b",
      blockId: "b1",
      startOffset: 5,
      endOffset: 20,
      priority: 0.75,
      type: "clarity",
    });

    const groups = groupObservations([a, b]);

    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("a"); // higher priority → primary
    expect(groups[0].others).toHaveLength(1);
    expect(groups[0].others[0].id).toBe("b");
    expect(groups[0].id).toBe("a");
  });

  it("observations on different spans produce separate groups", () => {
    const a = makeObs({ id: "a", blockId: "b1", startOffset: 0, endOffset: 10 });
    const b = makeObs({ id: "b", blockId: "b1", startOffset: 15, endOffset: 30 });
    const c = makeObs({ id: "c", blockId: "b2", startOffset: 0, endOffset: 10 });

    const groups = groupObservations([a, b, c]);

    expect(groups).toHaveLength(3);
    for (const g of groups) expect(g.others).toHaveLength(0);
  });

  it("group priority equals the max member priority", () => {
    const lo = makeObs({ id: "lo", priority: 0.5, blockId: "b1", startOffset: 0, endOffset: 5 });
    const hi = makeObs({ id: "hi", priority: 2.25, blockId: "b1", startOffset: 0, endOffset: 5 });
    const mid = makeObs({ id: "mid", priority: 1.5, blockId: "b1", startOffset: 0, endOffset: 5 });

    const [group] = groupObservations([lo, hi, mid]);

    expect(group.priority).toBe(2.25);
    expect(group.primary.id).toBe("hi");
    expect(group.others.map((o) => o.id).sort()).toEqual(["lo", "mid"]);
  });

  it("hasContradiction is true if any member is type contradiction", () => {
    const a = makeObs({ id: "a", type: "clarity", blockId: "b1", startOffset: 0, endOffset: 5 });
    const b = makeObs({
      id: "b",
      type: "contradiction",
      priority: 0.5,
      blockId: "b1",
      startOffset: 0,
      endOffset: 5,
    });

    const [group] = groupObservations([a, b]);

    expect(group.hasContradiction).toBe(true);
  });

  it("hasContradiction is false when no member is a contradiction", () => {
    const a = makeObs({ type: "clarity", blockId: "b1", startOffset: 0, endOffset: 5 });
    const b = makeObs({ type: "unsupported_claim", blockId: "b1", startOffset: 0, endOffset: 5 });

    const [group] = groupObservations([a, b]);

    expect(group.hasContradiction).toBe(false);
  });

  it("doc-scoped observations (no blockId) never aggregate", () => {
    const a = makeObs({
      id: "a",
      blockId: undefined,
      startOffset: undefined,
      endOffset: undefined,
      scope: "doc" as Observation["scope"],
    });
    const b = makeObs({
      id: "b",
      blockId: undefined,
      startOffset: undefined,
      endOffset: undefined,
      scope: "doc" as Observation["scope"],
    });

    const groups = groupObservations([a, b]);

    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.others.length === 0)).toBe(true);
  });

  it("singleton groups have others empty and id equals primary.id", () => {
    const obs = makeObs({ id: "solo" });
    const [group] = groupObservations([obs]);

    expect(group.id).toBe("solo");
    expect(group.primary.id).toBe("solo");
    expect(group.others).toHaveLength(0);
  });

  it("group span coordinates come from the primary member", () => {
    const a = makeObs({ id: "a", priority: 2.0, blockId: "b1", startOffset: 10, endOffset: 30 });
    const b = makeObs({ id: "b", priority: 0.5, blockId: "b1", startOffset: 10, endOffset: 30 });

    const [group] = groupObservations([a, b]);

    expect(group.blockId).toBe("b1");
    expect(group.startOffset).toBe(10);
    expect(group.endOffset).toBe(30);
  });

  it("empty input returns empty array", () => {
    expect(groupObservations([])).toEqual([]);
  });

  it("groups across sources — an agent-era and a key-era card on one span collapse", () => {
    // Engine exclusivity: only one engine ever produces new cards, so cards from
    // different sources on the same passage are the user's own history across a
    // switch they performed. Grouping is about the span, not about who spoke —
    // keeping them apart would show an unexplained duplicate now that no per-card
    // chip exists to say why.
    const span = { blockId: "b1", startOffset: 10, endOffset: 30 };
    const native = makeObs({ id: "native", priority: 2.0, ...span });
    const external = makeObs({
      id: "ext",
      priority: 0.5,
      ...span,
      source: { kind: "agent", name: "Claude Code", sessionId: "sess-1" },
    });

    const groups = groupObservations([native, external]);

    expect(groups).toHaveLength(1);
    expect(groups[0].primary.id).toBe("native"); // highest priority still leads
    expect(groups[0].others).toHaveLength(1);
  });

  it("two cards from the same agent session on one span still group", () => {
    const span = { blockId: "b1", startOffset: 10, endOffset: 30 };
    const source = { kind: "agent" as const, name: "Claude Code", sessionId: "sess-1" };
    const groups = groupObservations([
      makeObs({ id: "e1", priority: 2.0, ...span, source }),
      makeObs({ id: "e2", priority: 0.5, ...span, source }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].others).toHaveLength(1);
  });
});
