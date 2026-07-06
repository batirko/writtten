/**
 * Document maturity proxy — R2 (maturity-aware severity).
 *
 * Pure, synchronous, zero LLM calls (Invariant 3 — no per-keystroke scans;
 * this runs at doc-idle). A crude, deliberately-coarse structural read of "how
 * far along is this draft", used to decide two things:
 *
 *   1. Whether the doc-level "how it fits overall" pass earns its keep at all
 *      (arm when the level is not `nascent`). This replaces the old raw
 *      150-word cliff, so a *structurally-complete short draft* (an essay with
 *      intro/body/conclusion but few words) gets doc-level fit while a
 *      genuinely half-formed one stays quiet (UX-013).
 *   2. Whether structural gaps surface as soft "opportunities" (`forming`) or
 *      firm "warnings" (`mature`) — kind + severity + voice (see priority.ts,
 *      evaluator.ts).
 *
 * The proxy is intentionally rough: a long, bad draft can score `mature`. The
 * cost of being wrong is small and graded by everything downstream — a
 * mis-scored gap is still precision-gated, still located-not-prescribed. v1 is
 * a three-band split; a continuous score + revision-activity signal are the
 * natural deferred refinement.
 *
 * Design: docs/projects/maturity_aware_severity.md
 */

export type MaturityLevel = "nascent" | "forming" | "mature";

/** Structural signals the proxy reads. Both are cheap to compute from the live
 *  editor (word count across blocks; number of top-level blocks). */
export interface MaturitySignals {
  wordCount: number;
  blockCount: number;
}

// ---------------------------------------------------------------------------
// Provisional thresholds — V1-calibrated.
//
// These constants are a first, deliberately-conservative guess. They ship
// provisional and get calibrated against real PRDs by field_validation.md (V1)
// and stress-tested for the OBS-010 abrasiveness hypothesis by V2. Tune here.
// ---------------------------------------------------------------------------

/** `mature` — the draft is substantially developed: firm, located warnings. */
const MATURE_MIN_WORDS = 400;
const MATURE_MIN_BLOCKS = 6;

/** `forming` — armed for doc-level checks, soft-voiced. Either the old word bar
 *  (so nothing regresses) OR a structurally-complete short draft: enough
 *  distinct blocks with real content to read as intentionally-shaped. */
const FORMING_MIN_WORDS = 150;
const SHORT_DRAFT_MIN_BLOCKS = 4;
const SHORT_DRAFT_MIN_WORDS = 80;

/**
 * Classify a document's maturity from its structural signals.
 * Pure and synchronous. See the module header for how each band is consumed.
 */
export function documentMaturity({ wordCount, blockCount }: MaturitySignals): MaturityLevel {
  if (wordCount >= MATURE_MIN_WORDS && blockCount >= MATURE_MIN_BLOCKS) {
    return "mature";
  }
  if (
    wordCount >= FORMING_MIN_WORDS ||
    (blockCount >= SHORT_DRAFT_MIN_BLOCKS && wordCount >= SHORT_DRAFT_MIN_WORDS)
  ) {
    return "forming";
  }
  return "nascent";
}

/** True when the document is developed enough to earn the doc-level pass — the
 *  arm gate that replaces the raw word-count cliff (UX-013). */
export function isDocLevelArmed(signals: MaturitySignals): boolean {
  return documentMaturity(signals) !== "nascent";
}
