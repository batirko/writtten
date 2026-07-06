/**
 * Fixture format for the evaluator quality ratchet.
 *
 * Each fixture is a self-contained labeled test case: input sections,
 * pre-recorded LLM responses for Tier 1 (deterministic/offline), and
 * ground-truth expected observations.
 *
 * See docs/projects/evaluator_quality_ratchet.md for the full design.
 */

import type { ClaimLedgerEntry, Observation } from "../../store/db";

export interface ExpectedObservation {
  /** Which observation type should fire. */
  type: Observation["type"];
  /**
   * The section id (`sections[i].id`) this observation should anchor to.
   * Omit for document-scoped observations (missing_topic, structure_flow, etc.).
   */
  sectionId?: string;
  /**
   * A literal substring from the section text that the produced observation's
   * anchored span should cover, OR that should appear in the observation's
   * message text. Match is case-insensitive containment — not brittle offsets.
   * Omit to match on type + section only.
   */
  substring?: string;
  /** Human note explaining why this is ground truth. Not used in matching. */
  note?: string;
  /**
   * Expected tone for the produced observation's message text.
   * `colleague` is the only passing value; the rest label negative fixtures.
   * Used by the Tier-2 manual scorer (opt-in, live) — ignored by Tier-1 CI.
   * See docs/projects/emotional_register.md § Tone as an eval dimension.
   */
  tone?: "colleague" | "pedant" | "cold" | "condescending";
}

export interface EvalFixture {
  /** Stable identifier — matches the filename stem. */
  id: string;
  /** One-line description shown in test output. */
  description: string;
  /** Optional stage/context passed to evaluateSection (affects doc-level checks). */
  stage?: string;
  /** Optional jargon allow-list items (user dictionary). */
  jargonAllowlist?: string[];
  /**
   * Sections to evaluate, in order. Order matters: the claim ledger
   * accumulates across sections, so section 2 sees section 1's claims
   * (enabling contradiction/tension detection).
   */
  sections: { id: string; text: string }[];
  /**
   * Sweep-path fixture (opt-in). When `true`, the runner skips per-section
   * evaluation and instead seeds `seedClaims` straight into the ledger, then
   * runs the ledger-internal contradiction *sweep* (`evaluateLedgerContradictions`
   * → `CONTRADICTION_SWEEP_SYSTEM_PROMPT[_HEDGED]`). This is the only way to
   * exercise the all-pairs sweep prompt from Tier 1 — `sections` are ignored.
   */
  sweep?: boolean;
  /**
   * Claims to seed directly into the ledger for a `sweep` fixture (no LLM
   * extraction round-trip). `sourceBlockId` is the claim's anchor block; the
   * sweep sorts by `text` then `sourceBlockId`, so `[Claim #N]` indices follow
   * that order.
   */
  seedClaims?: {
    text: string;
    kind: ClaimLedgerEntry["kind"];
    sourceBlockId: string;
  }[];
  /**
   * Pre-recorded LLM responses for Tier 1 offline replay.
   * Keys are reqHash(system, user, json) values; values are raw response text.
   * Generated/updated by `npm run eval:record -- <id>`.
   */
  recordings: Record<string, string>;
  /**
   * Ground-truth observations this fixture should produce. Tier 1 asserts
   * precision === 1 && recall === 1 against this list.
   */
  expected: ExpectedObservation[];
  /**
   * Known gaps: observations the prompt currently MISSES (false negatives)
   * or MIS-fires (false positives) that are tracked but not yet fixed.
   * Tier 2 reports these as expected-misses rather than asserting green.
   * Remove an entry here when the prompt fix lands.
   */
  knownGaps?: ExpectedObservation[];
}
