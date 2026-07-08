/**
 * The "See it in action" example document (Onboarding & first-run).
 *
 * A short, pre-written PRD the user can load with one click to *watch* the
 * live pipeline react — the hero moment is a real internal contradiction, but
 * the doc is engineered so its handful of observations each demonstrate a
 * *different* capability: a first-time user witnesses the tool's range, not the
 * same trick several times. (See docs/projects/onboarding_first_run.md
 * § Revision 2026-07-07 — curate for variety, not volume.)
 *
 * The user only observes: the AI reacts to text it did not author. This does
 * not introduce any fix/apply/rewrite affordance (Hard Invariant #1) — it is
 * the ordinary eval path running on a fixture we ship.
 *
 * Consumed via the editor's existing `importContent` path (App → Editor),
 * which installs the doc and schedules the cross-document contradiction sweep
 * once the document clears CONTENT_THRESHOLD_WORDS (150). This fixture is kept
 * comfortably above that so the sweep fires.
 *
 * Planted signals — one clean exemplar per type (the recorded weak-tier output
 * in exampleDocRecording.ts is what actually replays; this is the intent):
 *   - contradiction: "public launch in Q2 2026" (Timeline) vs. "public launch
 *     is firmly set for Q3 2026" (Success metrics) — same event, two dates.
 *   - tension: "core pipeline at four weeks" vs. a private beta "six weeks
 *     earlier" — competing timeline goals, not a logical impossibility.
 *   - unsupported_claim: "nearly a third of every week" attributed to vague
 *     "internal research" with no source.
 *   - undefined_jargon: "BM25" — a ranking term unfamiliar to the PM audience.
 *   - clarity: success framed on whether observations "feel trustworthy" — a
 *     vague, unmeasurable criterion (the adoption metric beside it is concrete,
 *     so it stays quiet).
 *   - missing_topic: nothing addresses how the tool handles the private
 *     document data it watches — an expected-but-absent topic for this doc type.
 *
 * See docs/projects/onboarding_first_run.md § The example.
 */

/** Document Context / Stage seeded alongside the example, so the eval is
 *  calibrated the way a real PRD would be. */
export const EXAMPLE_STAGE = "PRD";

/**
 * HTML (not markdown) so TipTap's `setContent` parses clean heading/paragraph
 * blocks. ~200 words — over the 150-word contradiction-sweep threshold.
 */
export const EXAMPLE_DOC_HTML = `<h2>Overview</h2>
<p>This PRD proposes "Sidecar Review", a companion panel that watches a working document and surfaces observations — unclear passages, unsupported claims, and internal contradictions — without ever editing the author's text. Observations appear beside the draft, ranked by a lightweight BM25 pass over the text. The goal is to sharpen the writer's own thinking, not to draft on their behalf.</p>
<h2>Problem</h2>
<p>Product managers lose hours reconciling documents they wrote themselves. Internal research shows PMs spend nearly a third of every week hunting for inconsistencies in their own specs. Existing tools either rewrite the prose or stay silent on meaning.</p>
<h2>Timeline</h2>
<p>We are committing to a public launch in Q2 2026, with a private beta for design partners six weeks earlier. Engineering has sized the core pipeline at four weeks.</p>
<h2>Success metrics</h2>
<p>We will measure adoption by weekly active documents, targeting five hundred within the first quarter. Beyond adoption, we will track whether the observations feel trustworthy to authors. The public launch is firmly set for Q3 2026, giving us a full quarter of beta feedback before general availability.</p>
<h2>Non-goals</h2>
<p>The assistant will not generate or rewrite document text in any phase. It observes; the author decides.</p>`;
