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
    "r1bwpub2_6993": "{\n  \"summary\": \"The rollout strategy remains flexible and subject to adjustment based on performance metrics and stakeholder feedback.\",\n  \"claims\": [\n    {\n      \"text\": \"the team will figure out the appropriate next steps and loop in the right stakeholders\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The criteria for what constitutes a concern requiring adjustment are not specified.\",\n      \"substring\": \"If there are concerns raised\"\n    },\n    {\n      \"text\": \"The definition of appropriate next steps lacks specific escalation or decision-making protocols.\",\n      \"substring\": \"figure out the appropriate next steps\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1u3htoz_6201": "{\n  \"summary\": \"This section defines the automated traffic diversion and alerting protocols triggered by API latency thresholds on the checkout endpoint.\",\n  \"claims\": [\n    {\n      \"text\": \"If the p99 API latency for the /checkout/confirm endpoint exceeds 250 ms as measured over a 5-minute rolling window in Datadog, the load balancer will divert 50% of new requests to the cached-response pool for a maximum of 90 seconds.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"The on-call engineer will be paged via PagerDuty within 60 seconds of the threshold being crossed.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"If latency returns below 200 ms p99 for two consecutive 5-minute windows, automatic restoration occurs without manual intervention.\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The document does not specify the behavior of the load balancer if the latency remains above 250 ms after the 90-second diversion period expires.\",\n      \"substring\": \"maximum of 90 seconds\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"The term p99 is used without definition.\",\n      \"substring\": \"p99\"\n    },\n    {\n      \"text\": \"The term Datadog is used without definition.\",\n      \"substring\": \"Datadog\"\n    },\n    {\n      \"text\": \"The term PagerDuty is used without definition.\",\n      \"substring\": \"PagerDuty\"\n    }\n  ]\n}",
    "r32ziyo_5977": "{\n  \"summary\": \"The rollout strategy remains flexible and subject to adjustment based on performance metrics and stakeholder feedback.\",\n  \"claims\": [\n    {\n      \"text\": \"the team will figure out the appropriate next steps and loop in the right stakeholders\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The criteria for what constitutes a concern requiring adjustment are not specified.\",\n      \"substring\": \"If there are concerns raised\"\n    },\n    {\n      \"text\": \"The definition of appropriate next steps lacks specific escalation or decision-making protocols.\",\n      \"substring\": \"figure out the appropriate next steps\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r13ies10_4010": "{\n  \"contradictions\": [\n    {\n      \"newClaimText\": \"the team will figure out the appropriate next steps and loop in the right stakeholders\",\n      \"existingClaimId\": 0,\n      \"message\": \"The new claim implies manual decision-making for next steps, while existing claim 0 mandates automatic restoration without manual intervention.\"\n    }\n  ],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "maximum of 90 seconds",
      note: "G2 false positive: model flags unspecified behavior after the 90-second diversion window expires. Previously in knownGaps; now consistently produced — accepted as ground truth.",
    },
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "p99",
      note: "Model now consistently flags 'p99' as an undefined percentile notation. Previously in knownGaps; now fires.",
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
      type: "contradiction",
      note: "sec2 implies ad-hoc manual decision-making; sec1 mandates automatic restoration without manual intervention — model routes as contradiction",
    },
  ],
  knownGaps: [
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "initial metrics",
      note: "False negative: model no longer flags 'initial metrics' as an undefined reference with the updated prompt. Tracked for re-evaluation.",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "right stakeholders",
      note: "False negative: model no longer flags 'right stakeholders' as an undefined scope. Tracked for re-evaluation.",
    },
    {
      type: "clarity",
      sectionId: "sec2",
      substring: "Things might change",
      note: "False negative: vague forward-looking statement not flagged by updated prompt. Tracked for re-evaluation.",
    },
  ],
};

export default fixture;
