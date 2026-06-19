/**
 * Fixture: claim-kind-discrimination
 *
 * Guards OBS-002: the fast model conflates commitment/constraint/metric kinds.
 * Wrong kind breaks downstream priority escalation (commitment×commitment
 * contradiction escalation never fires when goals are typed as metric).
 *
 * One section mixes all three claim types:
 *   - A forward-looking goal → must be `commitment`
 *   - A named constraint ("at or above current levels") → must be `constraint`
 *   - A numbered target ("drops by at least 30%") → must be `metric`
 *
 * Expected: zero observations. The section is clear, attributed to no external
 * source, and uses no undefined jargon — any false-positive observation here
 * reveals a classification side-effect.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "claim-kind-discrimination",
  description:
    "Goal → commitment, constraint → constraint, numbered target → metric; no spurious observations (OBS-002)",
  sections: [
    {
      id: "sec1",
      text: "Goal: Reduce false-positive friction for legitimate transactions while maintaining our fraud block rate at or above current levels. Success metric: False-positive dispute rate drops by at least 30% within 90 days of launch.",
    },
  ],
  recordings: {
    "r1ecprip_4717": "{\n  \"summary\": \"The goal is to decrease false-positive transaction disputes by 30% within 90 days of launch while keeping the fraud block rate constant.\",\n  \"claims\": [\n    {\n      \"text\": \"Reduce false-positive friction for legitimate transactions while maintaining our fraud block rate at or above current levels.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"False-positive dispute rate drops by at least 30% within 90 days of launch.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The baseline for 'current levels' of fraud block rate is not specified.\",\n      \"substring\": \"at or above current levels\"\n    },\n    {\n      \"text\": \"The baseline for the current false-positive dispute rate is not specified.\",\n      \"substring\": \"False-positive dispute rate drops by at least 30%\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "current levels",
      note: "No specific baseline value for the fraud block rate — 'current levels' is an unspecified reference; legitimate clarity flag",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "drops by at least 30%",
      note: "No baseline for the current false-positive dispute rate specified; the 30% reduction target is relative to an unstated starting point",
    },
    // Claim kind correctness visible in frozen recordings:
    //   "Reduce false-positive friction ... while maintaining our fraud block rate..." → commitment (not metric — OBS-002)
    //   "False-positive dispute rate drops by at least 30%..." → metric
    // unsupported_claim and undefined_jargon must NOT fire.
  ],
};

export default fixture;
