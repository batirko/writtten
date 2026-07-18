/**
 * Fixture: contradiction-sweep-fidelity
 *
 * The ratchet's first coverage of the ledger-internal contradiction **sweep**
 * (`evaluateLedgerContradictions` → `CONTRADICTION_SWEEP_SYSTEM_PROMPT[_HEDGED]`),
 * which the per-section `run` path never exercises.
 *
 * Positive control for the OBS-031 / UX-017 message-fidelity fix: two claims
 * that genuinely contradict (Q2 vs Q3 ship date). The recorded sweep `message`
 * quotes the claims' own words ("Q2"/"Q3") and carries NO internal `[Claim #N]`
 * label. `expected.substring: "Q2"` asserts (via the scorer's message-text match,
 * with no section text to fall back on) that the produced message restates the
 * compared claim's language rather than drifting into a fabricated paraphrase —
 * so a regression that reintroduces paraphrase drift would drop recall here.
 * The label-leak lint in evalRatchet.test.ts guards the UX-017 half.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "contradiction-sweep-fidelity",
  description:
    "Sweep contradiction message quotes the claims' own words, no Claim #N label (OBS-031/UX-017)",
  stage: "Product Requirements Document — internal",
  sweep: true,
  sections: [],
  seedClaims: [
    { text: "This will ship in Q2.", kind: "commitment", sourceBlockId: "b-overview" },
    { text: "This will ship in Q3.", kind: "commitment", sourceBlockId: "b-timeline" },
  ],
  recordings: {
    "rw57x81_4217": "{\n  \"contradictions\": [\n    {\n      \"claimAId\": 0,\n      \"claimBId\": 1,\n      \"message\": \"This sets a Q3 ship date, which conflicts with the earlier commitment to ship in Q2.\"\n    }\n  ],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "contradiction",
      sectionId: "b-overview",
      substring: "Q2",
      note: "Message must restate the compared claim's own language (a Q2/Q3 date), not a fabricated paraphrase",
    },
  ],
};

export default fixture;
