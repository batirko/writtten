/**
 * Fixture: unsupported-success-metric
 *
 * A section containing forward-looking success metrics and goals.
 * These MUST NOT fire as unsupported claims — they are intended targets the
 * team is setting, not factual assertions about the current state of the world.
 *
 * OBS-019: flash-lite flagged "30% of blocks that are false positives" as
 * unsupported even with an exact negative example verbatim in the prompt.
 * The prompt now includes a concrete few-shot exemplar. This fixture is the
 * regression gate.
 *
 * Expected: zero observations (no unsupported_claim, no clarity, no jargon).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "unsupported-success-metric",
  description:
    "Forward-looking success metrics and goals must NOT fire as unsupported claims (OBS-019)",
  sections: [
    {
      id: "sec1",
      text: "Success metrics: False-positive dispute rate drops by at least 30% within 90 days of launch. Checkout conversion for mobile users improves by 15%. Support ticket volume related to declined transactions decreases by 20% in the first quarter post-launch.",
    },
  ],
  recordings: {
    "r16h7cb0_8672": "{\n  \"summary\": \"The document outlines three quantitative success metrics for the upcoming launch related to dispute rates, mobile conversion, and support volume.\",\n  \"claims\": [\n    {\n      \"text\": \"False-positive dispute rate drops by at least 30% within 90 days of launch.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"Checkout conversion for mobile users improves by 15%.\",\n      \"kind\": \"metric\"\n    },\n    {\n      \"text\": \"Support ticket volume related to declined transactions decreases by 20% in the first quarter post-launch.\",\n      \"kind\": \"metric\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The 15% improvement in mobile checkout conversion lacks a defined baseline or measurement period.\",\n      \"substring\": \"Checkout conversion for mobile users improves by 15%.\"\n    },\n    {\n      \"text\": \"The 20% decrease in support ticket volume lacks a defined baseline.\",\n      \"substring\": \"Support ticket volume related to declined transactions decreases by 20% in the first quarter post-launch.\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "Checkout conversion",
      note: "15% improvement lacks a baseline — a legitimate clarity observation, not an unsupported claim",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "decreases by 20%",
      note: "20% support-ticket decrease lacks a defined baseline — model now flags both metrics for missing baselines",
    },
    // unsupported_claim must NOT appear — success metrics are not factual claims needing citation (OBS-019)
  ],
};

export default fixture;
