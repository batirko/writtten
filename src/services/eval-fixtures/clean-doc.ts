/**
 * Fixture: clean-doc
 *
 * A well-written, specific section with no ambiguity, no unsupported claims,
 * no undefined jargon, and no conflicting claims.
 *
 * Expected: ZERO observations.
 *
 * This is the false-positive guard — the "calm feed" invariant. If the
 * evaluator fires on this section, something is producing noise.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "clean-doc",
  description: "Clean, specific section → zero observations (false-positive guard)",
  sections: [
    {
      id: "sec1",
      text: "Goal: Reduce cart abandonment by 15% by Q3 2025 by removing the mandatory account-creation step from checkout. Success metric: checkout completion rate rises from 62% to 74% within 90 days of launch. Owner: Growth team.",
    },
  ],
  recordings: {
    "rypsdxm_5955": "{\n  \"summary\": \"The growth team aims to increase checkout completion by 12 percentage points by Q3 2025 by eliminating mandatory account creation.\",\n  \"claims\": [\n    {\n      \"text\": \"Reduce cart abandonment by 15% by Q3 2025 by removing the mandatory account-creation step from checkout.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"checkout completion rate rises from 62% to 74% within 90 days of launch.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"Owner: Growth team.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [],
};

export default fixture;
