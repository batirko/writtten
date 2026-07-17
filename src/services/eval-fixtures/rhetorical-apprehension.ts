/**
 * Fixture: rhetorical-apprehension (OBS-036)
 *
 * The cold-open calibration case. An **un-staged** document (no stage set →
 * `unknown` class) carrying a first-person apprehension framed as a **rhetorical
 * question** ("won't my writing muscles atrophy?") must NOT be flagged as an
 * `unsupported_claim` — while an unattributed present-tense world-fact statistic
 * in the same passage still MUST flag.
 *
 * Exercises both OBS-036 levers together:
 *  - (b) the always-on first-person carve-out extended to interrogative/hypothetical
 *    framings in `MERGED_SYSTEM_PROMPT`;
 *  - (a) the softened `unknown`-class cold-open block, so an un-staged doc leans
 *    essay/comms-relaxed on `unsupported_claim` before a class is confirmed.
 *
 * See docs/projects/document_type_calibration.md (§ live gap 2026-07-08) and
 * docs/logs/prompt_quality_observations.md (OBS-036). `expected` is set from the
 * recorded live output.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "rhetorical-apprehension",
  description:
    "Un-staged (unknown-class) rhetorical-question apprehension is not unsupported; an unattributed statistic still is (OBS-036)",
  // no `stage` → classifyDocumentClass → "unknown" (the cold-open default)
  sections: [
    {
      id: "essay",
      text: "If I let the model draft every paragraph for me, won't my own writing muscles slowly atrophy? Handwriting improves long-term memory retention by 40% compared to typing.",
    },
  ],
  recordings: {
    "rromclm_8310": "{\n  \"summary\": \"The author questions the impact of AI-assisted writing on cognitive skills, citing a statistic about handwriting and memory.\",\n  \"claims\": [\n    {\n      \"text\": \"Handwriting improves long-term memory retention by 40% compared to typing.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"No source or study is cited to support the 40% improvement figure for handwriting-based memory retention.\",\n      \"substring\": \"Handwriting improves long-term memory retention by 40% compared to typing.\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "unsupported_claim",
      sectionId: "essay",
      substring: "40%",
      note: "The handwriting statistic is an unattributed present-tense world-fact and must flag even under the softened unknown default.",
    },
  ],
  knownGaps: [
    {
      type: "unsupported_claim",
      sectionId: "essay",
      substring: "atrophy",
      note: "The rhetorical-question apprehension must NOT flag (OBS-036 lever b + unknown cold-open). Tracked so a regression that re-flags it shows in the Tier-2 scorecard.",
    },
  ],
};

export default fixture;
