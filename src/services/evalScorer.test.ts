/**
 * Unit tests for scoreObservations — pure function, zero mocks.
 */
import { describe, it, expect } from "vitest";
import { scoreObservations } from "./evalScorer";
import type { Observation } from "../store/db";
import type { ExpectedObservation } from "./eval-fixtures/types";

function obs(overrides: Partial<Observation>): Observation {
  return {
    id: "o1",
    docId: "doc",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "low",
    confidence: "medium",
    priority: 0.75,
    text: "This sentence is vague.",
    status: "active",
    blockId: "s1",
    startOffset: 0,
    endOffset: 20,
    ...overrides,
  };
}

const sectionTexts = new Map<string, string>([
  ["s1", "We will deliver value soon."],
  ["s2", "The timeline is Q2."],
]);

// ---------------------------------------------------------------------------
// Perfect match
// ---------------------------------------------------------------------------
describe("scoreObservations — perfect match", () => {
  it("single expected, single produced, type + section match → precision 1, recall 1", () => {
    const produced = [obs({ type: "clarity", blockId: "s1" })];
    const expected: ExpectedObservation[] = [{ type: "clarity", sectionId: "s1" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
    expect(r.truePositives).toHaveLength(1);
    expect(r.falsePositives).toHaveLength(0);
    expect(r.falseNegatives).toHaveLength(0);
  });

  it("substring match against observation text", () => {
    const produced = [obs({ text: "The term 'Q2' is unclear.", blockId: "s2" })];
    const expected: ExpectedObservation[] = [{ type: "clarity", sectionId: "s2", substring: "Q2" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
  });

  it("substring match against span text when message doesn't contain it", () => {
    const produced = [obs({ text: "This is ambiguous.", blockId: "s1", startOffset: 3, endOffset: 8 })];
    // "will" is in the span s1[3..8] = "will "
    const expected: ExpectedObservation[] = [{ type: "clarity", sectionId: "s1", substring: "will" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.recall).toBe(1);
  });

  it("no sectionId in expected matches any section", () => {
    const produced = [obs({ type: "missing_topic", scope: "document", blockId: undefined })];
    const expected: ExpectedObservation[] = [{ type: "missing_topic" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// False positive
// ---------------------------------------------------------------------------
describe("scoreObservations — false positive", () => {
  it("produced obs with no matching expected → FP, precision 0", () => {
    const produced = [obs({ type: "clarity", blockId: "s1" })];
    const expected: ExpectedObservation[] = [];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    // tp=0, fp=1 → precision = 0 / (0+1) = 0
    expect(r.precision).toBe(0);
    expect(r.recall).toBeNaN(); // no expected
    expect(r.falsePositives).toHaveLength(1);
    expect(r.truePositives).toHaveLength(0);
  });

  it("wrong type → FP + FN", () => {
    const produced = [obs({ type: "clarity", blockId: "s1" })];
    const expected: ExpectedObservation[] = [{ type: "contradiction", sectionId: "s1" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.falsePositives).toHaveLength(1);
    expect(r.falseNegatives).toHaveLength(1);
    expect(r.precision).toBe(0);
    expect(r.recall).toBe(0);
  });

  it("wrong section → FP + FN", () => {
    const produced = [obs({ type: "clarity", blockId: "s2" })];
    const expected: ExpectedObservation[] = [{ type: "clarity", sectionId: "s1" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.falsePositives).toHaveLength(1);
    expect(r.falseNegatives).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// False negative
// ---------------------------------------------------------------------------
describe("scoreObservations — false negative", () => {
  it("expected obs not produced → FN, recall 0", () => {
    const produced: Observation[] = [];
    const expected: ExpectedObservation[] = [{ type: "contradiction", sectionId: "s1" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.recall).toBe(0);
    expect(r.precision).toBeNaN();
    expect(r.falseNegatives).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed
// ---------------------------------------------------------------------------
describe("scoreObservations — mixed", () => {
  it("1 TP + 1 FP + 1 FN → precision 0.5, recall 0.5", () => {
    const produced = [
      obs({ id: "p1", type: "clarity", blockId: "s1" }),
      obs({ id: "p2", type: "unsupported_claim", blockId: "s2" }), // FP
    ];
    const expected: ExpectedObservation[] = [
      { type: "clarity", sectionId: "s1" },                      // matched by p1
      { type: "contradiction", sectionId: "s2" },                 // FN
    ];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.truePositives).toHaveLength(1);
    expect(r.falsePositives).toHaveLength(1);
    expect(r.falseNegatives).toHaveLength(1);
    expect(r.precision).toBe(0.5);
    expect(r.recall).toBe(0.5);
  });

  it("each produced/expected used at most once (greedy)", () => {
    // Two produced clarity obs on s1; only one expected — should be 1 TP, 1 FP.
    const produced = [
      obs({ id: "p1", type: "clarity", blockId: "s1", text: "Vague A." }),
      obs({ id: "p2", type: "clarity", blockId: "s1", text: "Vague B." }),
    ];
    const expected: ExpectedObservation[] = [{ type: "clarity", sectionId: "s1" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.truePositives).toHaveLength(1);
    expect(r.falsePositives).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("scoreObservations — edge cases", () => {
  it("empty produced + empty expected → NaN/NaN, no TP/FP/FN", () => {
    const r = scoreObservations("fx", [], [], sectionTexts);
    expect(r.truePositives).toHaveLength(0);
    expect(r.falsePositives).toHaveLength(0);
    expect(r.falseNegatives).toHaveLength(0);
    expect(r.precision).toBeNaN();
    expect(r.recall).toBeNaN();
  });

  it("fixture id is echoed in result", () => {
    const r = scoreObservations("my-fixture", [], [], sectionTexts);
    expect(r.fixture).toBe("my-fixture");
  });

  it("case-insensitive substring match", () => {
    const produced = [obs({ text: "The term FALSE-POSITIVE is jargon.", blockId: "s1" })];
    const expected: ExpectedObservation[] = [{ type: "clarity", sectionId: "s1", substring: "false-positive" }];
    const r = scoreObservations("fx", produced, expected, sectionTexts);
    expect(r.recall).toBe(1);
  });
});
