/**
 * Fixture: anti-taxonomy
 *
 * A substantively strong section with deliberate poor grammar, passive voice,
 * and awkward phrasing.
 *
 * Expected: zero GRAMMAR observations (one valid clarity observation is acceptable).
 *
 * This guards against the "surface drift" failure mode where the model starts
 * acting like a grammar checker (G2).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "anti-taxonomy",
  description: "Poor grammar but solid substance → zero grammar observations (anti-taxonomy guard)",
  sections: [
    {
      id: "sec1",
      text: "The infrastructure team will deliver the PostgreSQL payment processing backend by Q4 2025. This component has a 99.9% uptime requirement.",
    },
  ],
  recordings: {
    "r1thv9vx_2966": "{\n  \"summary\": \"The infrastructure team is committed to delivering a PostgreSQL-based payment processing backend with 99.9% uptime by Q4 2025.\",\n  \"claims\": [\n    {\n      \"text\": \"The infrastructure team will deliver the PostgreSQL payment processing backend by Q4 2025.\",\n      \"kind\": \"commitment\"\n    },\n    {\n      \"text\": \"This component has a 99.9% uptime requirement.\",\n      \"kind\": \"constraint\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The scope of the 'payment processing backend' is not defined, making it unclear what specific functionality or services are included.\",\n      \"substring\": \"payment processing backend\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}"
  },
  expected: [
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "payment processing backend",
    }
  ],
};

export default fixture;
