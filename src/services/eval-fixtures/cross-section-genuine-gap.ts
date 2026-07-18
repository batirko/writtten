/**
 * Fixture: cross-section-genuine-gap (OBS-027 behavioural discrimination — case d, recall guard)
 *
 * The recall side of the cross-section suppression: §1 establishes context on a
 * *different* subject (email templates owned by lifecycle marketing), so the
 * "Established elsewhere" block IS injected into §2 — but it does NOT resolve
 * §2's coined term ("Helios layout compiler"). A genuine gap no sibling resolves
 * must STILL fire, proving the suppression is scoped, not blanket ("Still flag a
 * reference this block does not actually resolve").
 *
 * Discrimination (encoded POSITIVELY): undefined_jargon fires on "Helios" in §2
 * despite the sibling context. A regression that over-suppresses (any sibling
 * context silences all flags) drops recall below 1.
 *
 * See docs/projects/section_eval_precision.md (OBS-027, fixture c / genuine gap).
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "cross-section-genuine-gap",
  description:
    "A coined term no sibling resolves still fires undefined_jargon despite cross-section context (OBS-027d)",
  stage: "Product Requirements Document — internal",
  sections: [
    {
      id: "sec-overview",
      text: "Overview\n\nThe onboarding flow sends a welcome email within five minutes of signup, using the message templates owned by the lifecycle marketing team.",
    },
    {
      id: "sec-detail",
      text: "Technical Detail\n\nThe welcome email is rendered by the Helios layout compiler before it is handed to the delivery service.",
    },
  ],
  recordings: {
    "r50vqnz_7643": "{\n  \"summary\": \"The onboarding process triggers a welcome email via lifecycle marketing templates within five minutes of user signup.\",\n  \"claims\": [\n    {\n      \"text\": \"The onboarding flow sends a welcome email within five minutes of signup.\",\n      \"kind\": \"fact_claim\"\n    },\n    {\n      \"text\": \"The welcome email uses message templates owned by the lifecycle marketing team.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": []\n}",
    "r1tv6ukq_4455": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}",
    "r5rvxt_8353": "{\n  \"summary\": \"The Helios layout compiler processes welcome emails prior to delivery.\",\n  \"claims\": [\n    {\n      \"text\": \"The welcome email is rendered by the Helios layout compiler before it is handed to the delivery service.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"The term Helios is not defined in the document or glossary.\",\n      \"substring\": \"Helios\"\n    }\n  ]\n}",
    "rbico3u_4389": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "undefined_jargon",
      sectionId: "sec-detail",
      substring: "Helios",
      note: "Coined term no sibling section resolves — must still fire even though sec-overview provides (unrelated) cross-section context. The recall guard for OBS-027 suppression.",
    },
  ],
};

export default fixture;
