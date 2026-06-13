/**
 * Unit tests for computePriority (Milestone B).
 *
 * Pure function, zero mocks. Tests cover:
 *   - Full type-prior table (all 8 current observation types, no extra context)
 *   - Contradiction confidence tier calibration
 *   - Structural escalation (commitment×commitment, metric×metric, unsupported+commitment)
 *   - Priority is always in bounds [0.5, 3.0]
 */

import { describe, it, expect } from "vitest";
import { computePriority, type PriorityInput } from "./priority";

describe("computePriority — type-prior table (no structural context)", () => {
  it("contradiction: medium severity, low confidence (no tier → hedged), priority 1.0", () => {
    const r = computePriority({ type: "contradiction" });
    expect(r.severity).toBe("medium");
    expect(r.confidence).toBe("low");
    expect(r.priority).toBe(2 * 0.5); // 1.0
  });

  it("unsupported_claim: medium severity, medium confidence, priority 1.5", () => {
    const r = computePriority({ type: "unsupported_claim" });
    expect(r.severity).toBe("medium");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(2 * 0.75); // 1.5
  });

  it("missing_topic: medium severity, medium confidence, priority 1.5", () => {
    const r = computePriority({ type: "missing_topic" });
    expect(r.severity).toBe("medium");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(1.5);
  });

  it("strategic_tension: medium severity, medium confidence, priority 1.5", () => {
    const r = computePriority({ type: "strategic_tension" });
    expect(r.severity).toBe("medium");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(2 * 0.75); // 1.5 — same tier as missing_topic, never floored
  });

  it("clarity: low severity, medium confidence, priority 0.75", () => {
    const r = computePriority({ type: "clarity" });
    expect(r.severity).toBe("low");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(1 * 0.75); // 0.75
  });

  it("undefined_jargon: low severity, medium confidence, priority 0.75", () => {
    const r = computePriority({ type: "undefined_jargon" });
    expect(r.severity).toBe("low");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(0.75);
  });

  it("underexposed_topic: low severity, medium confidence, priority 0.75", () => {
    const r = computePriority({ type: "underexposed_topic" });
    expect(r.severity).toBe("low");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(0.75);
  });

  it("audience_mismatch: low severity, medium confidence, priority 0.75", () => {
    const r = computePriority({ type: "audience_mismatch" });
    expect(r.severity).toBe("low");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(0.75);
  });

  it("structure_flow: low severity, medium confidence, priority 0.75", () => {
    const r = computePriority({ type: "structure_flow" });
    expect(r.severity).toBe("low");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(0.75);
  });
});

describe("computePriority — contradiction confidence tier", () => {
  it("confident tier → confidence high, priority 2.0 (medium severity × 1.0)", () => {
    const r = computePriority({ type: "contradiction", contradictionTier: "confident" });
    expect(r.confidence).toBe("high");
    expect(r.severity).toBe("medium");
    expect(r.priority).toBe(2 * 1.0); // 2.0
  });

  it("hedged tier → confidence low, priority 1.0 (medium severity × 0.5)", () => {
    const r = computePriority({ type: "contradiction", contradictionTier: "hedged" });
    expect(r.confidence).toBe("low");
    expect(r.priority).toBe(2 * 0.5); // 1.0
  });

  it("no tier specified → defaults to low confidence (hedged behaviour)", () => {
    const r = computePriority({ type: "contradiction" });
    expect(r.confidence).toBe("low");
  });

  it("non-contradiction type ignores contradictionTier", () => {
    const r = computePriority({ type: "clarity", contradictionTier: "confident" });
    expect(r.confidence).toBe("medium");
  });
});

describe("computePriority — structural escalation", () => {
  it("commitment × commitment → severity high, priority 3.0 on paid key", () => {
    const r = computePriority({
      type: "contradiction",
      claimKinds: { newKind: "commitment", existingKind: "commitment" },
      contradictionTier: "confident",
    });
    expect(r.severity).toBe("high");
    expect(r.confidence).toBe("high");
    expect(r.priority).toBe(3 * 1.0); // 3.0 — maximum
  });

  it("commitment × commitment on free tier → severity high, priority 1.5", () => {
    const r = computePriority({
      type: "contradiction",
      claimKinds: { newKind: "commitment", existingKind: "commitment" },
      contradictionTier: "hedged",
    });
    expect(r.severity).toBe("high");
    expect(r.confidence).toBe("low");
    expect(r.priority).toBe(3 * 0.5); // 1.5
  });

  it("metric × metric → severity high", () => {
    const r = computePriority({
      type: "contradiction",
      claimKinds: { newKind: "metric", existingKind: "metric" },
      contradictionTier: "confident",
    });
    expect(r.severity).toBe("high");
  });

  it("commitment × fact_claim → no escalation (mixed kinds)", () => {
    const r = computePriority({
      type: "contradiction",
      claimKinds: { newKind: "commitment", existingKind: "fact_claim" },
      contradictionTier: "confident",
    });
    expect(r.severity).toBe("medium"); // no escalation
  });

  it("undefined new claim kind → no escalation", () => {
    const r = computePriority({
      type: "contradiction",
      claimKinds: { newKind: undefined, existingKind: "commitment" },
      contradictionTier: "confident",
    });
    expect(r.severity).toBe("medium");
  });

  it("empty claimKinds object → no escalation", () => {
    const r = computePriority({
      type: "contradiction",
      claimKinds: {},
      contradictionTier: "confident",
    });
    expect(r.severity).toBe("medium");
  });

  it("unsupported_claim overlapping commitment → severity high, priority 2.25", () => {
    const r = computePriority({ type: "unsupported_claim", overlapsCommitment: true });
    expect(r.severity).toBe("high");
    expect(r.confidence).toBe("medium");
    expect(r.priority).toBe(3 * 0.75); // 2.25
  });

  it("unsupported_claim not overlapping commitment → severity medium, priority 1.5", () => {
    const r = computePriority({ type: "unsupported_claim", overlapsCommitment: false });
    expect(r.severity).toBe("medium");
    expect(r.priority).toBe(1.5);
  });

  it("overlapsCommitment has no effect on non-unsupported types", () => {
    const r = computePriority({ type: "clarity", overlapsCommitment: true });
    expect(r.severity).toBe("low"); // no escalation
  });
});

describe("computePriority — bounds", () => {
  const allInputs: PriorityInput[] = [
    { type: "contradiction" },
    { type: "contradiction", contradictionTier: "confident" },
    { type: "contradiction", contradictionTier: "hedged" },
    {
      type: "contradiction",
      claimKinds: { newKind: "commitment", existingKind: "commitment" },
      contradictionTier: "confident",
    },
    {
      type: "contradiction",
      claimKinds: { newKind: "metric", existingKind: "metric" },
      contradictionTier: "hedged",
    },
    { type: "unsupported_claim" },
    { type: "unsupported_claim", overlapsCommitment: true },
    { type: "strategic_tension" },
    { type: "missing_topic" },
    { type: "clarity" },
    { type: "undefined_jargon" },
    { type: "underexposed_topic" },
    { type: "audience_mismatch" },
    { type: "structure_flow" },
  ];

  it.each(allInputs)("priority is in [0.5, 3.0] for %o", (input) => {
    const { priority } = computePriority(input);
    expect(priority).toBeGreaterThanOrEqual(0.5);
    expect(priority).toBeLessThanOrEqual(3.0);
  });
});
