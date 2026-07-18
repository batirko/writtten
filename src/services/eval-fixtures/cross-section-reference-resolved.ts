/**
 * Fixture: cross-section-reference-resolved (OBS-027 behavioural discrimination — case a)
 *
 * A coined term introduced and explained in §1 (the "Solution" section) is then
 * *used* in §2 without re-explanation. Because §1's claim about the term
 * accumulates in the ledger, §2's section-eval receives it in the
 * "Established elsewhere in this document" context block (or the glossary), so
 * the term must NOT be flagged as undefined_jargon in §2.
 *
 * This is the behavioural counterpart to the shipped prompt-assembly guard
 * (evaluator.test.ts "evaluateSection cross-section context"): that proves the
 * context *reaches* the model; this proves the model *acts* on it.
 *
 * Discrimination (encoded by OMISSION from `expected`): no undefined_jargon on
 * "Reconciliation Sweep" in §2. If a regression stops feeding sibling context —
 * or the model reverts to flagging cross-section references — the stray flag
 * becomes a false positive and drops Tier-1 precision below 1.
 *
 * See docs/projects/section_eval_precision.md (OBS-027) and
 * docs/projects/evaluator_quality_ratchet.md § Phase 8 item 5.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "cross-section-reference-resolved",
  description:
    "A coined term defined in a sibling section is not flagged undefined where it is later used (OBS-027a)",
  stage: "Product Requirements Document — internal",
  sections: [
    {
      id: "sec-solution",
      text: "The Solution\n\nThe Reconciliation Sweep is the nightly batch job that runs at 02:00 UTC, comparing the ledger of recorded transactions against the payment processor's settlement report and writing any mismatch to an exceptions table that the finance team reviews the next morning.",
    },
    {
      id: "sec-metrics",
      text: "Success Metrics\n\nThe Reconciliation Sweep is measured by the count of unresolved entries left in the exceptions table at the end of each business day.",
    },
  ],
  recordings: {
    "r1bvajyt_7773": "{\n  \"summary\": \"The Reconciliation Sweep is an automated nightly process that identifies transaction discrepancies between the internal ledger and payment processor reports for finance team review.\",\n  \"claims\": [\n    {\n      \"text\": \"The Reconciliation Sweep is the nightly batch job that runs at 02:00 UTC, comparing the ledger of recorded transactions against the payment processor's settlement report and writing any mismatch to an exceptions table that the finance team reviews the next morning.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The process for handling or resolving the mismatches written to the exceptions table is not specified.\",\n      \"substring\": \"exceptions table\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"The term Reconciliation Sweep is not a standard industry term and lacks a definition in the provided glossary.\",\n      \"substring\": \"Reconciliation Sweep\"\n    }\n  ]\n}",
    "r8gis3l_8425": "{\n  \"summary\": \"The Reconciliation Sweep's success is defined by the daily count of unresolved entries in the exceptions table.\",\n  \"claims\": [\n    {\n      \"text\": \"The Reconciliation Sweep is measured by the count of unresolved entries left in the exceptions table at the end of each business day.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The metric lacks a target value or threshold for what constitutes success.\",\n      \"substring\": \"measured by the count of unresolved entries\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1aq2w6b_4508": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}"
  },
  expected: [
    // THE DISCRIMINATION: undefined_jargon fires on "Reconciliation Sweep" in
    // §1 (sec-solution), where the coined term is introduced without a formal
    // definition — but is NOT re-flagged in §2 (sec-metrics), where the same
    // term is used, because §1's claim resolves it via the accumulating ledger.
    // The §1 flag makes this a strong guard: the term IS flag-worthy in isolation,
    // so §2's silence is the cross-section context doing its job, not the term
    // being inherently un-flaggable. A regression that stops feeding sibling
    // context (or a model that ignores it) re-flags it in §2 → false positive.
    {
      type: "undefined_jargon",
      sectionId: "sec-solution",
      substring: "Reconciliation Sweep",
      note: "Coined term introduced in §1 without a formal definition — flags here, in isolation.",
    },
    // Incidental true-positives (frozen by the recording):
    {
      type: "clarity",
      sectionId: "sec-solution",
      substring: "exceptions table",
      note: "Legitimate: the process for resolving mismatches in the exceptions table is unspecified.",
    },
    {
      type: "clarity",
      sectionId: "sec-metrics",
      substring: "target value",
      note: "Legitimate: the metric names no target/threshold for success.",
    },
    // NOT flagged (encoded by omission): undefined_jargon on 'Reconciliation Sweep'
    // in sec-metrics — resolved by sec-solution's sibling claim.
  ],
};

export default fixture;
