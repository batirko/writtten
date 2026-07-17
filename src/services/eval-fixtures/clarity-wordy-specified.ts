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
 *
 * Re-keyed 2026-07-09 for mechanism A (contradiction_coverage.md): the
 * per-section contradiction check now folds in same-section claims when a
 * section has ≥2 claims. sec1 (3 claims) now issues an intra-section
 * comparison of its own compatible claims (no conflict → empty); sec2's
 * cross-section tension prompt gained sec1's+sec2's claims, shifting the
 * fixed-deadline claim to Existing index 3. Responses are otherwise the
 * frozen model output — only the request hashes (and one index) changed.
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
    "r1o0rd38_8855": "{\n  \"summary\": \"The mobile platform engineering team is committed to delivering a new push-notification infrastructure by November 30, 2025, while maintaining a 98.5% delivery success rate.\",\n  \"claims\": [\n    {\n      \"text\": \"the mobile platform engineering team of the push-notification infrastructure ... will be completed no later than 2025-11-30\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"maximum of 3 retries at 30-second intervals\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"delivery-success rate across opted-in notification targets will be maintained at or above 98.5%\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The delivery-success rate metric lacks a definition for what constitutes a successful delivery event.\",\n      \"substring\": \"delivery-success rate\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "rqg2eys_4658": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}",
    "rvcvyh5_9238": "{\n  \"summary\": \"The team intends to release the feature upon readiness and coordinate with stakeholders using existing processes.\",\n  \"claims\": [\n    {\n      \"text\": \"We plan to launch the feature when it is ready.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"Stakeholder alignment will happen through the usual channels before release\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"we will track progress against our standard metrics.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The criteria for readiness are unspecified, making the launch timeline indeterminate.\",\n      \"substring\": \"when it is ready\"\n    },\n    {\n      \"text\": \"The document does not identify which specific metrics constitute the standard set.\",\n      \"substring\": \"standard metrics\"\n    },\n    {\n      \"text\": \"The specific communication methods and participants for alignment are not defined.\",\n      \"substring\": \"usual channels\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "ra0du7t_4817": "{\n  \"contradictions\": [],\n  \"tensions\": [\n    {\n      \"newClaimText\": \"We plan to launch the feature when it is ready.\",\n      \"existingClaimId\": 3,\n      \"message\": \"The new claim prioritizes launching \\\"when it is ready\\\" over the fixed 2025-11-30 deadline set earlier.\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "delivery-success rate",
      note: "Model flags 'delivery-success rate' as lacking a definition for what constitutes a successful delivery event. Previously a G2 false positive concern; now consistent model output — accepted as ground truth.",
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
    {
      type: "strategic_tension",
      note: "sec2 open-ended 'when it is ready' timeline tensions against sec1's fixed 2025-11-30 deadline",
    },
  ],
  knownGaps: [
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "payments-cluster-eu-west-1",
      note: "Model no longer flags the infrastructure environment identifier as undefined jargon with the updated prompt. Tracked for re-evaluation.",
    },
  ],
};

export default fixture;
