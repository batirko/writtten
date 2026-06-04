/**
 * Fixture: contradiction-timeline
 *
 * Two sections with conflicting timeline commitments.
 * Ported from docs/acceptance-testing/fixtures/phase1-contradiction.json
 * (the original Phase 1 acceptance case).
 *
 * Expected: one `contradiction` observation on the second section.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "contradiction-timeline",
  description: "Hard contradiction — Q2 vs Q3 launch commitment",
  sections: [
    { id: "block-q2", text: "We'll launch this in Q2." },
    { id: "block-q3", text: "This will ship in Q3." },
  ],
  recordings: {
    "r19xz6fq_2162": "{\n  \"summary\": \"The project is scheduled for release during the second quarter.\",\n  \"claims\": [\n    {\n      \"text\": \"We'll launch this in Q2.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The scope of what is being launched is not defined.\",\n      \"substring\": \"this\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r778awp_2159": "{\n  \"summary\": \"The project is scheduled for release during the third quarter.\",\n  \"claims\": [\n    {\n      \"text\": \"This will ship in Q3.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The statement does not specify what 'This' refers to.\",\n      \"substring\": \"This\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "rdgflq7_1524": "{\n  \"contradictions\": [\n    {\n      \"newClaimText\": \"This will ship in Q3.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The new claim stating a Q3 shipping date appears to contradict the existing claim of a Q2 launch.\"\n    }\n  ],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "contradiction",
      sectionId: "block-q3",
      substring: "Q2",
      note: "Q3 section contradicts the Q2 commitment; message should mention Q2",
    },
    {
      type: "clarity",
      sectionId: "block-q2",
      note: "'this' is unspecified in the Q2 block",
    },
    {
      type: "clarity",
      sectionId: "block-q3",
      note: "'This' is unspecified in the Q3 block",
    },

  ],
};

export default fixture;
