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
    rbpq796_3117:
      '{\n  "summary": "The checkout experience will be improved to enhance performance and user satisfaction.",\n  "claims": [\n    {\n      "text": "We will deliver a significant improvement to the checkout experience soon.",\n      "kind": "commitment"\n    },\n    {\n      "text": "Performance will be better",\n      "kind": "fact_claim"\n    },\n    {\n      "text": "users will be happier",\n      "kind": "fact_claim"\n    }\n  ],\n  "clarity_observations": [\n    {\n      "text": "The terms \'significant improvement\', \'better\', and \'happier\' lack specific metrics or definitions.",\n      "substring": "significant improvement"\n    },\n    {\n      "text": "The timeline \'soon\' is not defined.",\n      "substring": "soon"\n    }\n  ],\n  "unsupported_claim_observations": [\n    {\n      "text": "The assertion that performance will be better and users will be happier is stated as a fact without evidence or baseline data.",\n      "substring": "Performance will be better and users will be happier"\n    }\n  ],\n  "undefined_jargon_observations": []\n}',
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "significant improvement",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "soon",
    },
    {
      type: "unsupported_claim",
      sectionId: "sec1",
      note: "'Performance will be better and users will be happier' is asserted without evidence",
    },
  ],
};

export default fixture;
