/**
 * Fixture: opinion-apprehension (OBS-028)
 *
 * Document-type calibration — the opinion/apprehension carve-out. A first-person
 * apprehension in reflective writing must NOT be flagged as an `unsupported_claim`
 * (it is the author's stance, not a factual assertion about the world), while an
 * unattributed present-tense world-fact in the same passage still MUST flag.
 *
 * Guards OBS-028: essay-grade first-person opinion was flagged as an unsupported
 * factual claim under PRD-grade strictness. See
 * docs/projects/document_type_calibration.md and
 * docs/logs/prompt_quality_observations.md (OBS-028).
 *
 * `expected` is set from the recorded live output (`npm run eval:record --
 * opinion-apprehension`) once the carve-out is in place.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "opinion-apprehension",
  description: "First-person apprehension is not unsupported; an unattributed world-fact still is (OBS-028)",
  stage: "A personal essay reflecting on writing habits",
  sections: [
    {
      id: "essay",
      text: "I fear that leaning on AI to draft my writing will slowly erode my own skill. Separately, handwriting improves long-term memory retention by 40% compared to typing.",
    },
  ],
  recordings: {
    "r8mmfwh_8350": "{\n  \"summary\": \"The author reflects on the potential cognitive impact of AI-assisted writing and the memory benefits of handwriting.\",\n  \"claims\": [\n    {\n      \"text\": \"handwriting improves long-term memory retention by 40% compared to typing\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"The 40% figure for memory retention improvement lacks a cited study or source.\",\n      \"substring\": \"handwriting improves long-term memory retention by 40% compared to typing\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "unsupported_claim",
      sectionId: "essay",
      substring: "40%",
      note: "The handwriting statistic is an unattributed present-tense world-fact and must flag.",
    },
  ],
  knownGaps: [
    {
      type: "unsupported_claim",
      sectionId: "essay",
      substring: "erode my own skill",
      note: "The first-person apprehension must NOT flag (OBS-028 carve-out). Tracked so a regression that re-flags it is visible in the Tier-2 scorecard.",
    },
  ],
};

export default fixture;
