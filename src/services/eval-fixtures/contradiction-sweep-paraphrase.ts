/**
 * Fixture: contradiction-sweep-paraphrase (OBS-031 message fidelity)
 *
 * The message-fidelity guard for the ledger contradiction *sweep*. A genuine
 * contradiction whose primary side states a numeric metric *threshold* — the
 * shape that invited the original OBS-031 paraphrase drift, where a stated
 * "FLARE threshold" was re-described as "a specific user segment". The tightened
 * CONTRADICTION_SWEEP_SYSTEM_PROMPT now requires the `message` to quote/closely
 * restate the compared claim's own words.
 *
 * Two live-recorded assertions (a model-output property deterministic replay
 * alone cannot invent, hence a recorded fixture):
 *   1. Fidelity — the produced message restates the threshold's own wording
 *      ("2%"), asserted via `expected.substring: "2%"` (matched against the
 *      message text, since a sweep fixture has no section text to fall back on).
 *   2. No label leak — the `claim-index` rule in registerLint (run per-observation
 *      by evalRatchet.test.ts) rejects any `Claim #N` / `claim [N]` bookkeeping
 *      label in the message (UX-017).
 *
 * NOTE the pair is a *genuine* contradiction (gate on <2% error vs ship at 5%),
 * not the compatible-but-underspecified case OBS-031's "NOT A CONFLICT" rule now
 * suppresses — otherwise the sweep would (correctly) emit nothing.
 *
 * See docs/logs/prompt_quality_observations.md (OBS-031) and
 * docs/projects/evaluator_quality_ratchet.md § Phase 8 item 5.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "contradiction-sweep-paraphrase",
  description:
    "Sweep contradiction message quotes a metric threshold's own words, no paraphrase drift or Claim #N label (OBS-031)",
  stage: "Product Requirements Document — internal",
  sweep: true,
  sections: [],
  seedClaims: [
    {
      text: "Launch is gated on keeping the error rate below the 2% SLO threshold.",
      kind: "constraint",
      sourceBlockId: "b-slo",
    },
    {
      text: "We will ship to all users in week one even if the error rate reaches 5%.",
      kind: "commitment",
      sourceBlockId: "b-rollout",
    },
  ],
  recordings: {
    "rjbwxxf_4053": "{\n  \"contradictions\": [\n    {\n      \"claimAId\": 0,\n      \"claimBId\": 1,\n      \"message\": \"The requirement that launch is gated on keeping the error rate below the 2% SLO threshold directly conflicts with the commitment to ship to all users in week one even if the error rate reaches 5%.\"\n    }\n  ],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "contradiction",
      substring: "2%",
      note: "Message must restate the compared claim's own threshold wording ('2%'), not a fabricated paraphrase (OBS-031). sectionId omitted so the match is on the message text.",
    },
  ],
};

export default fixture;
