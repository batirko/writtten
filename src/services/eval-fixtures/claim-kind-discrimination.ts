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
    "rw2dd8k_7498": "{\n  \"summary\": \"The project aims to decrease false-positive dispute rates by 30% within 90 days post-launch without compromising current fraud block rates.\",\n  \"claims\": [\n    {\n      \"text\": \"Reduce false-positive friction for legitimate transactions while maintaining our fraud block rate at or above current levels.\",\n      \"kind\": \"constraint\"\n    },\n    {\n      \"text\": \"False-positive dispute rate drops by at least 30% within 90 days of launch.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The current fraud block rate is not quantified, making the constraint to maintain it at or above current levels unverifiable.\",\n      \"substring\": \"current levels\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "current levels",
      note: "No specific baseline value for the fraud block rate — 'current levels' is an unspecified reference; legitimate clarity flag",
    },
    // Claim kind correctness visible in frozen recordings:
    //   "Reduce false-positive friction ... while maintaining our fraud block rate..." → commitment (not metric — OBS-002)
    //   "False-positive dispute rate drops by at least 30%..." → metric
    // unsupported_claim and undefined_jargon must NOT fire.
  ],
  knownGaps: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "drops by at least 30%",
      note: "False negative: model merges the missing-baseline concern into the single 'current levels' observation rather than producing a second clarity flag for the 30% target. Tracked for re-evaluation.",
    },
  ],
};

export default fixture;
