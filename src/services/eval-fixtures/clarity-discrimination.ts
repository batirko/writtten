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
    "rzzj2bf_4857": "{\n  \"summary\": \"The payments product team will redesign the checkout funnel to meet new design specifications and reduce cart abandonment by December 2025.\",\n  \"claims\": [\n    {\n      \"text\": \"The checkout funnel redesign is to be delivered by the payments product team by 2025-10-15.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"All three stages — item selection, address entry, and payment confirmation — are to be brought into conformance with the Q4 design system spec.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"Cart abandonment rate, currently measured at 68% in the Mixpanel funnel report, is to be reduced to 55% or below by 2025-12-31.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1pwwnax_4723": "{\n  \"summary\": \"The team intends to address user experience issues identified in a recent review during the upcoming cycle.\",\n  \"claims\": [\n    {\n      \"text\": \"The team will work on improving the user experience in the key areas identified from the recent review.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"We plan to make meaningful progress on these issues in the next cycle\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The specific areas of focus are not identified or linked to the referenced review.\",\n      \"substring\": \"key areas identified from the recent review\"\n    },\n    {\n      \"text\": \"The term meaningful progress lacks a measurable definition or success criteria.\",\n      \"substring\": \"meaningful progress\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "rdn2zsf_2771": "{\n  \"contradictions\": [],\n  \"tensions\": [\n    {\n      \"newClaimText\": \"The team will work on improving the user experience in the key areas identified from the recent review.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The focus on general user experience improvements may be in tension with the specific requirement to bring the three checkout stages into conformance with the Q4 design system spec.\"\n    },\n    {\n      \"newClaimText\": \"We plan to make meaningful progress on these issues in the next cycle\",\n      \"existingClaimId\": 2,\n      \"message\": \"The plan to make progress in the next cycle may be in tension with the fixed delivery deadline of 2025-10-15 for the checkout funnel redesign.\"\n    }\n  ]\n}"
  },
  expected: [
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
    // sec1 intentionally absent from expected — passive/wordy prose with concrete specifics
    // must NOT fire clarity. Any sec1 entry here would be a false positive caught by precision check.
  ],
  knownGaps: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "Q4 design system spec",
      note: "G2 false positive: model flags the design system reference as unspecified even though a named spec with a quarter tag is sufficient context. Recording stripped for Tier-1; tracked here until prompt fix lands.",
    },
  ],
};

export default fixture;
