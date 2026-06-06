/**
 * Model **capability** — decoupled from the **credential**.
 *
 * Historically the evaluator branched on `paidKey` presence to decide whether
 * the model was strong enough for confident adjudication and resolution-aware
 * reconciliation. That conflated three separate things — a credential, a quota
 * pool, and a reasoning-capability claim — which happen to coincide in the
 * default Gemini pack but split apart under BYOK (a user may bring one capable
 * key, or several). See docs/projects/byok_capability_model.md.
 *
 * Capability is now an explicit value decided **once at the App boundary** (where
 * the user's key-tier declaration is known) and threaded down through
 * `EvalContext`. The evaluator reads these semantic flags; it never inspects a
 * raw key string to guess capability — it can't, a key string is opaque.
 */

/** Coarse capability tier. Two values today; typed as a union so a future
 *  mid-capability tier (e.g. a local model better than flash-lite but not
 *  trusted to drive closures) doesn't force another cross-cutting change. */
export type ModelTier = "weak" | "strong";

export interface ModelCapability {
  tier: ModelTier;
  /** Use the confident (vs hedged) adjudication prompts for contradiction /
   *  strategic-tension checks. A weak model gets hedged prompts so it doesn't
   *  assert false conflicts with false confidence. */
  adjudicateConfidently: boolean;
  /** Trust the model to drive resolution-aware reconciliation: doc-scope
   *  `priorId`/`resolved_prior` mapping and authoritative-with-grace ledger-sweep
   *  closures. A weak model could hallucinate resolutions, so it stays on the
   *  lexical best-match + additive fallback paths. */
  driveResolution: boolean;
}

/** Expand a tier into the concrete capability flags the evaluator branches on.
 *  Both flags track `strong` today; they are separate fields so policy can
 *  diverge per-flag later without touching call sites. */
export function capabilityForTier(tier: ModelTier): ModelCapability {
  const strong = tier === "strong";
  return {
    tier,
    adjudicateConfidently: strong,
    driveResolution: strong,
  };
}

/** Conservative floor used when capability is unspecified — never assume a model
 *  is strong without an explicit declaration. */
export const WEAK_CAPABILITY: ModelCapability = capabilityForTier("weak");
