/**
 * Fixture: contradiction-intra-section
 *
 * A blatant contradiction where BOTH conflicting claims live in the SAME
 * section (a heading-less draft is one intro section), so both are extracted in
 * one batch and keyed under the same section representative id. This is the
 * OBS-033 / UX-018 case: pre-mechanism-A the per-section contradiction check
 * excluded all same-section pairs (`sourceBlockId !== sectionId`) and the
 * all-pairs sweep only fired on paste, so a typed intra-section contradiction
 * surfaced — if at all — as a weak `clarity` nit, never as a `contradiction`.
 *
 * Mechanism A (contradiction_coverage.md) folds same-section claims into the
 * per-section contradiction pool when a section has ≥2 claims, so this now
 * surfaces as a `contradiction` while typing, with no new call cadence and no
 * maturity gate (also closing UX-016's intra-section short-draft facet).
 *
 * Expected: one `contradiction` observation anchored within the single section.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "contradiction-intra-section",
  description: "Typed same-section contradiction surfaces as `contradiction`, not a laundered `clarity` nit (OBS-033/UX-018)",
  sections: [
    {
      id: "intro",
      text: "We will launch the redesigned checkout to 100% of users in Q2. We will not launch the redesigned checkout to any users before Q4.",
    },
  ],
  recordings: {
    "r1hwy7ec_8271": "{\n  \"summary\": \"The redesigned checkout is committed to a 100% Q2 launch and, separately, barred from any launch before Q4.\",\n  \"claims\": [\n    {\n      \"text\": \"We will launch the redesigned checkout to 100% of users in Q2.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"We will not launch the redesigned checkout to any users before Q4.\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "rv6gefj_4349": "{\n  \"contradictions\": [\n    {\n      \"newClaimText\": \"We will not launch the redesigned checkout to any users before Q4.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The no-launch-before-Q4 constraint and the earlier commitment to launch to 100% of users in Q2 cannot both hold.\"\n    }\n  ],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "contradiction",
      sectionId: "intro",
      note: "Q2 100% launch commitment contradicts the no-launch-before-Q4 constraint; both claims are in the same section",
    },
  ],
};

export default fixture;
