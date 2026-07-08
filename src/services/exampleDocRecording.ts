/**
 * Recorded LLM responses for the "See it in action" example document.
 *
 * Hybrid fixture (owner-directed, docs/projects/onboarding_first_run.md
 * § Revision 2026-07-07 — curate for variety, not volume):
 *
 *   - The request KEYS + each response's `summary`/`claims` are captured from a
 *     real Gemini run at WEAK capability (free key) — the same capability a
 *     keyless first-run user evaluates at — so the request hashes match on
 *     replay AND the downstream sweep/doc-scan prompts (built from summaries +
 *     claims) hash identically.
 *   - The OBSERVATION arrays are then curated to one clean exemplar per type, so
 *     the demo shows the product's RANGE rather than clustering on clarity and
 *     re-flagging the contradiction. Observations are output-only (never a
 *     prompt input), so curating them cannot change any request hash.
 *
 * The six cards, one per capability:
 *   undefined_jargon (Overview: "BM25") · clarity (Success metrics: "feel
 *   trustworthy") · unsupported_claim (Problem: "nearly a third") ·
 *   contradiction + strategic_tension (cross-document sweep: Q2-vs-Q3 launch,
 *   four-week build vs six-week beta lead) · missing_topic (doc scan: no
 *   data-privacy topic).
 *
 * When the user loads the example with no working key, App switches the router
 * to `mock` mode and installs these recordings; the pipeline replays them with
 * zero network calls. With a key present, they arm the live-error fallback.
 *
 * Regenerate: rewrite src/services/exampleDoc.ts, re-run the weak-tier capture
 * (the example load triggers section evals + the contradiction sweep + the
 * doc-scan — see App.handleLoadExample `docScan`), dump window.__sidecar__
 * .dumpRecordings(), then re-curate the observation arrays. Keyed by `reqHash`
 * (see model/mock.ts). See docs/projects/onboarding_first_run.md § The example.
 */
export const EXAMPLE_DOC_RECORDING: Record<string, string> = {
  rwi9wch_6911:
    '{"summary":"This document introduces Sidecar Review, a non-editing companion tool that uses BM25 ranking to surface document issues for the author.","claims":[{"text":"Sidecar Review is a companion panel that watches a working document and surfaces observations.","kind":"definition"},{"text":"Observations appear beside the draft, ranked by a lightweight BM25 pass over the text.","kind":"fact_claim"}],"clarity_observations":[],"unsupported_claim_observations":[],"undefined_jargon_observations":[{"text":"The ranking method \\"BM25\\" is named but never defined for the PM audience.","substring":"BM25"}]}',
  r1jz9g4p_6685:
    '{"summary":"The project targets a Q2 2026 public launch, preceded by a six-week private beta and a four-week engineering effort for the core pipeline.","claims":[{"text":"We are committing to a public launch in Q2 2026","kind":"commitment"},{"text":"private beta for design partners six weeks earlier","kind":"commitment"},{"text":"Engineering has sized the core pipeline at four weeks","kind":"fact_claim"}],"clarity_observations":[],"unsupported_claim_observations":[],"undefined_jargon_observations":[]}',
  rcrq1zz_6832:
    '{"summary":"The section outlines adoption targets, qualitative success tracking, and the Q3 2026 launch timeline.","claims":[{"text":"We will measure adoption by weekly active documents, targeting five hundred within the first quarter.","kind":"metric"},{"text":"Beyond adoption, we will track whether the observations feel trustworthy to authors.","kind":"commitment"},{"text":"The public launch is firmly set for Q3 2026, giving us a full quarter of beta feedback before general availability.","kind":"commitment"}],"clarity_observations":[{"text":"\\"Feel trustworthy\\" sets no measurable bar — the section never says how trust is observed or counted.","substring":"whether the observations feel trustworthy to authors"}],"unsupported_claim_observations":[],"undefined_jargon_observations":[]}',
  r34am6e_6627:
    '{"summary":"This section defines the scope boundaries for the project by explicitly excluding text generation and rewriting capabilities.","claims":[{"text":"The assistant will not generate or rewrite document text in any phase.","kind":"constraint"}],"clarity_observations":[],"unsupported_claim_observations":[],"undefined_jargon_observations":[]}',
  r244asd_6772:
    '{"summary":"Product managers spend significant time manually reconciling document inconsistencies due to limitations in current tooling.","claims":[{"text":"PMs spend nearly a third of every week hunting for inconsistencies in their own specs.","kind":"fact_claim"}],"clarity_observations":[],"unsupported_claim_observations":[{"text":"No source or data is cited for the claim that PMs lose nearly a third of each week to reconciliation.","substring":"PMs spend nearly a third of every week hunting for inconsistencies in their own specs."}],"undefined_jargon_observations":[]}',
  rcgs0aq_4881:
    '{"contradictions":[{"claimAId":7,"claimBId":8,"message":"The launch is set for Q3 2026 here, while the timeline commits to a public launch in Q2 2026."}],"tensions":[{"claimAId":1,"claimBId":4,"message":"Sizing the core pipeline at four weeks pulls against giving design partners a private beta six weeks before launch — the build leaves no lead time to spare."}]}',
  r1gsf8s3_4810:
    '{"missing_topic_observations":[{"text":"Nothing addresses how the tool handles the private document data it watches — a privacy and security expectation for a PRD like this."}],"underexposed_topic_observations":[],"audience_mismatch_observations":[],"structure_flow_observations":[],"suggested_stage":null}',
};
