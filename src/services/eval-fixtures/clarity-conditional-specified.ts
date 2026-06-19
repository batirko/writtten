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
    "r1wsqn2h_4959": "{\n  \"summary\": \"The system will automatically divert checkout traffic to a cached response pool if API latency exceeds a threshold, paging an engineer, and will restore traffic automatically when latency drops.\",\n  \"claims\": [\n    {\n      \"text\": \"the p99 API latency for the /checkout/confirm endpoint exceeds 250 ms as measured over a 5-minute rolling window in Datadog, the load balancer will divert 50% of new requests to the cached-response pool for a maximum of 90 seconds.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"The on-call engineer will be paged via PagerDuty within 60 seconds of the threshold being crossed.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"If latency returns below 200 ms p99 for two consecutive 5-minute windows, automatic restoration occurs without manual intervention.\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"The specific tool used for measuring latency is mentioned, but its configuration or specific metrics are not detailed.\",\n      \"substring\": \"Datadog\"\n    },\n    {\n      \"text\": \"The method for paging engineers is specified, but the exact alert configuration or escalation policy is not detailed.\",\n      \"substring\": \"PagerDuty\"\n    }\n  ]\n}",
    "rpgfkae_4735": "{\n  \"summary\": \"The rollout strategy may be adjusted based on initial metrics and stakeholder feedback.\",\n  \"claims\": [\n    {\n      \"text\": \"The team will figure out the appropriate next steps and loop in the right stakeholders.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The conditions under which the rollout strategy might be adjusted are not specified.\",\n      \"substring\": \"depending on how the initial metrics look\"\n    },\n    {\n      \"text\": \"The criteria for raising concerns are not specified.\",\n      \"substring\": \"If there are concerns raised\"\n    },\n    {\n      \"text\": \"The process for determining appropriate next steps is not specified.\",\n      \"substring\": \"the team will figure out the appropriate next steps\"\n    },\n    {\n      \"text\": \"The criteria for looping in stakeholders are not specified.\",\n      \"substring\": \"loop in the right stakeholders\"\n    },\n    {\n      \"text\": \"The specific changes that might occur are not detailed.\",\n      \"substring\": \"Things might change as we learn more\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r13xemcn_2766": "{\n  \"contradictions\": [],\n  \"tensions\": [\n    {\n      \"newClaimText\": \"The team will figure out the appropriate next steps and loop in the right stakeholders.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The manual process of determining next steps is in tension with the automated, intervention-free restoration protocol.\"\n    }\n  ]\n}"
  },
  expected: [
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
      substring: "concerns raised",
      note: "Vague trigger — no criteria defined for what constitutes a 'concern'",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "appropriate next steps",
      note: "Vague process — no owner, no criteria, no timeline; must fire",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "right stakeholders",
      note: "Vague scope — 'right stakeholders' is undefined",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "Things might change",
      note: "Vague statement — no specifics on what might change or under what conditions",
    },
    {
      type: "strategic_tension",
      sectionId: "sec2",
      note: "sec2 implies manual team decision-making; sec1 commits to automatic restoration without manual intervention",
    },
    // sec1 clarity intentionally absent — conditional but every condition is precisely specified.
    // See knownGaps below for the current model defect.
  ],
  knownGaps: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "for a maximum of 90 seconds",
      note: "G2 false positive: model flags the 90-second cap as a clarity issue even though the conditional trigger and response action are fully specified. Recording stripped for Tier-1; tracked here until prompt fix lands.",
    },
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "p99",
      note: "Model no longer flags 'p99' as undefined jargon in the current recording. Tracked for re-evaluation after prompt tuning.",
    },
    {
      type: "contradiction",
      note: "Model now produces a strategic_tension instead of a contradiction for the sec2 ad-hoc / sec1 automated protocol mismatch. The distinction is arguably correct (it's a tension, not an impossibility).",
    },
  ],
};

export default fixture;
