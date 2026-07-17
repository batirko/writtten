/**
 * Fixture: clarity-discrimination
 *
 * Two sections that stress-test the boundary between "hard to read" and
 * "unclear in meaning":
 *
 * sec1 — passive voice, run-on sentences, dense prose, but every fact is
 *         fully specified (named team, concrete date, defined metric,
 *         measurement source). Must NOT fire clarity.
 *
 * sec2 — clean, readable grammar, but zero specificity: no owner, no
 *         timeline, no metric definition. Must fire clarity.
 *
 * Guards the G2 "laundering slot" failure mode: a model drifting toward
 * surface-nit behaviour will emit "this is hard to parse" on sec1, which
 * is a readability complaint wearing a meaning-level costume.
 *
 * Re-keyed 2026-07-09 for mechanism A (contradiction_coverage.md): the
 * per-section contradiction check now folds in same-section claims when a
 * section has ≥2 claims. sec1 (3 claims) now issues an intra-section
 * comparison of its own compatible claims (no conflict → empty); sec2's
 * cross-section tension prompt gained the extra claims but the fixed-deadline
 * claim stayed at Existing index 2, so only the request hash changed.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "clarity-discrimination",
  description:
    "Clarity fires on semantic vagueness, not on surface awkwardness (passive/wordy vs. clean-but-vague)",
  sections: [
    {
      id: "sec1",
      text: "The checkout funnel redesign is to be delivered by the payments product team by 2025-10-15. All three stages — item selection, address entry, and payment confirmation — are to be brought into conformance with the Q4 design system spec. Cart abandonment rate, currently measured at 68% in the Mixpanel funnel report, is to be reduced to 55% or below by 2025-12-31.",
    },
    {
      id: "sec2",
      text: "The team will work on improving the user experience in the key areas identified from the recent review. We plan to make meaningful progress on these issues in the next cycle and will follow up with stakeholders as things develop.",
    },
  ],
  recordings: {
    "rzrgj7x_8505": "{\n  \"summary\": \"The payments team will redesign the checkout funnel to meet Q4 design standards by October 2025 and reduce cart abandonment to 55% by year-end.\",\n  \"claims\": [\n    {\n      \"text\": \"The checkout funnel redesign is to be delivered by the payments product team by 2025-10-15.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"All three stages — item selection, address entry, and payment confirmation — are to be brought into conformance with the Q4 design system spec.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"Cart abandonment rate, currently measured at 68% in the Mixpanel funnel report, is to be reduced to 55% or below by 2025-12-31.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The Q4 design system spec lacks a version identifier or reference link to ensure alignment.\",\n      \"substring\": \"Q4 design system spec\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "rsprxla_4858": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}",
    "r1i4780e_9321": "{\n  \"summary\": \"The team intends to address user experience issues identified in a recent review during the upcoming cycle.\",\n  \"claims\": [\n    {\n      \"text\": \"The team will work on improving the user experience in the key areas identified from the recent review.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"We plan to make meaningful progress on these issues in the next cycle\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The scope of improvements is undefined as the specific key areas are not listed or linked.\",\n      \"substring\": \"key areas identified from the recent review\"\n    },\n    {\n      \"text\": \"Meaningful progress lacks a measurable definition or success criteria.\",\n      \"substring\": \"meaningful progress\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r13rojq5_4870": "{\n  \"contradictions\": [],\n  \"tensions\": [\n    {\n      \"newClaimText\": \"We plan to make meaningful progress on these issues in the next cycle\",\n      \"existingClaimId\": 2,\n      \"message\": \"The new claim targets progress in the next cycle, while the existing claim mandates a full delivery of the redesign by 2025-10-15.\"\n    }\n  ]\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "Q4 design system spec",
      note: "Model consistently flags this as lacking a version identifier or reference link. Previously treated as G2 false positive, but the model's reasoning is defensible — now ground truth.",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "key areas identified",
      note: "Vague scope — 'key areas' is undefined; must fire on semantically vague prose",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "meaningful progress",
      note: "Vague metric — 'meaningful progress' lacks definition or measurement; must fire",
    },
    {
      type: "strategic_tension",
      sectionId: "sec2",
      note: "Side-effect of two-section fixture: sec2 'next cycle' commitment tensions against sec1's 2025-10-15 deadline",
    },
  ],
};

export default fixture;
