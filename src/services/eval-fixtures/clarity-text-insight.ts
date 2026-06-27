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
    "rgiov7x_5862": "{\n  \"summary\": \"The project aims to reduce support tickets related to declined transactions by 20% while maintaining current fraud loss levels.\",\n  \"claims\": [\n    {\n      \"text\": \"Support ticket volume for declined transactions decreases by 20%.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"Zero increase in confirmed fraud loss rate.\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The 20% reduction target lacks a baseline measurement or timeframe for achievement.\",\n      \"substring\": \"decreases by 20%\"\n    },\n    {\n      \"text\": \"The zero increase constraint lacks a defined baseline or measurement period.\",\n      \"substring\": \"Zero increase in confirmed fraud loss rate\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    // unsupported_claim must NOT appear — these are forward-looking success targets (OBS-019)
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "decreases by 20%",
      note: "20% reduction target lacks a baseline measurement or timeframe — insightful clarity (not source echo).",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "Zero increase",
      note: "Zero-increase constraint lacks a defined baseline or measurement period.",
    },
  ],
};

export default fixture;
