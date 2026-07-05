import { describe, it, expect } from "vitest";
import { groupObservations, findGroupForObs } from "./obsAggregation";
import type { Observation } from "../store/db";

// findGroupForObs backs reverse hover (UX-006): a highlighted span carries the
// raw observation id, which must resolve to the id of the CARD that renders it.

function obs(over: Partial<Observation> & { id: string }): Observation {
  return {
    docId: "default",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "medium",
    confidence: "medium",
    priority: 1,
    text: "",
    status: "active",
    ...over,
  };
}

describe("findGroupForObs (reverse hover resolution)", () => {
  it("resolves a singleton observation to its own group", () => {
    const groups = groupObservations([obs({ id: "a", blockId: "b1", startOffset: 0, endOffset: 5 })]);
    expect(findGroupForObs(groups, "a")?.primary.id).toBe("a");
  });

  it("resolves a non-primary member to the group's primary card", () => {
    // Two observations on the SAME span aggregate into one card; the lower-priority
    // one is `others`. Hovering its span must still surface the group's primary.
    const groups = groupObservations([
      obs({ id: "hi", priority: 2, blockId: "b1", startOffset: 0, endOffset: 10 }),
      obs({ id: "lo", priority: 1, blockId: "b1", startOffset: 0, endOffset: 10 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(findGroupForObs(groups, "lo")?.primary.id).toBe("hi");
    expect(findGroupForObs(groups, "hi")?.primary.id).toBe("hi");
  });

  it("resolves a contradiction from either span to the one card", () => {
    // A contradiction is a single observation with two spans that share its id;
    // hovering the primary OR the conflicting span resolves to the same card.
    const groups = groupObservations([
      obs({
        id: "c1",
        type: "contradiction",
        blockId: "b1",
        startOffset: 0,
        endOffset: 8,
        conflictingBlockId: "b2",
        conflictingStartOffset: 0,
        conflictingEndOffset: 8,
      }),
    ]);
    // Both spans carry data-obs-id="c1" in the editor, so the lookup key is c1.
    expect(findGroupForObs(groups, "c1")?.primary.id).toBe("c1");
  });

  it("returns undefined for an id that is not present", () => {
    const groups = groupObservations([obs({ id: "a", blockId: "b1", startOffset: 0, endOffset: 5 })]);
    expect(findGroupForObs(groups, "ghost")).toBeUndefined();
  });
});
