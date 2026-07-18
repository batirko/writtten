/**
 * Fixture: loose-topical-overlap (OBS-027 behavioural discrimination — case c, boundary)
 *
 * The sharpest suppression-boundary case: §1 merely *mentions* the topic
 * (email rendering / templating latency) without *defining* §2's coined term
 * ("Zephyr rendering pipeline"). Loose topical overlap is not a definition, so
 * §2 must STILL flag the term — the "Established elsewhere" block is present but
 * does not resolve it.
 *
 * Contrast with cross-section-reference-resolved (where §1 genuinely defines the
 * term → suppressed) and cross-section-genuine-gap (where §1 is on a different
 * subject entirely). Here the sibling is topically adjacent but non-resolving —
 * the case a too-eager suppressor would wrongly silence.
 *
 * Discrimination (encoded POSITIVELY): undefined_jargon fires on "Zephyr" in §2.
 *
 * See docs/projects/section_eval_precision.md (OBS-027, "loose topical overlap
 * is not a definition").
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "loose-topical-overlap",
  description:
    "A sibling that mentions the topic but does not define the term does not suppress the flag (OBS-027c)",
  stage: "Product Requirements Document — internal",
  sections: [
    {
      id: "sec-background",
      text: "Background\n\nDuring the review, email rendering came up repeatedly, and the team agreed that templating latency was a recurring source of slow onboarding.",
    },
    {
      id: "sec-approach",
      text: "Approach\n\nWe will adopt the Zephyr rendering pipeline as the standard path for all lifecycle emails going forward.",
    },
  ],
  recordings: {
    "r19i3cfu_7647": "{\n  \"summary\": \"The team identified templating latency in email rendering as a primary cause of slow onboarding.\",\n  \"claims\": [\n    {\n      \"text\": \"templating latency was a recurring source of slow onboarding\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The term 'templating latency' lacks a specific definition or measurement baseline to quantify the impact on onboarding.\",\n      \"substring\": \"templating latency\"\n    }\n  ],\n  \"unsupported_claim_observations\": [\n    {\n      \"text\": \"No data or user research is cited to support the assertion that templating latency is the cause of slow onboarding.\",\n      \"substring\": \"templating latency was a recurring source of slow onboarding\"\n    }\n  ],\n  \"undefined_jargon_observations\": []\n}",
    "rsv5bww_8251": "{\n  \"summary\": \"The team is standardizing all lifecycle email rendering on the Zephyr pipeline.\",\n  \"claims\": [\n    {\n      \"text\": \"We will adopt the Zephyr rendering pipeline as the standard path for all lifecycle emails going forward.\",\n      \"kind\": \"commitment\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The scope of 'lifecycle emails' is undefined, leaving it unclear if this includes transactional, marketing, or automated system notifications.\",\n      \"substring\": \"lifecycle emails\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"The Zephyr rendering pipeline is not a standard industry term and lacks a definition within the provided glossary.\",\n      \"substring\": \"Zephyr rendering pipeline\"\n    }\n  ]\n}",
    "r1udsmdv_4537": "{\n  \"contradictions\": [],\n  \"tensions\": [\n    {\n      \"newClaimText\": \"We will adopt the Zephyr rendering pipeline as the standard path for all lifecycle emails going forward.\",\n      \"existingClaimId\": 0,\n      \"message\": \"The Zephyr rendering pipeline introduces new architectural complexity, while the existing claim identifies templating latency as a primary bottleneck for onboarding.\"\n    }\n  ]\n}"
  },
  expected: [
    // THE DISCRIMINATION: undefined_jargon still fires on "Zephyr rendering
    // pipeline" in §2, even though §1 loosely mentions email rendering/templating.
    // Loose topical overlap is not a definition — a too-eager suppressor would
    // wrongly silence this. A regression that treats mere topical mention as
    // resolution drops recall here.
    {
      type: "undefined_jargon",
      sectionId: "sec-approach",
      substring: "Zephyr",
      note: "Loose overlap in §1 (email rendering/templating) is not a definition — the coined term must still fire.",
    },
    // Incidental true-positives (frozen by the recording):
    {
      type: "clarity",
      sectionId: "sec-background",
      substring: "templating latency",
      note: "Legitimate: 'templating latency' has no definition/measurement baseline.",
    },
    {
      type: "unsupported_claim",
      sectionId: "sec-background",
      substring: "No data",
      note: "Legitimate: no data cited for templating latency being the cause of slow onboarding.",
    },
    {
      type: "clarity",
      sectionId: "sec-approach",
      substring: "lifecycle emails",
      note: "Legitimate: 'lifecycle emails' scope undefined (transactional vs marketing vs system).",
    },
    {
      type: "strategic_tension",
      sectionId: "sec-approach",
      substring: "architectural complexity",
      note: "Cross-section side-effect: adopting Zephyr (new complexity) tensions against §1's templating-latency-is-the-bottleneck framing.",
    },
  ],
};

export default fixture;
