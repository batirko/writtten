/**
 * Fixture: jargon-audience-inferred
 *
 * Audience-relative jargon calibration (OBS-003/OBS-005). No document context is
 * set, so the audience is inferred IN-CHECK from the section's own register:
 * dense observability-engineering prose implies an engineering audience that
 * shares its vocabulary. None of the domain terms are in JARGON_PRESET, so only
 * audience inference (not the static list) can suppress them.
 *
 *   - "high-cardinality series", "histogram buckets", "exemplars", "p99 latency"
 *     — standard observability vocabulary for the inferred audience → must NOT fire.
 *   - "QRZ sampler" — an invented, undefined coinage → SHOULD fire.
 *
 * The negative assertions are encoded by omission from `expected` (a jargon flag
 * on any domain term would drop Tier-1 precision below 1). Note: a bare acronym
 * the audience knows (e.g. "OTLP") is deliberately kept OUT of the text — the
 * weak fast-tier model still reflexively flags standalone acronyms it can't tell
 * apart from invented ones, so distinguishing a *real* domain acronym from a
 * coinage is a strong-tier property (tracked by the free-tier expectations
 * milestone), not one the Tier-1 fast-call fixture can honestly assert.
 */
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "jargon-audience-inferred",
  description:
    "Inferred-audience jargon: domain vocab not flagged, an invented coinage still fires (OBS-003/005)",
  sections: [
    {
      id: "sec1",
      text: "Overview\n\nThe collector batches spans and downsamples high-cardinality series into fixed histogram buckets, retaining exemplars for the p99 latency tail. Raw spans age out of hot storage while the aggregated exemplars persist. Every ingested trace passes through the QRZ sampler before it reaches the write path.",
    },
  ],
  recordings: {
    "r106exfb_8732": "{\n  \"summary\": \"The collector processes trace data by downsampling high-cardinality series and using a specific sampler before storage.\",\n  \"claims\": [\n    {\n      \"text\": \"The collector batches spans and downsamples high-cardinality series into fixed histogram buckets, retaining exemplars for the p99 latency tail.\",\n      \"kind\": \"fact_claim\"\n    },\n    {\n      \"text\": \"Raw spans age out of hot storage while the aggregated exemplars persist.\",\n      \"kind\": \"fact_claim\"\n    },\n    {\n      \"text\": \"Every ingested trace passes through the QRZ sampler before it reaches the write path.\",\n      \"kind\": \"fact_claim\"\n    }\n  ],\n  \"clarity_observations\": [\n    {\n      \"text\": \"The duration or criteria for when raw spans age out of hot storage is not specified.\",\n      \"substring\": \"age out\"\n    }\n  ],\n  \"unsupported_claim_observations\": [],\n  \"undefined_jargon_observations\": [\n    {\n      \"text\": \"The term QRZ refers to a specific sampler without definition or context.\",\n      \"substring\": \"QRZ\"\n    }\n  ],\n  \"suggested_stage\": \"Technical architecture overview for infrastructure or observability engineers.\"\n}",
    "rprnx3a_4999": "{\n  \"contradictions\": [],\n  \"tensions\": []\n}"
  },
  expected: [
    {
      type: "undefined_jargon",
      sectionId: "sec1",
      substring: "QRZ",
      note: "QRZ sampler is an invented, undefined coinage — should fire even for the technical audience",
    },
    {
      type: "clarity",
      sectionId: "sec1",
      substring: "age out",
      note: "Incidental true-positive: 'age out' has no specified duration/criteria — a legitimate clarity gap, not jargon",
    },
    // high-cardinality series, histogram buckets, exemplars, p99 latency are
    // standard vocabulary for the inferred engineering audience — must NOT fire.
  ],
};

export default fixture;
