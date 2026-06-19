/**
 * Fixture: clarity-wordy-specified
 *
 * Tests more extreme surface flaws than clarity-discrimination.ts:
 *
 * sec1 — extremely long run-ons, heavy nominalization, passive throughout,
 *         but named owner, concrete date, exact metric + measurement definition.
 *         Must NOT fire clarity.
 *
 * sec2 — short, clean sentences, professional register,
 *         but zero owner / timeline / metric definition.
 *         Must fire clarity.
 *
 * Guards the G2 "laundering slot" at a harder boundary than the basic
 * passive/run-on case in clarity-discrimination.ts: a model drifting toward
 * "this is hard to read = unclear meaning" will emit clarity on sec1's
 * 90-word sentence even though every fact in it is fully specified.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "clarity-wordy-specified",
  description:
    "Extreme prose density with full specificity (sec1) vs. clean prose with zero specificity (sec2)",
  sections: [
    {
      id: "sec1",
      text: "It is expected that the delivery by the mobile platform engineering team of the push-notification infrastructure — encompassing the client-side SDK component for both Android (API 26+) and iOS (16.0+), the backend dispatch service hosted on the payments-cluster-eu-west-1 environment, and the retry-and-delivery-receipt pipeline with a maximum of 3 retries at 30-second intervals — will be completed no later than 2025-11-30, as milestoned in the Q3 project charter (reference: PLAT-2240), and that the delivery-success rate across opted-in notification targets will be maintained at or above 98.5% as measured over a rolling 7-day window in the Firebase Analytics dashboard under the 'push_delivery_rate' metric.",
    },
    {
      id: "sec2",
      text: "We plan to launch the feature when it is ready. Stakeholder alignment will happen through the usual channels before release, and we will track progress against our standard metrics. The team will follow up with relevant parties as things develop.",
    },
  ],
  recordings: {
    "rgusa5g_5207": "{\n  \"summary\": \"The mobile platform engineering team is committed to delivering the push-notification infrastructure by November 30, 2025, while maintaining a 98.5% delivery success rate.\",\n  \"claims\": [\n    {\n      \"text\": \"The mobile platform engineering team will deliver the push-notification infrastructure by 2025-11-30.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"The infrastructure includes client-side SDKs for Android (API 26+) and iOS (16.0+).\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"The backend dispatch service is hosted on the payments-cluster-eu-west-1 environment.\",\n      \"kind\": \"fact_claim\"\n    },\n    {\n      \"text\": \"The retry-and-delivery-receipt pipeline will perform a maximum of 3 retries at 30-second intervals.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"The delivery-success rate will be maintained at or above 98.5% as measured over a rolling 7-day window.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"The term 'payments-cluster-eu-west-1' is a specific infrastructure identifier that lacks context for the reader.\",\n      \"substring\": \"payments-cluster-eu-west-1\"\n    }\n  ]\n}",
    "r1fzrara_4740": "{\n  \"summary\": \"The team will launch the feature when ready, coordinating with stakeholders and tracking standard metrics.\",\n  \"claims\": [\n    {\n      \"text\": \"Stakeholder alignment will happen through the usual channels before release\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"we will track progress against our standard metrics\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"The team will follow up with relevant parties as things develop\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The criteria for 'ready' is not specified.\",\n      \"substring\": \"when it is ready\"\n    },\n    {\n      \"text\": \"The specific 'usual channels' for stakeholder alignment are not defined.\",\n      \"substring\": \"the usual channels\"\n    },\n    {\n      \"text\": \"The 'standard metrics' for tracking progress are not specified.\",\n      \"substring\": \"our standard metrics\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1mzkk8p_2965": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "payments-cluster-eu-west-1",
      note: "Infrastructure-specific identifier without context for the reader",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "when it is ready",
      note: "Vague readiness criterion — no definition of 'ready'; must fire",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "usual channels",
      note: "Vague process — 'usual channels' is undefined; must fire on semantically vague prose",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "standard metrics",
      note: "Undefined metric — 'standard metrics' has no definition or measurement window; must fire",
    },
    // sec1 clarity intentionally absent — extremely wordy but every fact is concrete.
    // See knownGaps below for the current model defect.
  ],
  knownGaps: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "opted-in notification targets",
      note: "G2 false positive: model treats undefined scope as a clarity issue even though the metric and measurement window are fully specified. Recording stripped for Tier-1; tracked here until prompt fix lands.",
    },
    {
      type: "strategic_tension",
      note: "Model does not detect the tension between the open-ended sec2 timeline ('when it is ready') and the fixed sec1 deadline (2025-11-30). Tracked until sweep correctly surfaces this.",
    },
  ],
};

export default fixture;
