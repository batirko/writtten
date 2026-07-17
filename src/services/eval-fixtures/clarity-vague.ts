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
    "r1y6ke3c_8270": "{\n  \"summary\": \"The team intends to improve the checkout experience to enhance performance and user satisfaction.\",\n  \"claims\": [\n    {\n      \"text\": \"We will deliver a significant improvement to the checkout experience soon.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The timeline for delivery is unspecified.\",\n      \"substring\": \"soon\"\n    },\n    {\n      \"text\": \"The metrics for success regarding performance and user happiness are undefined.\",\n      \"substring\": \"Performance will be better and users will be happier\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
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
      // Model groups "Performance will be better and users will be happier" into one observation
      substring: "Performance will be better",
    },
  ],
  knownGaps: [
    {
      type: "unsupported_claim",
      sectionId: "sec1",
      substring: "Performance will be better",
      note: "Model no longer flags performance/happiness assertions as unsupported claims with the updated prompt. Tracked for re-evaluation.",
    },
  ],
};

export default fixture;
