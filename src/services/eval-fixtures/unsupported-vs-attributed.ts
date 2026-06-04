/**
 * Fixture: unsupported-vs-attributed
 *
 * Two sentences in the same section:
 *   A) A genuine unsupported claim — an assertion about user behaviour with
 *      no evidence cited.
 *   B) An attributed claim — explicitly sourced to "the data team's analysis".
 *      This MUST NOT fire as unsupported (OBS-001).
 *
 * Expected: one `unsupported_claim` for sentence A.
 * knownGaps: OBS-001 — the prompt may also flag sentence B as unsupported
 * until the attributed-claim carve-out is added.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "unsupported-vs-attributed",
  description: "Genuine unsupported claim fires; attributed claim must NOT fire (OBS-001)",
  sections: [
    {
      id: "sec1",
      text: "Users always abandon carts when checkout takes more than 3 steps. Per the data team's analysis, the root cause of the conversion drop is the mandatory account creation step.",
    },
  ],
  recordings: {
    "r6vwjz6_3002": "{\n  \"summary\": \"The checkout process suffers from high abandonment rates due to the mandatory account creation step and excessive checkout steps.\",\n  \"claims\": [\n    {\n      \"text\": \"Users always abandon carts when checkout takes more than 3 steps.\",\n      \"kind\": \"fact_claim\"\n    },\n    {\n      \"text\": \"the root cause of the conversion drop is the mandatory account creation step.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that users 'always' abandon carts after 3 steps is an absolute claim requiring empirical evidence.\",\n      \"substring\": \"Users always abandon carts when checkout takes more than 3 steps.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "unsupported_claim",
      sectionId: "sec1",
      substring: "Users always abandon",
      note: "Sweeping claim about user behaviour with no evidence cited",
    },
  ],
  knownGaps: [
    {
      type: "unsupported_claim",
      sectionId: "sec1",
      substring: "data team",
      note: "OBS-001: attributed claim may be incorrectly flagged until the attribution carve-out lands",
    },
  ],
};

export default fixture;
