import { describe, it, expect } from "vitest";
import { planDocReconciliation, type IncomingObservation } from "./docReconcile";
import type { Observation } from "../store/db";

// A doc-scope observation already persisted (has id + status).
function existingObs(id: string, type: Observation["type"], text: string): Observation {
  return {
    id,
    docId: "doc1",
    type,
    scope: "document",
    kind: "problem",
    severity: "medium",
    confidence: "medium",
    priority: 0,
    text,
    status: "active",
  };
}

// A freshly-regenerated doc-scope observation (no id/status yet).
function incomingObs(type: Observation["type"], text: string): IncomingObservation {
  return {
    type,
    scope: "document",
    kind: "problem",
    severity: "medium",
    confidence: "medium",
    priority: 0,
    text,
  };
}

// Deterministic similarity for invariant tests: 1.0 for identical text, else 0.
// Asserting on outcomes (dedupe/insert/orphan) rather than a real metric's
// scores keeps these tests valid if the metric (D1) is swapped later.
const exactSim = (a: string, b: string) => (a === b ? 1 : 0);
const FLOOR = 0.6;

describe("planDocReconciliation", () => {
  it("dedupes an identical-text note — keeps the existing id, no churn", () => {
    const existing = [existingObs("e1", "missing_topic", "No rollout plan.")];
    const incoming = [incomingObs("missing_topic", "No rollout plan.")];

    const plan = planDocReconciliation(existing, incoming, exactSim, FLOOR);

    expect(plan.dedupes).toEqual([{ existingId: "e1", incoming: incoming[0] }]);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.orphans).toHaveLength(0);
  });

  it("treats a below-floor different note as insert + orphan — never a superseded pairing", () => {
    const existing = [existingObs("e1", "missing_topic", "No rollout plan.")];
    const incoming = [incomingObs("missing_topic", "No risks section.")];

    const plan = planDocReconciliation(existing, incoming, exactSim, FLOOR);

    // The whole point: the orphan is preserved as an orphan (caller applies
    // grace), and the new note is a genuine insert — they are NOT paired.
    expect(plan.dedupes).toHaveLength(0);
    expect(plan.inserts).toEqual([incoming[0]]);
    expect(plan.orphans).toEqual([existing[0]]);
  });

  it("collapses two above-floor incoming notes to a single survivor", () => {
    const existing: Observation[] = [];
    const incoming = [
      incomingObs("structure_flow", "Sections out of order."),
      incomingObs("structure_flow", "Sections out of order."), // identical → dup
    ];

    const plan = planDocReconciliation(existing, incoming, exactSim, FLOOR);

    expect(plan.inserts).toHaveLength(1);
    expect(plan.dedupes).toHaveLength(0);
    expect(plan.orphans).toHaveLength(0);
  });

  it("never cross-matches unrelated same-type notes", () => {
    // Two distinct existing notes, two distinct incoming notes, all same type,
    // none textually equal → no dedupe should occur (the old positional matcher
    // would have paired them blindly).
    const existing = [
      existingObs("e1", "underexposed_topic", "Business impact not quantified."),
      existingObs("e2", "underexposed_topic", "Non-happy-path UX undescribed."),
    ];
    const incoming = [
      incomingObs("underexposed_topic", "Fraud-vector mitigation missing."),
      incomingObs("underexposed_topic", "Measurement plan undetailed."),
    ];

    const plan = planDocReconciliation(existing, incoming, exactSim, FLOOR);

    expect(plan.dedupes).toHaveLength(0);
    expect(plan.inserts).toHaveLength(2);
    expect(plan.orphans).toHaveLength(2);
  });

  it("never matches across observation types even at similarity 1", () => {
    const allOnes = () => 1;
    const existing = [existingObs("e1", "missing_topic", "X")];
    const incoming = [incomingObs("structure_flow", "X")];

    const plan = planDocReconciliation(existing, incoming, allOnes, FLOOR);

    expect(plan.dedupes).toHaveLength(0);
    expect(plan.inserts).toEqual([incoming[0]]);
    expect(plan.orphans).toEqual([existing[0]]);
  });

  it("binds the highest-scoring pair first when matches compete", () => {
    // graded similarity: e_strong is the best match for the incoming note.
    const sim = (a: string, b: string) => {
      if (a === "strong" && b === "in") return 0.9;
      if (a === "weak" && b === "in") return 0.7;
      return 0;
    };
    const existing = [
      existingObs("e_weak", "missing_topic", "weak"),
      existingObs("e_strong", "missing_topic", "strong"),
    ];
    const incoming = [incomingObs("missing_topic", "in")];

    const plan = planDocReconciliation(existing, incoming, sim, FLOOR);

    expect(plan.dedupes).toEqual([{ existingId: "e_strong", incoming: incoming[0] }]);
    // the unbound existing note becomes an orphan, not a forced pairing
    expect(plan.orphans.map((o) => o.id)).toEqual(["e_weak"]);
    expect(plan.inserts).toHaveLength(0);
  });
});
