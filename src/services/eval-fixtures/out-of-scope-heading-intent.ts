/**
 * Fixture: out-of-scope-heading-intent (OBS-027 behavioural discrimination — case b)
 *
 * Items sitting under an "Out of Scope" heading are deliberate exclusions, not
 * omissions. The heading-intent rule rides in the same gated "Established
 * elsewhere" context block, so §2 needs a sibling (§1) with claims for the block —
 * and thus the heading-intent instruction — to be injected. With it present, the
 * excluded items in §2 must NOT be flagged as ambiguity/gaps.
 *
 * Discrimination (encoded by OMISSION): no clarity/unsupported_claim/undefined_jargon
 * on the deliberately-excluded items in §2. A regression that drops the
 * heading-intent rule (or a model that ignores it) flags them → false positive →
 * Tier-1 precision < 1.
 *
 * See docs/projects/section_eval_precision.md (OBS-027, heading-intent facet).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "out-of-scope-heading-intent",
  description:
    "Items under an 'Out of Scope' heading are deliberate exclusions, not gaps to flag (OBS-027b)",
  stage: "Product Requirements Document — internal",
  sections: [
    {
      id: "sec-goals",
      text: "Goals\n\nThe first release delivers single-currency reconciliation with a manual review queue owned by the finance team, reviewed each business morning.",
    },
    {
      id: "sec-scope",
      text: "Out of Scope\n\nMulti-currency reconciliation and automated exception resolution are not part of this release. Both are deferred to a later phase once the single-currency flow is stable.",
    },
  ],
  recordings: {
    "ruj1tsr_7644": "{\n  \"summary\": \"The initial release provides single-currency reconciliation supported by a daily manual review process managed by the finance team.\",\n  \"claims\": [\n    {\n      \"text\": \"The first release delivers single-currency reconciliation with a manual review queue owned by the finance team, reviewed each business morning.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The term 'business morning' lacks a specific time zone or cutoff hour for the daily review.\",\n      \"substring\": \"business morning\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r5oc23q_8404": "{\n  \"summary\": \"Multi-currency reconciliation and automated exception resolution are excluded from the current release to prioritize single-currency stability.\",\n  \"claims\": [\n    {\n      \"text\": \"Multi-currency reconciliation and automated exception resolution are not part of this release.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"Both are deferred to a later phase once the single-currency flow is stable.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The criteria for determining when the single-currency flow is considered stable are not specified.\",\n      \"substring\": \"once the single-currency flow is stable\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1givwlj_4658": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}"
  },
  expected: [
    // THE DISCRIMINATION (encoded by omission): the deliberately-excluded items in
    // sec-scope — "multi-currency reconciliation" and "automated exception
    // resolution" — are NOT flagged as missing_topic / clarity gaps, because the
    // "Out of Scope" heading governs intent. A regression that drops the
    // heading-intent rule flags them as omissions → false positive.
    //
    // Incidental true-positives (frozen by the recording) — note NEITHER is about
    // an excluded item; both are legitimate under-specifications the model still
    // catches:
    {
      type: "clarity",
      sectionId: "sec-goals",
      substring: "business morning",
      note: "Legitimate: 'business morning' has no time zone / cutoff hour.",
    },
    {
      type: "clarity",
      sectionId: "sec-scope",
      substring: "single-currency flow",
      note: "Legitimate: the criteria for 'stable' (the deferral condition, not an excluded feature) are unspecified.",
    },
  ],
};

export default fixture;
