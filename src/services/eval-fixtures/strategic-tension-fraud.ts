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
    "r1p35kar_2352": "{\n  \"summary\": \"The goal is to implement real-time notifications for fraud blocks to improve user transparency and decrease support ticket volume.\",\n  \"claims\": [\n    {\n      \"text\": \"Notify users in real time on every fraud block to reduce inbound support tickets and give users visibility into why their transaction failed.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The method of notification is not specified.\",\n      \"substring\": \"Notify users\"\n    },\n    {\n      \"text\": \"The definition of 'real time' is not quantified.\",\n      \"substring\": \"real time\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "rcd187t_2330": "{\n  \"summary\": \"The goal is to reduce payment flow interruptions to improve user conversion and trust.\",\n  \"claims\": [\n    {\n      \"text\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The term 'unnecessary' is subjective and lacks a specific definition or criteria for what constitutes an unnecessary interruption versus a necessary security measure.\",\n      \"substring\": \"unnecessary\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that every unnecessary interruption erodes conversion and trust is a broad psychological and business claim presented as fact without supporting data or citations.\",\n      \"substring\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}",
    "rrnvjg9_1767": "{\n  \"contradictions\": [],\n  \"tensions\": [\n    {\n      \"newClaimText\": \"Every unnecessary interruption in the payment flow erodes conversion and trust.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The requirement to notify users of every fraud block may be in tension with the goal of minimizing interruptions in the payment flow to protect conversion rates.\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "strategic_tension",
      note: "Two desirable goals that pull in opposite directions — not a logical impossibility",
    },
    {
      type: "clarity",
      sectionId: "goal-notification",
      note: "Notification mechanism is unspecified (two clarity obs, same section)",
    },
    {
      type: "clarity",
      sectionId: "goal-notification",
      note: "Second clarity on goal-notification (real time not quantified)",
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
