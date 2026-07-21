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
  /** Present `contradiction` cards at all. Distinct from `adjudicateConfidently`,
   *  which only picks the hedged-vs-confident *prompt*: this drops the parsed
   *  `contradictions` bucket at emit time, leaving `tensions` and every span check
   *  untouched.
   *
   *  False at weak tier per the decision rule pre-registered 2026-07-16 in
   *  `docs/projects/field_validation.md`. V1 Run 1 measured the free tier emitting
   *  2 contradictions across 9 real documents — **both false** — against the paid
   *  tier's 13. A false contradiction is the maximum-damage failure (R4.4: one that
   *  isn't real and the user discounts the entire feed), and the hero's 0.95 floor
   *  is trust-derived, not performance-derived. A tier that stays quiet about
   *  contradictions and says so is more trustworthy than one that guesses.
   *
   *  Kept separate from `adjudicateConfidently` because that flag selects the
   *  system prompt and so is request-hash-affecting; this one is downstream of the
   *  model call and changes no prompt text. That lets the recorded fixture corpus
   *  keep exercising the contradiction pipeline at weak tier without re-recording.
   */
  emitContradictions: boolean;
}

/** Expand a tier into the concrete capability flags the evaluator branches on.
 *  All three flags track `strong` today; they are separate fields so policy can
 *  diverge per-flag later without touching call sites — and `emitContradictions`
 *  is the first place that separation pays off (the eval harness runs weak prompts
 *  but must still emit contradictions; see the field's doc comment). */
export function capabilityForTier(tier: ModelTier): ModelCapability {
  const strong = tier === "strong";
  return {
    tier,
    adjudicateConfidently: strong,
    driveResolution: strong,
    emitContradictions: strong,
  };
}

/** Conservative floor used when capability is unspecified — never assume a model
 *  is strong without an explicit declaration. */
export const WEAK_CAPABILITY: ModelCapability = capabilityForTier("weak");
