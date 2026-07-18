/**
 * Fixture: contradiction-sla-family (OBS-038 — near-duplicate crowding)
 *
 * The synthetic, blatant analogue of V1 Run 1's doc P09 SLA triplet. Three sections
 * accumulate a ledger of latency claims dense enough (>10 candidates by the time the
 * Acceptance Criteria section settles) that the OLD whole-section blob prefilter would
 * truncate the candidate set at top-10 — and a compatible near-duplicate of the
 * conflicting claim could occupy a slot and crowd the real contradiction out, so the
 * adjudicator was never shown the pair (candidate SELECTION, not adjudication).
 *
 *   α (sec-nfr)        — "change detected within five minutes"      (compatible; near-dup of β's wording)
 *   β (sec-acceptance) — "change-to-PR flow completes in under five minutes"
 *   γ (sec-metrics)    — "change-to-PR flow may take up to one hour"  (β's direct, same-metric contradiction)
 *
 * β × γ is a blatant same-metric conflict (<5 min vs up to 1 hour on the *same*
 * change-to-PR flow), so the weak/hedged free-tier adjudicator reliably flags it once
 * both are in the candidate set — the fixture proves the per-claim *selection* keeps
 * γ present end-to-end; the deterministic crowding mechanics are proven in
 * prefilter.test.ts. With >10 same-doc candidates, reverting to the old blob top-10
 * changes the assembled prompt (hash miss) → this fixture goes red, so it guards the fix.
 *
 * Recorded at the free tier (`npm run eval:record` with VITE_GEMINI_API_KEY=$GEMINI_FREE)
 * per the corpus convention. See docs/projects/contradiction_coverage.md § Phase 8B and
 * docs/logs/prompt_quality_observations.md OBS-038.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "contradiction-sla-family",
  description:
    "SLA family — a compatible near-duplicate must not crowd the real change-to-PR contradiction out of the candidate set (OBS-038)",
  stage: "Internal engineering PRD for a change-automation platform (audience: platform engineers)",
  sections: [
    {
      id: "sec-nfr",
      text: "The change-detection service detects any configuration change within five minutes of the change landing in the main branch. The detector polls each repository every thirty seconds. Detection runs on three replicas in the us-east-1 region. Detection events are written to the audit log within ten seconds. The pipeline sustains a throughput of five hundred change events per minute. The health-check endpoint responds within two hundred milliseconds.",
    },
    {
      id: "sec-metrics",
      text: "The end-to-end change-to-pull-request flow may take up to one hour to complete. Ninety percent of onboarded teams adopt the workflow within the first quarter after launch. The weekly scorecard tracks pull-request throughput per repository. Mean time to remediation stays below four hours across onboarded services.",
    },
    {
      id: "sec-acceptance",
      text: "The change-to-pull-request flow completes in under five minutes from the change landing to the pull request opening. Every generated pull request includes a rollback plan. Reviewers receive a Slack notification within one minute of a pull request opening.",
    },
  ],
  recordings: {
    "r4pbzyp_7991": "{\n  \"summary\": \"The change-detection service provides configuration monitoring with specific latency, throughput, and reliability performance targets.\",\n  \"claims\": [\n    {\n      \"text\": \"The change-detection service detects any configuration change within five minutes of the change landing in the main branch.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"The detector polls each repository every thirty seconds.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"Detection runs on three replicas in the us-east-1 region.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"Detection events are written to the audit log within ten seconds.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"The pipeline sustains a throughput of five hundred change events per minute.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"The health-check endpoint responds within two hundred milliseconds.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1gimi24_5261": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}",
    "r1ii643d_8898": "{\n  \"summary\": \"This section outlines performance expectations and tracking metrics for the change-to-pull-request automation workflow.\",\n  \"claims\": [\n    {\n      \"text\": \"The end-to-end change-to-pull-request flow may take up to one hour to complete.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"Ninety percent of onboarded teams adopt the workflow within the first quarter after launch.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"The weekly scorecard tracks pull-request throughput per repository.\",\n      \"kind\": \"fact_claim\"\n    },\n    {\n      \"text\": \"Mean time to remediation stays below four hours across onboarded services.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The metric lacks a definition for the start and end points of the remediation process.\",\n      \"substring\": \"Mean time to remediation\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1sazhlg_5497": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}",
    "rjl9jnr_9162": "{\n  \"summary\": \"This section defines performance targets for the automated pull request generation and notification workflow.\",\n  \"claims\": [\n    {\n      \"text\": \"The change-to-pull-request flow completes in under five minutes from the change landing to the pull request opening.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"Every generated pull request includes a rollback plan.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"Reviewers receive a Slack notification within one minute of a pull request opening.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The five-minute completion target contradicts the one-hour end-to-end flow duration established in the document context.\",\n      \"substring\": \"completes in under five minutes\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "rplammf_5091": "{\n  \"contradictions\": [\n    {\n      \"newClaimText\": \"The change-to-pull-request flow completes in under five minutes from the change landing to the pull request opening.\",\n      \"existingClaimId\": 4,\n      \"message\": \"The claim that the flow completes in under five minutes contradicts the statement that the end-to-end flow may take up to one hour to complete.\"\n    }\n  ],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "contradiction",
      sectionId: "sec-acceptance",
      substring: "five minutes",
      note: "THE POINT OF THIS FIXTURE: β (change-to-PR under 5 min, Acceptance Criteria) contradicts γ (change-to-PR up to 1 hour, Success Metrics). γ sat 4 candidates deep in a >10-claim ledger; the compatible near-duplicate α (change→detection < 5 min) would have crowded it out of the old blob top-10, so per-claim selection keeping γ present is what lets the adjudicator fire here.",
    },
    {
      type: "clarity",
      sectionId: "sec-metrics",
      substring: "start and end points",
      note: "Incidental (frozen model output): the fast eval flags the undefined mean-time-to-remediation measurement window — a genuine, separate clarity signal, not related to the contradiction.",
    },
    {
      type: "clarity",
      sectionId: "sec-acceptance",
      substring: "one-hour end-to-end",
      note: "Incidental (frozen model output): the fast eval also notices the <5 min vs 1 hour conflict and launders it as a clarity nit (the OBS-033 pattern). The strong-tier contradiction above is the authoritative surfacing; this clarity rides alongside it. Encoded as ground truth so the ratchet flags any change.",
    },
  ],
};

export default fixture;
