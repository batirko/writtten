/**
 * Fixture: contradiction-short-paste
 *
 * The UX-016 hero anchor (Phase 8A). A short, punchy draft — two ~7-word claims,
 * well under the old 150-word `CONTENT_THRESHOLD_WORDS` cliff — with a blatant
 * cross-section contradiction (a 60-second challenge window vs a 30-second one).
 * Before Phase 8A the editor gated the bulk-paste sweep behind that word cliff,
 * so this draft produced *no* contradiction card — the "impressive check doesn't
 * run when you'd most want it" failure. The gate is gone; the sweep's own
 * `< 2 claims` guard is the real precondition, and a two-claim paste clears it.
 *
 * This fixture pins the engine-level guarantee: seeded straight into the ledger
 * (the `runSweep` path bypasses the now-removed editor gate), two contradictory
 * claims still fire the sweep and surface one `contradiction`. See
 * docs/projects/contradiction_coverage.md § Phase 8A and
 * docs/logs/ux_quality_observations.md (UX-016).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "contradiction-short-paste",
  description:
    "A short (<150-word) two-claim paste with a blatant cross-section contradiction still fires the sweep (UX-016 / Phase 8A)",
  stage: "Product Requirements Document — internal",
  sweep: true,
  sections: [],
  seedClaims: [
    { text: "The challenge window is 60 seconds.", kind: "constraint", sourceBlockId: "b-spec" },
    {
      text: "The challenge window expires in 30 seconds.",
      kind: "constraint",
      sourceBlockId: "b-limits",
    },
  ],
  recordings: {
    // Sorted by text: "…expires in 30 seconds." (b-limits) = #0; "…is 60 seconds." (b-spec) = #1.
    r13yq99w_4253:
      '{\n  "contradictions": [\n    {\n      "claimAId": 1,\n      "claimBId": 0,\n      "message": "This sets the challenge window at 60 seconds, which contradicts the 30-second expiry stated for the same window."\n    }\n  ],\n  "tensions": []\n}',
  },
  expected: [
    {
      type: "contradiction",
      sectionId: "b-spec",
      substring: "60 seconds",
      note: "A tiny two-claim short draft still yields the cross-section contradiction hero card once the word gate is gone (UX-016).",
    },
  ],
};

export default fixture;
