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
    "r8t75ns_5760": "{\n  \"summary\": \"The project is scheduled for release in the second quarter.\",\n  \"claims\": [\n    {\n      \"text\": \"We'll launch this in Q2.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The commitment lacks a specific year, making the timeline ambiguous.\",\n      \"substring\": \"Q2\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "rrdv04x_5757": "{\n  \"summary\": \"The feature is scheduled for release in the third quarter.\",\n  \"claims\": [\n    {\n      \"text\": \"This will ship in Q3.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The specific date or month within the quarter is not specified, making the timeline ambiguous.\",\n      \"substring\": \"Q3\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1rsin2t_3458": "{\n  \"contradictions\": [\n    {\n      \"newClaimText\": \"This will ship in Q3.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The new claim sets a Q3 launch date, while the existing claim commits to Q2.\"\n    }\n  ],\n  \"tensions\": []\n}"
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
      note: "Year for Q2 launch is unspecified",
    },
    {
      type: "clarity",
      sectionId: "block-q3",
      substring: "This",
      note: "Pronoun 'This' has no defined scope",
    },
  ],
};

export default fixture;
