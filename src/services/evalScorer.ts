/**
 * Pure, synchronous scorer for the evaluator quality ratchet.
 *
 * Answers: "given the observations the pipeline produced, how many of the
 * expected ground-truth observations did it catch (recall) and how many of
 * the produced observations were spurious (precision)?"
 *
 * Match rule for a (produced, expected) pair:
 *   1. `produced.type === expected.type`
 *   2. If `expected.sectionId` is set: `produced.blockId === expected.sectionId`
 *      (doc-scoped obs have no blockId; omit sectionId to match them)
 *   3. If `expected.substring` is set: the substring appears (case-insensitive)
 *      in EITHER `produced.text` (the observation message) OR the raw text of
 *      the section at the anchored span.  This avoids brittle offset comparison
 *      while still pinpointing which passage is being flagged.
 *
 * Each produced/expected observation is used at most once (greedy left-to-right).
 *
 * Design: docs/projects/evaluator_quality_ratchet.md §Scorer match rule
 */

import type { Observation } from "../store/db";
import type { ExpectedObservation } from "./eval-fixtures/types";

export interface ScoreResult {
  fixture: string;
  truePositives: Array<{ expected: ExpectedObservation; produced: Observation }>;
  falsePositives: Observation[];
  falseNegatives: ExpectedObservation[];
  /** tp / (tp + fp). NaN when no observations produced. */
  precision: number;
  /** tp / (tp + fn). NaN when no observations expected. */
  recall: number;
}

/**
 * Check whether `produced` satisfies `expected`.
 * `sectionTexts` maps sectionId → raw text for the substring span check.
 */
function matches(
  produced: Observation,
  expected: ExpectedObservation,
  sectionTexts: Map<string, string>,
): boolean {
  // 1. Type must match.
  if (produced.type !== expected.type) return false;

  // 2. Section anchor check (only for span-scoped obs).
  if (expected.sectionId !== undefined) {
    if (produced.blockId !== expected.sectionId) return false;
  }

  // 3. Substring check (optional).
  if (expected.substring !== undefined) {
    const needle = expected.substring.toLowerCase();
    // Check the observation message text first.
    if (produced.text.toLowerCase().includes(needle)) return true;
    // Fallback: check the raw section text at the anchored span (handles
    // cases where the observation message paraphrases rather than quoting).
    if (produced.blockId) {
      const sectionText = sectionTexts.get(produced.blockId) ?? "";
      if (
        produced.startOffset !== undefined &&
        produced.endOffset !== undefined
      ) {
        const spanText = sectionText.slice(produced.startOffset, produced.endOffset);
        if (spanText.toLowerCase().includes(needle)) return true;
      }
      // Also check the full section text (for doc-scoped or fallback cases).
      if (sectionText.toLowerCase().includes(needle)) return true;
    }
    return false;
  }

  return true;
}

/**
 * Score a set of produced observations against expected ground truth.
 *
 * @param fixtureId  Displayed in the result for easy identification in test output.
 * @param produced   All active observations the evaluator pipeline produced.
 * @param expected   Ground-truth expected observations.
 * @param sectionTexts  Map of sectionId → raw text (for substring span matching).
 */
export function scoreObservations(
  fixtureId: string,
  produced: Observation[],
  expected: ExpectedObservation[],
  sectionTexts: Map<string, string>,
): ScoreResult {
  const remainingProduced = [...produced];
  const truePositives: ScoreResult["truePositives"] = [];
  const falseNegatives: ExpectedObservation[] = [];

  for (const exp of expected) {
    const idx = remainingProduced.findIndex((p) => matches(p, exp, sectionTexts));
    if (idx !== -1) {
      truePositives.push({ expected: exp, produced: remainingProduced[idx] });
      remainingProduced.splice(idx, 1);
    } else {
      falseNegatives.push(exp);
    }
  }

  const falsePositives = remainingProduced;

  const tp = truePositives.length;
  const fp = falsePositives.length;
  const fn = falseNegatives.length;

  return {
    fixture: fixtureId,
    truePositives,
    falsePositives,
    falseNegatives,
    precision: tp + fp === 0 ? NaN : tp / (tp + fp),
    recall: tp + fn === 0 ? NaN : tp / (tp + fn),
  };
}
