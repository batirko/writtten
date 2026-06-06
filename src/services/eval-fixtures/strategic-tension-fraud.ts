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
    "rwgn8pf_3203": "{\n  \"summary\": \"The project aims to implement real-time notifications for fraud-blocked transactions to improve user transparency and decrease support volume.\",\n  \"claims\": [\n    {\n      \"text\": \"Notify users in real time on every fraud block to reduce inbound support tickets and give users visibility into why their transaction failed.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The mechanism for delivering notifications is not specified.\",\n      \"substring\": \"Notify users\"\n    },\n    {\n      \"text\": \"The criteria for what constitutes a fraud block are not defined.\",\n      \"substring\": \"every fraud block\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "ryo1g2x_3181": "{\n  \"summary\": \"The payment flow must be optimized to reduce interruptions and maintain user trust and conversion rates.\",\n  \"claims\": [\n    {\n      \"text\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The criteria for what constitutes an 'unnecessary' interruption are not specified.\",\n      \"substring\": \"unnecessary interruption\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that every unnecessary interruption erodes conversion and trust is stated as a universal fact without supporting data.\",\n      \"substring\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}",
    "r980bvd_2459": "{\n  \"contradictions\": [],\n  \"tensions\": [\n    {\n      \"newClaimText\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The requirement for real-time fraud notifications may be in tension with the goal of minimizing payment flow interruptions.\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "strategic_tension",
      note: "Two desirable goals that pull in opposite directions — not a logical impossibility",
    },
    {
      type: "clarity",
      sectionId: "goal-notification",
      substring: "Notify users",
    },
    {
      type: "clarity",
      sectionId: "goal-notification",
      substring: "every fraud block",
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
