/**
 * Recorded LLM responses for the "See it in action" example document.
 *
 * Hybrid fixture (owner-directed, docs/projects/onboarding_first_run.md
 * § Revision 2026-07-07 + the 2026-07-09 iteration): request KEYS + each
 * response's `summary`/`claims` are captured from a real Gemini run at WEAK
 * capability (free key) so request hashes match on replay AND the downstream
 * sweep/doc-scan prompts (built from summaries + claims) hash identically; the
 * OBSERVATION arrays are then curated to one clean exemplar per type. Curating
 * observations can't change any request hash (observations are output-only).
 *
 * The six cards, one per capability:
 *   undefined_jargon (Overview: "BM25") · unsupported_claim (Problem: "nearly a
 *   third") · clarity (Success metrics: "feel trustworthy") · contradiction +
 *   strategic_tension (cross-document sweep: Q2-vs-Q3 launch; staying quiet vs.
 *   measuring adoption) · missing_topic (doc scan: no go-to-market path).
 *
 * When the user loads the example with no working key, App switches the router
 * to `mock` mode and installs these recordings; the pipeline replays them with
 * zero network calls. With a key present, they arm the live-error fallback.
 *
 * Keys drift when the prompts change: `reqHash` is a hash of the request
 * (system + user), so any edit to MERGED_SYSTEM_PROMPT (section evals),
 * CONTRADICTION_SWEEP_SYSTEM_PROMPT[_HEDGED] (sweep) or DOC_LEVEL_SYSTEM_PROMPT
 * (doc-scan) re-keys the affected entries — a stale key silently misses in
 * `mock` mode (returns `{}`), which blanks the keyless demo. `exampleReplay.sync
 * .test.ts` is the CI guard: it replays this fixture through the real pipeline
 * and fails the moment a key drifts, so this can't ship broken again.
 *
 * Re-key (prompt changed, messages unchanged): the response bodies are
 * capability- and content-stable, so only the KEYS move. Recompute them by
 * replaying the example through the real pipeline while serving these exact
 * bodies (self-consistent by construction) and read back the requested hashes —
 * the guard test does exactly this replay. The observation arrays never change.
 *
 * Full regenerate (the doc or a body changed): rewrite src/services/exampleDoc.ts,
 * re-run the weak-tier capture (the example load triggers section evals + the
 * contradiction sweep + the doc-scan — see App.handleLoadExample `docScan`), dump
 * window.__sidecar__.dumpRecordings(), then re-curate the observation arrays.
 * Keyed by `reqHash` (see model/mock.ts). See docs/projects/onboarding_first_run.md
 * § The example.
 */
export const EXAMPLE_DOC_RECORDING: Record<string, string> = {
  r1cd8z3z_7018:
    '{"summary":"The assistant is restricted from generating or modifying document text to maintain a passive, observational role.","claims":[{"text":"The assistant will not generate or rewrite document text in any phase.","kind":"constraint"},{"text":"It stays quiet and never interrupts the writer.","kind":"constraint"}],"clarity_observations":[],"unsupported_claim_observations":[],"undefined_jargon_observations":[]}',
  r1rz4ilb_6965:
    '{"summary":"The project is scheduled for a public launch in Q2 2026.","claims":[{"text":"We are committing to a public launch in Q2 2026","kind":"commitment"}],"clarity_observations":[],"unsupported_claim_observations":[],"undefined_jargon_observations":[]}',
  r3cpbcd_7254:
    '{"summary":"This document introduces Sidecar Review, a non-editing companion tool that uses BM25 ranking to surface document quality issues to authors.","claims":[{"text":"Sidecar Review is a companion panel that watches a working document and surfaces observations.","kind":"definition"},{"text":"Observations appear beside the draft, ranked by a lightweight BM25 pass over the text.","kind":"fact_claim"}],"clarity_observations":[],"unsupported_claim_observations":[],"undefined_jargon_observations":[{"text":"The ranking method \\"BM25\\" is named but never defined for the PM audience.","substring":"BM25"}]}',
  r11zm99t_7115:
    '{"summary":"Product managers spend excessive time manually reconciling document inconsistencies due to limitations in current tooling.","claims":[{"text":"PMs spend nearly a third of every week hunting for inconsistencies in their own specs.","kind":"fact_claim"}],"clarity_observations":[],"unsupported_claim_observations":[{"text":"No source or data is cited for the claim that PMs lose nearly a third of each week to reconciliation.","substring":"PMs spend nearly a third of every week hunting for inconsistencies in their own specs."}],"undefined_jargon_observations":[]}',
  r1xqiyik_7226:
    '{"summary":"The section defines adoption and trust metrics for the feature and confirms a Q3 2026 launch date.","claims":[{"text":"We will measure adoption by weekly active documents","kind":"commitment"},{"text":"targeting five hundred within the first quarter","kind":"metric"},{"text":"The public launch is firmly set for Q3 2026","kind":"constraint"}],"clarity_observations":[{"text":"\\"Feel trustworthy\\" sets no measurable bar — the section never says how trust is observed or counted.","substring":"track whether the observations feel trustworthy to authors"}],"unsupported_claim_observations":[],"undefined_jargon_observations":[]}',
  r1gl8f5j_4638:
    '{"contradictions":[{"claimAId":6,"claimBId":7,"message":"The launch is set for Q3 2026 here, while the timeline commits to a public launch in Q2 2026."}],"tensions":[{"claimAId":0,"claimBId":8,"message":"Staying quiet and never interrupting the writer pulls against measuring success by weekly active documents — the tool is asked to recede and to be leaned on at once."}]}',
  rjmv60v_4478:
    '{"missing_topic_observations":[{"text":"The PRD sets a launch date and a target of five hundred active documents, but never says how PMs will discover the tool or start using it — there is no go-to-market or adoption path."}],"underexposed_topic_observations":[],"audience_mismatch_observations":[],"structure_flow_observations":[],"suggested_stage":null}',
};
