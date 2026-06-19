/**
 * Fixture: unsupported-vs-attributed
 *
 * Two sentences in the same section:
 *   A) A genuine unsupported claim — an assertion about user behaviour with
 *      no evidence cited.
 *   B) An attributed claim — explicitly sourced to "the data team's analysis".
 *      This MUST NOT fire as unsupported (OBS-001).
 *
 * Expected: one `unsupported_claim` for sentence A only.
 * The attributed-claim carve-out in the prompt prevents sentence B from firing.
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
    "r1hmf1jf_4667": "{\n  \"summary\": \"Checkout abandonment is driven by mandatory account creation, with a secondary correlation to checkout length.\",\n  \"claims\": [\n    {\n      \"text\": \"Users always abandon carts when checkout takes more than 3 steps.\",\n      \"kind\": \"fact_claim\"\n    },\n    {\n      \"text\": \"the root cause of the conversion drop is the mandatory account creation step.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The statement implies a universal behavior without specifying the scope of the user base or the context of the checkout process.\",\n      \"substring\": \"Users always abandon carts\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that abandonment is universal for checkouts exceeding three steps lacks supporting data or context.\",\n      \"substring\": \"Users always abandon carts when checkout takes more than 3 steps.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "always",
      note: "Sweeping universal ('always') without scope qualification",
    },
    {
      type: "unsupported_claim",
      sectionId: "sec1",
      substring: "Users always abandon",
      note: "Sweeping claim about user behaviour with no evidence cited",
    },
    // sentence B (data team attribution) must NOT appear here — OBS-001 carve-out
  ],
};

export default fixture;
