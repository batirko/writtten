/**
 * Fixture: reconciled-tension (OBS-037 Lever 2)
 *
 * Author-reconciled tradeoff — the composing guard on the contradiction prompts'
 * NOT-A-CONFLICT bucket. When the document itself states a current-state problem
 * and then the change that resolves it ("A, but B, so we chose C"), it is a
 * resolved tradeoff, not a live tension or contradiction — it belongs in neither
 * bucket. This is the FP class V1 Run 1 measured on real PRDs (a current-state
 * problem flagged against the proposed fix that resolves it), so it earns its rule
 * on evidence, not just the essay case.
 *
 * Discrimination is completed across the corpus: this fixture asserts the
 * reconciled pair produces NO conflict, while `strategic-tension-fraud` proves a
 * genuinely live tradeoff (two goals both still in play) still surfaces a
 * `strategic_tension`.
 *
 * `expected` / `recordings` are set from the recorded live output
 * (`EVAL_RECORD_ID=reconciled-tension npm run eval:record`) against the Lever-2
 * prompts. See docs/projects/document_type_calibration.md § Extraction & tension
 * calibration for rhetoric, and docs/logs/prompt_quality_observations.md (OBS-037).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "reconciled-tension",
  description: "A document that states a problem then its resolution is not a live tension (OBS-037)",
  stage: "Product Requirements Document — Checkout",
  sections: [
    {
      id: "problem",
      text: "Today, checkout runs every transaction through the legacy rules engine, which challenges even ordinary purchases. That blanket friction adds latency and frustrates legitimate buyers.",
    },
    {
      id: "resolution",
      text: "To address this, we are replacing the legacy rules engine with a risk-scored gate that only challenges high-risk sessions, so legitimate buyers pass through without added friction.",
    },
  ],
  recordings: {
    "r1an4m2f_7676": "{\n  \"summary\": \"The current checkout process relies on a legacy rules engine that causes unnecessary friction and latency for legitimate transactions.\",\n  \"claims\": [\n    {\n      \"text\": \"Checkout runs every transaction through the legacy rules engine.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The term 'ordinary purchases' lacks a specific definition or criteria to distinguish them from high-risk transactions.\",\n      \"substring\": \"ordinary purchases\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"No latency metrics or performance data are provided to substantiate the claim that the legacy engine adds significant delay.\",\n      \"substring\": \"That blanket friction adds latency\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}",
    "r16thoow_8321": "{\n  \"summary\": \"The team is replacing the existing rules engine with a risk-scored gate to reduce friction for legitimate buyers.\",\n  \"claims\": [\n    {\n      \"text\": \"we are replacing the legacy rules engine with a risk-scored gate\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"only challenges high-risk sessions\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The threshold for what constitutes a high-risk session is not defined.\",\n      \"substring\": \"high-risk sessions\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that the new gate will result in legitimate buyers passing through without added friction lacks supporting data or a comparative analysis of the current versus proposed user flow.\",\n      \"substring\": \"legitimate buyers pass through without added friction\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}",
    "r1p1xybm_4700": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}"
  },
  // The key assertion is the ABSENCE of any contradiction/strategic_tension: the
  // document states the problem then the change that resolves it, so the cross-claim
  // check returns neither bucket (r1p1xybm_4700 above). A regression that re-flags it
  // would appear as an unexpected observation and drop precision below 1. The PRD
  // sections also fire genuine clarity/unsupported nits (full strictness), listed so
  // the ratchet stays exact.
  expected: [
    { type: "clarity", sectionId: "problem", substring: "ordinary purchases" },
    { type: "unsupported_claim", sectionId: "problem", substring: "adds latency" },
    { type: "clarity", sectionId: "resolution", substring: "high-risk sessions" },
    {
      type: "unsupported_claim",
      sectionId: "resolution",
      substring: "without added friction",
    },
  ],
};

export default fixture;
