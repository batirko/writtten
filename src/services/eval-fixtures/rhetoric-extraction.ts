/**
 * Fixture: rhetoric-extraction (OBS-037 Lever 1)
 *
 * Extraction-side calibration for rhetoric. Under a relaxed document class,
 * rhetorical/hyperbolic emphasis and narrative colour are NOT claims of any kind
 * and must stay out of the ledger — otherwise they seed a false `unsupported_claim`
 * and a regenerating false `strategic_tension` (the OBS-037 cascade). A genuine,
 * checkable statistic in the same essay still extracts AND flags.
 *
 * Discrimination:
 *   - "hype" section (pure hyperbole) → ZERO claims extracted (asserted at the
 *     claim level in rhetoricExtraction.test.ts — the ratchet only sees observations).
 *   - "research" section (a hard "40%" statistic) → extracted + `unsupported_claim`.
 *
 * `expected` / `recordings` are set from the recorded live output
 * (`EVAL_RECORD_ID=rhetoric-extraction npm run eval:record`) against the Lever-1
 * prompt. See docs/projects/document_type_calibration.md § Extraction & tension
 * calibration for rhetoric, and docs/logs/prompt_quality_observations.md (OBS-037).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "rhetoric-extraction",
  description: "Rhetorical hyperbole is not extracted as a claim; a genuine statistic still is (OBS-037)",
  stage: "A personal essay reflecting on AI and the craft of writing",
  sections: [
    {
      id: "hype",
      text: "When the chat interface arrived, it was a HUGE thing — honestly the tipping point for the entire AI revolution, a moment that changed everything overnight.",
    },
    {
      id: "research",
      text: "Setting the hype aside, handwriting improves long-term memory retention by 40% compared to typing.",
    },
  ],
  recordings: {
    "r13u71nt_8354": "{\n  \"summary\": \"The author identifies the introduction of the chat interface as the pivotal moment that catalyzed the AI revolution.\",\n  \"claims\": [],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1u2jf9n_8297": "{\n  \"summary\": \"Handwriting is asserted to be 40% more effective than typing for long-term memory retention.\",\n  \"claims\": [\n    {\n      \"text\": \"handwriting improves long-term memory retention by 40% compared to typing\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"No study or data source is cited for the 40% improvement figure.\",\n      \"substring\": \"handwriting improves long-term memory retention by 40% compared to typing\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "unsupported_claim",
      sectionId: "research",
      substring: "40%",
      note: "The handwriting statistic is a hard, checkable world-fact and must flag even in a relaxed class.",
    },
  ],
};

export default fixture;
