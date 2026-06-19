/**
 * Fixture: clarity-conditional-specified
 *
 * Tests hedging / conditional language:
 *
 * sec1 — uses "if", "may", "will" with fully specified conditions, thresholds,
 *         actors, and timeouts. Must NOT fire clarity.
 *
 * sec2 — uses similar hedging words but no condition, actor, or threshold is
 *         defined anywhere. Must fire clarity.
 *
 * Guards the G2 "laundering slot" for the conditional case: "we may need to
 * adjust" sounds vague, but the surface similarity to specified conditionals
 * ("if p99 > 250ms, divert 50%") should not fool the model into treating
 * sec1 as unclear.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "clarity-conditional-specified",
  description:
    "Specified conditional hedging (sec1) vs. unspecified hedging (sec2)",
  sections: [
    {
      id: "sec1",
      text: "If the p99 API latency for the /checkout/confirm endpoint exceeds 250 ms as measured over a 5-minute rolling window in Datadog, the load balancer will divert 50% of new requests to the cached-response pool for a maximum of 90 seconds. The on-call engineer will be paged via PagerDuty within 60 seconds of the threshold being crossed. If latency returns below 200 ms p99 for two consecutive 5-minute windows, automatic restoration occurs without manual intervention.",
    },
    {
      id: "sec2",
      text: "We may need to adjust our rollout strategy depending on how the initial metrics look. If there are concerns raised, the team will figure out the appropriate next steps and loop in the right stakeholders. Things might change as we learn more.",
    },
  ],
  recordings: {
    "r1r7kha8_4873": "{\n  \"summary\": \"This section defines the automated load-balancing and alerting protocols triggered by specific API latency thresholds on the /checkout/confirm endpoint.\",\n  \"claims\": [\n    {\n      \"text\": \"the p99 API latency for the /checkout/confirm endpoint exceeds 250 ms as measured over a 5-minute rolling window in Datadog\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"the load balancer will divert 50% of new requests to the cached-response pool for a maximum of 90 seconds\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"The on-call engineer will be paged via PagerDuty within 60 seconds of the threshold being crossed\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"If latency returns below 200 ms p99 for two consecutive 5-minute windows, automatic restoration occurs without manual intervention\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"p99 is a technical performance metric not defined in the provided glossary.\",\n      \"substring\": \"p99\"\n    },\n    {\n      \"text\": \"Datadog is a third-party monitoring tool not defined in the provided glossary.\",\n      \"substring\": \"Datadog\"\n    },\n    {\n      \"text\": \"PagerDuty is a third-party alerting tool not defined in the provided glossary.\",\n      \"substring\": \"PagerDuty\"\n    }\n  ]\n}",
    "r1ys4gj1_4649": "{\n  \"summary\": \"The rollout strategy remains flexible and subject to adjustment based on performance metrics and stakeholder feedback.\",\n  \"claims\": [\n    {\n      \"text\": \"the team will figure out the appropriate next steps and loop in the right stakeholders\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The criteria for what constitutes 'concerns' or 'appropriate next steps' are not defined.\",\n      \"substring\": \"concerns raised\"\n    },\n    {\n      \"text\": \"The specific metrics that trigger a strategy adjustment are not specified.\",\n      \"substring\": \"initial metrics\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1wcvk6q_2784": "{\n  \"contradictions\": [\n    {\n      \"newClaimText\": \"the team will figure out the appropriate next steps and loop in the right stakeholders\",\n      \"existingClaimId\": 0,\n      \"message\": \"The new claim implies manual decision-making and stakeholder involvement, which appears to contradict the existing claim that automatic restoration occurs without manual intervention.\"\n    }\n  ],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "p99",
      note: "Technical percentile notation not defined in the doc",
    },
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "Datadog",
      note: "Third-party monitoring tool name without context",
    },
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "PagerDuty",
      note: "Third-party alerting tool name without context",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "initial metrics",
      note: "Undefined metric reference — 'initial metrics' has no definition; must fire",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "appropriate next steps",
      note: "Vague process — no owner, no criteria, no timeline; must fire",
    },
    {
      type: "contradiction",
      note: "sec2 implies manual team decision-making; sec1 commits to automatic restoration without manual intervention",
    },
    // sec1 clarity intentionally absent — conditional but every condition is precisely specified.
    // See knownGaps below for the current model defect.
  ],
  knownGaps: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "cached-response pool",
      note: "G2 false positive: model flags unspecified pool validity as a clarity issue even though the conditional trigger and response action are fully specified. Recording stripped for Tier-1; tracked here until prompt fix lands.",
    },
  ],
};

export default fixture;
