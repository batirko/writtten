/**
 * Fixture: clarity-vague
 *
 * A single section with vague passages ("soon", "better", "happier") that
 * should trigger clarity observations. The model now returns separate clarity
 * observations per vague term (different message texts → no contentSig dedup).
 *
 * Expected: three distinct `clarity` observations.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "clarity-vague",
  description: "Vague passage fires clarity observation",
  sections: [
    {
      id: "sec1",
      text: "We will deliver a significant improvement to the checkout experience soon. Performance will be better and users will be happier.",
    },
  ],
  recordings: {
    "r1681a9z_4536": "{\n  \"summary\": \"The team intends to enhance the checkout experience to improve performance and user satisfaction.\",\n  \"claims\": [\n    {\n      \"text\": \"We will deliver a significant improvement to the checkout experience soon.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The timeline for the delivery is unspecified.\",\n      \"substring\": \"soon\"\n    },\n    {\n      \"text\": \"The definition of performance improvement is not quantified.\",\n      \"substring\": \"Performance will be better\"\n    },\n    {\n      \"text\": \"The metric for measuring user happiness is not defined.\",\n      \"substring\": \"users will be happier\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "soon",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "Performance will be better",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "users will be happier",
    },
  ],
};

export default fixture;
