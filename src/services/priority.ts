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
import type { MaturityLevel } from "./documentMaturity";

type Severity = "low" | "medium" | "high";
type Confidence = "low" | "medium" | "high";
type ClaimKind = ClaimLedgerEntry["kind"];

/**
 * Document-level structural gap types — the only observations R2 modulates by
 * maturity. Defects (contradiction, unsupported_claim) and span nits always
 * surface unchanged. See docs/projects/maturity_aware_severity.md § Scope.
 */
const DOC_GAP_TYPES: ReadonlySet<Observation["type"]> = new Set([
  "missing_topic",
  "underexposed_topic",
  "structure_flow",
  "audience_mismatch",
]);

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

/** Ordering for the external-confidence clamp. */
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * The canonical observation type → kind map. `kind` is a fixed, intrinsic
 * attribute of the *type*, not a per-instance judgement
 * (docs/projects/observation_taxonomy_and_priority.md § kind).
 *
 * Introduced for the external-observation boundary, which must assign `kind`
 * itself — an agent submits a type and never sets its own kind. The evaluator
 * still derives kind at three inline sites (`evaluator.ts` addSpanObs / the two
 * conflict emitters) plus `docGapKind` below; this table reproduces exactly what
 * those produce, with `maturity` undefined. Folding those call sites onto this
 * map is a worthwhile follow-up, deliberately not done here: `evaluator.ts` is a
 * hub file owned by another lane.
 */
export const KIND_BY_TYPE: Record<Observation["type"], Observation["kind"]> = {
  clarity: "problem",
  contradiction: "problem",
  unsupported_claim: "problem",
  undefined_jargon: "problem",
  strategic_tension: "opportunity",
  // The four doc-level gap types, matching docGapKind(type, undefined):
  missing_topic: "opportunity",
  underexposed_topic: "opportunity",
  audience_mismatch: "problem",
  structure_flow: "problem",
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
  /**
   * Document-level gap types only (missing_topic / underexposed_topic /
   * structure_flow / audience_mismatch): the document's maturity. `mature`
   * escalates the gap-type's base severity one step (a forming-draft
   * "opportunity" promotes to a mature-draft "warning"). Omit (undefined) for
   * span/defect types and for the legacy path — no modulation. See
   * docs/projects/maturity_aware_severity.md.
   */
  maturity?: MaturityLevel;
  /**
   * External (agent-submitted) observations only: the submitting agent's
   * self-reported confidence. Applied as a **downward-only clamp** on the
   * computed confidence — an agent can quiet its own card but can never raise
   * it above what the type earns. That asymmetry is the point: external
   * observations sit behind no precision floor and no fixture ratchet, so
   * letting a source set its own volume upward would let an unratcheted critic
   * outrank the guarded one. Omit for built-in evaluator observations.
   * See docs/projects/agent_connected_eval.md § The boundary.
   */
  externalConfidence?: Confidence;
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
  const earned: Confidence =
    input.type === "contradiction"
      ? input.contradictionTier === "confident"
        ? "high"
        : "low"
      : "medium";

  // Downward-only clamp for agent-submitted observations (see PriorityInput).
  const confidence: Confidence =
    input.externalConfidence != null &&
    CONFIDENCE_RANK[input.externalConfidence] < CONFIDENCE_RANK[earned]
      ? input.externalConfidence
      : earned;

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

  // Maturity escalation (R2) — a matured document promotes its structural gaps
  // one severity step, raising priority so a matured warning outranks a
  // forming-stage soft suggestion (and clears the feed's Key-issues band).
  if (input.maturity === "mature" && DOC_GAP_TYPES.has(input.type)) {
    severity = escalateSeverity(severity);
  }

  const priority = SEVERITY_NUM[severity] * CONFIDENCE_FACTOR[confidence];
  return { severity, confidence, priority };
}

/**
 * Maturity-aware kind for a doc-level gap type (R2). The two topic gaps read as
 * gentle "opportunities" while forming and promote to "problems" (warnings)
 * once mature; audience/structure gaps are always framed as problems. Undefined
 * maturity (legacy path) keeps today's fixed kinds. Pure.
 * See docs/projects/maturity_aware_severity.md § The promotion mechanic.
 */
export function docGapKind(
  type: Observation["type"],
  maturity?: MaturityLevel
): Observation["kind"] {
  if (type === "missing_topic" || type === "underexposed_topic") {
    return maturity === "mature" ? "problem" : "opportunity";
  }
  // audience_mismatch / structure_flow are problems at every maturity.
  return "problem";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escalateSeverity(s: Severity): Severity {
  if (s === "low") return "medium";
  if (s === "medium") return "high";
  return "high"; // already at top
}
