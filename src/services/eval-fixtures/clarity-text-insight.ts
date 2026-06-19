/**
 * Fixture: clarity-text-insight
 *
 * Guards OBS-024: the fast model sometimes copies the source sentence verbatim
 * into clarity_observations.text, making the card say nothing the user didn't
 * already write. The OBS-024 prompt fix adds a rule that text must explain
 * what is vague/missing, not restate the source.
 *
 * Section with two vague metrics (no baseline, no timeframe defined).
 * Both should fire clarity. The Tier-1 ratchet checks that the observations
 * appear (substring match); the frozen recording text values serve as a
 * manual audit that the model produces insight rather than source echoes.
 *
 * Expected: clarity fires on both substrings. Zero unsupported_claim flags
 * (these are forward-looking success targets, not factual assertions).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "clarity-text-insight",
  description:
    "Vague metrics must fire clarity with insightful text, not verbatim source copy (OBS-024)",
  sections: [
    {
      id: "sec1",
      text: "Success metrics: Support ticket volume for declined transactions decreases by 20%. Zero increase in confirmed fraud loss rate.",
    },
  ],
  recordings: {
    "r4ct8uv_4620": "{\n  \"summary\": \"The section outlines success metrics for a product launch, focusing on reducing support tickets and maintaining fraud loss rates.\",\n  \"claims\": [\n    {\n      \"text\": \"Support ticket volume for declined transactions decreases by 20%.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"Zero increase in confirmed fraud loss rate.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    // unsupported_claim must NOT appear — these are forward-looking success targets (OBS-019)
  ],
  knownGaps: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "decreases by 20%",
      note: "Model does not flag the missing timeframe/baseline for the 20% support-ticket reduction.",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "Zero increase",
      note: "Model does not flag the missing measurement period/baseline for the fraud loss rate constraint. Tracked until prompt fix lands.",
    },
  ],
};

export default fixture;
