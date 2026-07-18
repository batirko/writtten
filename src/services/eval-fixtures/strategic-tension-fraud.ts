/**
 * Fixture: strategic-tension-fraud
 *
 * Two sections with a strategic tradeoff (OBS-004): notifying users on
 * every fraud block reduces support tickets but creates friction for
 * legitimate users. These goals are in tension — NOT a logical contradiction.
 *
 * Expected: one `strategic_tension` observation (NOT a `contradiction`).
 * This fixture locks in the OBS-004 fix and guards against prompt regression
 * that would route the tradeoff back to `contradiction`.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "strategic-tension-fraud",
  description: "Strategic tradeoff routes to strategic_tension, not contradiction (OBS-004)",
  stage: "Product Requirements Document — Fraud Protection",
  sections: [
    {
      id: "goal-notification",
      text: "Goal: Notify users in real time on every fraud block to reduce inbound support tickets and give users visibility into why their transaction failed.",
    },
    {
      id: "goal-friction",
      text: "Goal: Minimize friction for legitimate users. Every unnecessary interruption in the payment flow erodes conversion and trust.",
    },
  ],
  recordings: {
    "r13f2o3y_7649": "{\n  \"summary\": \"The project aims to implement real-time notifications for fraud blocks to improve user transparency and decrease support volume.\",\n  \"claims\": [\n    {\n      \"text\": \"Notify users in real time on every fraud block to reduce inbound support tickets and give users visibility into why their transaction failed.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The target reduction for inbound support tickets is not quantified.\",\n      \"substring\": \"reduce inbound support tickets\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r16obmu3_8351": "{\n  \"summary\": \"The objective is to reduce payment flow interruptions to improve user conversion and trust.\",\n  \"claims\": [\n    {\n      \"text\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The document does not define what constitutes an unnecessary interruption or provide a baseline for current friction levels.\",\n      \"substring\": \"unnecessary interruption\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that every interruption erodes conversion and trust is stated as a universal fact without supporting data or evidence.\",\n      \"substring\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}",
    "r72okcx_4601": "{\n  \"contradictions\": [],\n  \"tensions\": [\n    {\n      \"newClaimText\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The new claim prioritizes a frictionless flow, while the existing claim mandates real-time interruptions for fraud transparency. The document does not specify which objective takes precedence.\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "strategic_tension",
      note: "Two desirable goals that pull in opposite directions — not a logical impossibility",
    },
    {
      type: "clarity",
      sectionId: "goal-notification",
      // Model produces one observation covering the whole notification goal's lack of quantification.
      // "Notify users" appears in the section text; scorer matches via section-text fallback.
      substring: "Notify users",
      note: "Real-time notification mechanism and target reduction are unspecified in one combined observation",
    },
    {
      type: "clarity",
      sectionId: "goal-friction",
      substring: "unnecessary",
      note: "'unnecessary' is subjective without definition",
    },
    {
      type: "unsupported_claim",
      sectionId: "goal-friction",
      note: "Factual claim about interruption eroding conversion without evidence",
    },
  ],
  knownGaps: [
    {
      type: "contradiction",
      note: "OBS-004: weak model / un-tightened prompt may still produce a false contradiction here; tracked until Tier 2 confirms it's gone",
    },
  ],
};

export default fixture;
