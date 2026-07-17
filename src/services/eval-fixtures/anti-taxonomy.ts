/**
 * Fixture: anti-taxonomy
 *
 * A substantively strong section — specific team, concrete deadline, fully
 * defined metric with measurement window — that guards against surface drift:
 * the model must not fire grammar, style, or readability observations on
 * text that is semantically clear, even if prose is dense (G2).
 *
 * Expected: zero observations.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "anti-taxonomy",
  description: "Poor grammar but solid substance → zero grammar observations (anti-taxonomy guard)",
  sections: [
    {
      id: "sec1",
      text: "The infrastructure team will deliver the PostgreSQL payment processing backend by Q4 2025. This component has a 99.9% uptime requirement, defined as no more than 8.7 hours of downtime per rolling 12-month window.",
    },
  ],
  recordings: {
    "r1yx7uek_8354": "{\n  \"summary\": \"The infrastructure team commits to delivering a PostgreSQL payment backend by Q4 2025 with a 99.9% uptime target.\",\n  \"claims\": [\n    {\n      \"text\": \"The infrastructure team will deliver the PostgreSQL payment processing backend by Q4 2025.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"This component has a 99.9% uptime requirement, defined as no more than 8.7 hours of downtime per rolling 12-month window.\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [],
};

export default fixture;
