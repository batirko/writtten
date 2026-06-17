/**
 * Fixture: jargon-allowlist
 *
 * Tests that the jargon allow-list suppresses known PM/product terms while
 * still firing on genuinely undefined domain-specific jargon.
 *
 *   - "soft launch" is in the JARGON_PRESET → must NOT fire.
 *   - "GQRS protocol" is made-up domain jargon → SHOULD fire.
 *
 * This guards OBS-003 / OBS-005 (standard domain vocabulary false-positives).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "jargon-allowlist",
  description: "Preset terms suppressed; genuinely undefined jargon fires (OBS-003/005)",
  sections: [
    {
      id: "sec1",
      text: "We plan a soft launch to a 10% rollout cohort before GA. The payment flow will use the GQRS protocol for all transaction validation.",
    },
  ],
  recordings: {
    "ro079ts_4540": "{\n  \"summary\": \"The team will execute a 10% rollout of the payment flow using the GQRS protocol prior to general availability.\",\n  \"claims\": [\n    {\n      \"text\": \"We plan a soft launch to a 10% rollout cohort before GA.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"The payment flow will use the GQRS protocol for all transaction validation.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"GQRS\",\n      \"substring\": \"GQRS\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "GQRS",
      note: "GQRS is a made-up term — should be flagged as undefined jargon",
    },
    // GA, soft launch, rollout cohort are in JARGON_PRESET — must NOT fire (OBS-003/005 resolved)
  ],
};

export default fixture;
