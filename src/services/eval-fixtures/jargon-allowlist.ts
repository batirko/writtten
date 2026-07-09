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
    "rpxzc82_7407": "{\n  \"summary\": \"The document outlines a phased release strategy utilizing a specific validation protocol for payments.\",\n  \"claims\": [\n    {\n      \"text\": \"We plan a soft launch to a 10% rollout cohort before GA.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"The payment flow will use the GQRS protocol for all transaction validation.\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The 10% rollout cohort lacks a defined duration or success criteria for the soft launch phase.\",\n      \"substring\": \"10% rollout cohort\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"GQRS is not a standard industry protocol and lacks a definition or reference.\",\n      \"substring\": \"GQRS\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "GQRS",
      note: "GQRS is a made-up term — should be flagged as undefined jargon",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "10% rollout cohort",
      note: "Rollout cohort lacks a defined duration or success criteria — legitimate clarity flag",
    },
    // GA, soft launch, rollout cohort (jargon) are in JARGON_PRESET — must NOT fire as jargon (OBS-003/005 resolved)
  ],
};

export default fixture;
