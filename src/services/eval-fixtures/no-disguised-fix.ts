/**
 * Fixture: no-disguised-fix
 *
 * Tests that the evaluator doesn't use prescriptive language or questions
 * even when it's obvious how to fix the issue.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "no-disguised-fix",
  description: "G3: No prescriptive language or leading questions in observations",
  sections: [
    {
      id: "sec1",
      text: "The new API will utilize the TRP protocol to optimize payload size. TRP allows us to reduce overhead by 40%.",
    },
  ],
  recordings: {
    "r18rz3jk_3097": "{\n  \"summary\": \"The new API will implement the TRP protocol to achieve a 40% reduction in payload overhead.\",\n  \"claims\": [\n    {\n      \"text\": \"The new API will utilize the TRP protocol to optimize payload size.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"TRP allows us to reduce overhead by 40%.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"TRP is not defined.\",\n      \"substring\": \"TRP\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "TRP",
    }
  ],
};

export default fixture;
