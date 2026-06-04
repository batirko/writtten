/**
 * Priority function — Phase 4 Milestone B.
 *
 * Pure, synchronous, zero LLM calls. Computes the three per-instance metadata
 * axes (severity, confidence, priority) from structural signals.
 *
 * Design: docs/projects/observation_taxonomy_and_priority.md → "Priority function"
 *
 * Key decision (Option A): `contradiction` and `unsupported_claim` base severity
 * is "medium" (not "high" as the doc's literal table states). Escalation rules
 * target exactly those two types — so they need headroom below "high" to do real
 * work. A commitment×commitment conflict or an unsupported claim underpinning a
 * commitment escalates to "high". This is the only internally-coherent reading of
 * the doc's prose ("conflicting commitments are the most damaging") + its own
 * escalation rules. See priority function design section for details.
 */

import type { Observation, ClaimLedgerEntry } from "../store/db";

type Severity = "low" | "medium" | "high";
type Confidence = "low" | "medium" | "high";
type ClaimKind = ClaimLedgerEntry["kind"];

// ---------------------------------------------------------------------------
// Lookup tables
// ---------------------------------------------------------------------------

/**
 * Base severity by observation type.
 * contradiction + unsupported_claim are "medium" (Option A — see module header).
 */
const TYPE_PRIOR: Record<Observation["type"], Severity> = {
  contradiction: "medium",
  strategic_tension: "medium",
  unsupported_claim: "medium",
  missing_topic: "medium",
  clarity: "low",
  undefined_jargon: "low",
  underexposed_topic: "low",
  audience_mismatch: "low",
  structure_flow: "low",
};

const SEVERITY_NUM: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

const CONFIDENCE_FACTOR: Record<Confidence, number> = {
  low: 0.5,
  medium: 0.75,
  high: 1.0,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PriorityInput {
  type: Observation["type"];
  /**
   * Contradiction only: kinds of the two conflicting claims.
   * commitment×commitment or metric×metric → escalate severity one step.
   */
  claimKinds?: { newKind?: ClaimKind; existingKind?: ClaimKind };
  /**
   * unsupported_claim only: the flagged span overlaps a commitment claim in
   * the ledger → escalate severity one step.
   */
  overlapsCommitment?: boolean;
  /**
   * Contradiction only: reflects whether the check ran with a real reasoning
   * model (paid key → "confident") or the free-tier flash-lite with a hedged
   * prompt ("hedged"). Only contradiction is tier-calibrated; all other types
   * default to confidence "medium".
   */
  contradictionTier?: "confident" | "hedged";
}

export interface PriorityResult {
  severity: Severity;
  confidence: Confidence;
  /** Float in [0.5, 3.0]. Higher = more urgent. */
  priority: number;
}

/**
 * Compute the three priority axes for a single observation.
 *
 * Priority value examples:
 *   commitment×commitment contradiction, paid key  → 3.0 (max)
 *   unsupported claim underpinning a commitment    → 2.25
 *   generic paid contradiction / missing_topic     → 1.5–2.0
 *   free-tier hedged contradiction                 → 1.0
 *   clarity / jargon / flow nits                   → 0.75
 */
export function computePriority(input: PriorityInput): PriorityResult {
  let severity: Severity = TYPE_PRIOR[input.type] ?? "low";

  // Confidence: contradiction is tier-calibrated; everything else is "medium".
  const confidence: Confidence =
    input.type === "contradiction"
      ? input.contradictionTier === "confident"
        ? "high"
        : "low"
      : "medium";

  // Structural escalation — bumps severity one step; "high" stays "high".
  if (input.type === "contradiction" && input.claimKinds) {
    const { newKind, existingKind } = input.claimKinds;
    if (
      (newKind === "commitment" && existingKind === "commitment") ||
      (newKind === "metric" && existingKind === "metric")
    ) {
      severity = escalateSeverity(severity);
    }
  }
  if (input.type === "unsupported_claim" && input.overlapsCommitment) {
    severity = escalateSeverity(severity);
  }

  const priority = SEVERITY_NUM[severity] * CONFIDENCE_FACTOR[confidence];
  return { severity, confidence, priority };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escalateSeverity(s: Severity): Severity {
  if (s === "low") return "medium";
  if (s === "medium") return "high";
  return "high"; // already at top
}
