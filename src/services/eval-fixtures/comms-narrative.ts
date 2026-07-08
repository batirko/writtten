/**
 * Fixture: comms-narrative (OBS-023)
 *
 * Document-type calibration — the comms_announcement class. In a public
 * announcement, rhetorical / narrative framing is genre-normal and must NOT be
 * flagged as an `unsupported_claim` (the OBS-023 false positive), while an
 * unattributed hard statistic about the world still MUST flag (the conservative
 * dial keeps genuine external-fact citation on).
 *
 * `stage` classifies to `comms_announcement` → the section-tier calibration
 * block is injected. See docs/projects/document_type_calibration.md and
 * docs/logs/prompt_quality_observations.md (OBS-023).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "comms-narrative",
  description: "Comms narrative framing is not unsupported; an unattributed statistic still is (OBS-023)",
  stage: "A public announcement about a new product feature",
  sections: [
    {
      id: "announce",
      text: "Today we're launching Instant Refunds. Waiting days for a refund has felt like being told your money matters less than the company's, and that changes now. Refund delays cost the average retailer 12% of repeat purchases.",
    },
  ],
  recordings: {
    "rzy9k05_7213": "{\n  \"summary\": \"The company is introducing Instant Refunds to improve customer experience and mitigate the negative impact of refund delays on repeat purchases.\",\n  \"claims\": [\n    {\n      \"text\": \"Refund delays cost the average retailer 12% of repeat purchases.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The assertion that refund delays cause a specific 12% loss in repeat purchases for the average retailer lacks a cited source or study.\",\n      \"substring\": \"Refund delays cost the average retailer 12% of repeat purchases.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "unsupported_claim",
      sectionId: "announce",
      substring: "12%",
      note: "The retailer statistic is an unattributed hard external-fact and must flag even in comms.",
    },
  ],
  knownGaps: [
    {
      type: "unsupported_claim",
      sectionId: "announce",
      substring: "money matters less",
      note: "The rhetorical/narrative framing must NOT flag under comms calibration (OBS-023). Tracked so a regression that re-flags it is visible in the Tier-2 scorecard.",
    },
  ],
};

export default fixture;
