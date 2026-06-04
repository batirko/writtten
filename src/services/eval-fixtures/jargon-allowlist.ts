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
    "r1uq58wh_2270": "{\n  \"summary\": \"The team will conduct a 10% soft launch using the GQRS protocol for transaction validation prior to general availability.\",\n  \"claims\": [\n    {\n      \"text\": \"We plan a soft launch to a 10% rollout cohort before GA.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"The payment flow will use the GQRS protocol for all transaction validation.\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The term 'GA' is used without definition, though it is a common industry acronym, it is not in the provided glossary.\",\n      \"substring\": \"GA\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"GQRS is a technical protocol not defined in the text or the provided glossary.\",\n      \"substring\": \"GQRS\"\n    },\n    {\n      \"text\": \"GA is an acronym for General Availability, which is not defined in the provided glossary.\",\n      \"substring\": \"GA\"\n    }\n  ]\n}"
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
      substring: "GA",
      note: "'GA' is used without definition — reasonable clarity flag",
    },
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "GA",
      note: "GA also flagged as jargon by the model in this recording (tracked as known gap below)",
    },
  ],
  knownGaps: [
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "soft launch",
      note: "OBS-005: 'soft launch' is in JARGON_PRESET; should NOT fire but may until allow-list is checked",
    },
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "rollout cohort",
      note: "OBS-005: 'rollout cohort' — preset terms; should NOT fire",
    },
  ],
};

export default fixture;
