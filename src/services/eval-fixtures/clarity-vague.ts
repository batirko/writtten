/**
 * Fixture: clarity-vague
 *
 * A single section with vague passages ("soon", "significant improvement",
 * "better", "happier") that should trigger clarity observations.
 *
 * Note on dedup: the model returns four clarity obs with the same message
 * text anchored to different substrings. The evaluator's contentSig dedup
 * collapses them to one unique observation. Expected reflects the deduplicated
 * pipeline output.
 *
 * Expected: one `clarity` observation + one `unsupported_claim`.
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
    "r7ijlgq_2266": "{\n  \"summary\": \"The checkout experience will be improved in the near future to enhance performance and user satisfaction.\",\n  \"claims\": [\n    {\n      \"text\": \"We will deliver a significant improvement to the checkout experience soon.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The terms 'significant improvement', 'soon', 'better', and 'happier' are subjective and lack specific metrics or timelines.\",\n      \"substring\": \"significant improvement\"\n    },\n    {\n      \"text\": \"The terms 'significant improvement', 'soon', 'better', and 'happier' are subjective and lack specific metrics or timelines.\",\n      \"substring\": \"soon\"\n    },\n    {\n      \"text\": \"The terms 'significant improvement', 'soon', 'better', and 'happier' are subjective and lack specific metrics or timelines.\",\n      \"substring\": \"better\"\n    },\n    {\n      \"text\": \"The terms 'significant improvement', 'soon', 'better', and 'happier' are subjective and lack specific metrics or timelines.\",\n      \"substring\": \"happier\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"Performance will be better and users will be happier.\",\n      \"substring\": \"Performance will be better and users will be happier.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      note: "Vague terms ('significant improvement', 'soon', 'better', 'happier') — pipeline deduplicates to one observation per unique message",
    },
    {
      type: "unsupported_claim",
      sectionId: "sec1",
      note: "'Performance will be better and users will be happier' is asserted without evidence",
    },
  ],
};

export default fixture;
