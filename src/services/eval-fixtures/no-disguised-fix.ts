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
    "r1p1fhl6_6599": "{\n  \"summary\": \"The new API will implement the TRP protocol to achieve a 40% reduction in payload overhead.\",\n  \"claims\": [\n    {\n      \"text\": \"The new API will utilize the TRP protocol to optimize payload size.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"TRP allows us to reduce overhead by 40%.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The 40% reduction lacks a baseline or reference point for the current overhead.\",\n      \"substring\": \"reduce overhead by 40%\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that TRP reduces overhead by 40% is stated as a fact without supporting data or source attribution.\",\n      \"substring\": \"TRP allows us to reduce overhead by 40%\"\n    }\n  ],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"TRP is used without definition or context.\",\n      \"substring\": \"TRP\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "40%",
      note: "No baseline or current overhead level specified for the 40% reduction claim",
    },
    {
      type: "unsupported_claim",
      sectionId: "sec1",
      substring: "TRP allows us to reduce overhead by 40%",
      note: "Factual claim about TRP's 40% overhead reduction without supporting data",
    },
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "TRP",
    },
  ],
};

export default fixture;
