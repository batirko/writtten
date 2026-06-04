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
    "rtddny5_2957": "{\n  \"summary\": \"The team plans to enhance the checkout experience to improve performance and user satisfaction.\",\n  \"claims\": [\n    {\n      \"text\": \"We will deliver a significant improvement to the checkout experience soon.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The term 'significant' is subjective and lacks a measurable definition.\",\n      \"substring\": \"significant\"\n    },\n    {\n      \"text\": \"The timeline 'soon' is not defined.\",\n      \"substring\": \"soon\"\n    },\n    {\n      \"text\": \"The metric for 'better' performance is not specified.\",\n      \"substring\": \"better\"\n    },\n    {\n      \"text\": \"The metric for 'happier' users is not specified.\",\n      \"substring\": \"happier\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that performance will be better and users will be happier is presented as a factual outcome without evidence or methodology.\",\n      \"substring\": \"Performance will be better and users will be happier.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "significant",
      note: "significant is vague",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "soon",
      note: "soon is vague",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "better",
      note: "better is vague",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "happier",
      note: "happier is vague",
    },
    {
      type: "unsupported_claim",
      sectionId: "sec1",
      note: "'Performance will be better and users will be happier' is asserted without evidence",
    },
  ],
};

export default fixture;
