---
status: in-progress
kind: infra
phases: [5, 6, 9]
summary: Decouple model *capability* from the *credential* for BYOK — `paidKey` conflated "I have a second key" with "my model can reason well enough." Phase 5 shipped (2026-06-06): explicit `ModelCapability` descriptor threaded via EvalContext, evaluator re-gated, UI key-tier toggle. Phase 6 shipped (2026-07-07): the two-field Gemini free+paid key UI, surfacing the existing free→paid fallback. Phase 9 (multi-free-key RPD rotation + the key-inventory/routing-transparency management UX) remains.
---

# BYOK capability model

> Architecture-fitness note, written 2026-06-06 while the Tier-2 resolution-aware reconciliation (`doc_scope_reconciliation.md`) was fresh, then built the same day. The original "no code change yet" framing has been overtaken — Phase 5 (the capability decoupling) is shipped. Read alongside `model_rotation_and_debugging.md` (the router/rotation seam this extends) and `docs/architecture.md` (the model-router as deliberate extension seam).

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Status: `in-progress`** (Phase 5 shipped 2026-06-06; Phase 6 dual-key UI shipped 2026-07-07; Phase 9 remaining). The credential→capability decoupling is done: an explicit `ModelCapability` descriptor (`src/model/capability.ts`) is decided once at the App boundary and threaded through `EvalContext`; the evaluator branches on it, never on `paidKey` presence; a UI toggle lets a BYO key declare itself capable. The architecture now _takes BYOK without major refactoring_ — confirmed by doing it. **Phase 6 (2026-07-07)** added the two-field Gemini setup — a free key + an optional billed key — surfacing the free→paid fallback `rotation.ts` already runs (the setup the dev had only via env vars). Phase 9 (multi-*free*-key RPD rotation + free-pool editing) is the remaining, additive piece — **design settled in a 2026-07-16 readiness pass** (see the Phase-9 Todo: key-major pool expansion, `keyRef:model` cool-down keying, per-key stats attribution, and the routing-transparency card; provider-scope recommendation recorded, owner sign-off at build). Parked until its Phase-9 trigger (traction / a real multi-key user) fires.

This is **model-router / capability-gating** work — client-side, no server/telemetry/egress (standing rule 5). BYOK is the privacy-respecting heavy-user path already assumed by `docs/concept.md` ("BYO-key design already means heavy users pay their own inference costs").

## Phased Plan

| Phase | Contribution                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5** | **Capability decoupling (the debt).** Replace the `paidKey?: string` capability-predicate threaded through the evaluator with an explicit capability descriptor decided once at the `createRouter` boundary. Credential stays in the router for routing/quota; capability is what reconciliation branches on. Wire the UI BYO key (today only `apiKey`) into a declarable tier so a capable single key drives the strong path. Contained: ~5 signatures, no logic rewrite. |
| **9** | **Multi-key rotation (additive).** Extend each rotation pool from "models on one key" to "(key, model) pairs"; key the cool-down registry by `key+model`. Contained in the Gemini adapter + `rotation.ts` key-threading — zero call-site impact behind the `ModelRouter` interface. Optional richer capability tiers (mid-capability BYO models).                                                                                                                          |
| **9** | **Management UX.** The key-inventory / routing-transparency surface the rotation enables: N free keys, per-key detected tier + live RPD budget, the "here's how we route" view, optional per-tier model pinning (already shipped via `writtten_model_selections` — surfaced, not rebuilt).                                                                                                                                                                                    |

## Todo

### Phase 5 — capability decoupling (the debt to pay before BYOK) — shipped 2026-06-06

- [x] **Introduce a capability descriptor.** `src/model/capability.ts`: `ModelTier = "weak" | "strong"`, `ModelCapability { tier, adjudicateConfidently, driveResolution }`, `capabilityForTier(tier)`, and a `WEAK_CAPABILITY` floor. Decided **once** at the App boundary, threaded via `EvalContext.capability`.
- [x] **Re-gate the evaluator on capability, not credential.** Every `if (paidKey)` / `paidKey ? … : …` in `src/services/evaluator.ts` that meant "the model can reason" now reads `capability.adjudicateConfidently` (confident vs hedged contradiction + sweep prompts, `contradictionTier`) or `capability.driveResolution` (resolution-aware doc regen — Tier-2 A `priorId`/`resolved_prior`; authoritative-with-grace sweep — Tier-2 B). `reconcileSweepContradictions` takes `capability` instead of `paidKey`.
- [x] **Keep the credential in the router.** The only remaining `paidKey` uses in `evaluator.ts` are `createRouter(apiKey, paidKey)` (routing/quota) and signature passthrough. Reconciliation logic no longer reads it.
- [x] **Wire the UI BYO key into a declarable tier.** `App.tsx` boundary: a persisted `keyTier` (`writtten_key_tier`, default `weak`) drives the Gemini derivation. When strong (or an env `VITE_GEMINI_PAID_KEY` exists), the key is promoted into the `paidKey` routing slot **and** `capability` becomes strong. **Update (2026-07-07):** the manual `[data-testid="key-tier-toggle"]` checkbox was **removed** — a Gemini key can't reveal its own tier, so asking the user to self-declare it (in jargon) was a UX smell. `keyTier` is now **auto-detected**: `ping.ts → detectGeminiTier` probes `gemini-2.5-pro` (0 free-tier RPD) on key entry (debounced) and via Ping — 200 → paid, a per-day 429 → free — and sets `keyTier` from the result. The panel shows the detected tier read-only (`[data-testid="gemini-tier"]`). OpenAI/Anthropic are paid-only, so this is Gemini-specific.
- [x] **Tests.** `src/model/capability.test.ts` (descriptor) + capability-flag updates across `evaluator.test.ts` and `signal-quality.test.ts` — strong capability gets confident prompts + resolution-aware paths; weak (default) gets hedged + additive — independent of credentials. 251 passing.

### Phase 9 — multi-key rotation (additive; readiness pass 2026-07-16 — mechanics settled, see § Phase-9 design)

- [ ] **Widen the free-key input to a list.** `createGeminiRouter(freeKey, paidKey?)` → accept `freeKeys: string[]` (a single string stays valid — wrap to a one-element array, so every existing call site and test is untouched). Storage: `writtten_gemini_free_keys` (JSON array) with a one-time migration from the single `writtten_api_key`; the legacy key remains readable as fallback.
- [ ] **Pool entries become `(keyRef, model)` pairs, expanded key-major per model.** For each model in `FREE_FAST_POOL`/`FREE_STRONG_POOL` (RPD-quality order, `gemini.ts:35–43`), emit one entry per free key **before** advancing to the next model — so extra keys extend the life of the *best* free model rather than just lengthening the tail. `keyRef` is a stable slot id (`free-1`, `free-2`, `paid`), never key material.
- [ ] **Key `CoolDownRegistry` by `keyRef:model`.** The registry is already an arbitrary-string `Map` (`rotation.ts:36–47`); the change is the key format at the `markUnavailable`/`isAvailable` call sites plus threading `keyRef` through the attempt loop. A per-day 429 on `free-1:gemini-3.5-flash` must leave `free-2:gemini-3.5-flash` available — that non-interference is the feature's acceptance test.
- [ ] **Per-key attribution in stats + logs.** `getApiStats()`/`logger.ts` currently bucket by model; add the `keyRef` dimension (RPD budgets are per key×model, so `remainingToday` is only truthful per pair). Log masking extends `<free>`/`<paid>` to `<free-1>`/`<free-2>`; the debug-log redaction guard (`debugLog.test.ts`) grows a multi-key case.
- [ ] **Per-key tier detection.** `detectGeminiTier` (`ping.ts`) runs per added key (debounced, as today). A key added to a free slot that probes as **paid** gets a gentle "this key is billed — use it as your paid key?" prompt rather than silently spreading RPD with a billed key.
- [ ] Optional (unchanged): a third capability tier for mid-capability BYO models (local Llama, Haiku) — better than flash-lite but not trusted to drive authoritative closures. Not needed for the rotation slice; the descriptor is already typed for it (`capability.ts`).

### Phase 9 — BYOK management UX (the surface multi-key enables)

The rotation plumbing above is invisible to the user; this is the UI over it. Its **Phase-6 precursors** are the legibility card + per-tier model picker in `multi_provider_router.md` (todo D) — "show what's running and why + pick one model per tier" — **and the two-field Gemini free+paid key UI (shipped 2026-07-07)**, which brought the free→paid fallback (previously env-only) into the product for any user. The pool-editing and multi-*free*-key power controls below are the Phase-9 layer on top of that. The richer surface:

- [ ] **Multiple keys.** _(Partially shipped 2026-07-07: the Gemini free+paid **pair** is in the Settings panel — two fields, each tier-validated, `writtten_gemini_paid_key`; combined honest status note; one attributable "Ping model" verdict.)_ Remaining: **N free keys** for RPD spreading — an "Add another free key" affordance under the existing free-key field (list of masked entries, per-entry detected-tier chip + remove; cap the list at ~4 — beyond that the user is fighting Google's quota design, not managing keys).
- [ ] **"Here are your models, here's how we use them."** One read-only routing card in Settings (grows the shipped `provider-chip`/running-models legibility, `multi_provider_router.md` todo D): per tier (fast/strong), the model that actually runs *right now* and which checks ride it ("Fast — section checks, claim extraction: gemini-3.5-flash (key 2 of 3, 14/20 left today)"), with cooled-down entries shown struck-through with their retry time. Data is all already held by `rotation.ts`/`getApiStats()` — this is a view, not new state. Readable sentence-shaped rows, not a config dump.
- [ ] **Optional routing override — surface, don't rebuild.** Per-tier model pinning already exists (`writtten_model_selections`, per-provider pickers from `multi_provider_router.md`); the only new control worth considering is a per-*key* exclusion ("don't use this key for strong checks"). **Lean: don't build the exclusion** until someone asks — every override is a support surface, and the capability descriptor already covers the real case (declared tier).
- [ ] **Provider scope — recommendation (2026-07-16): multi-key is Gemini-only; the routing-transparency card is all-provider.** The *rotation* rationale (RPD spreading) only exists on Gemini's free tier — OpenAI/Anthropic are paid-only where multiple keys buy nothing (resolved from the old open question: the adapters shipped 2026-07-07, so this is now a scoping call, not an unknown). The *transparency* card costs the same for every provider and answers the same "what's running?" question everywhere. Owner sign-off at build time.
- [ ] Stays fully client-side (standing rule 5) — no key ever leaves the machine except as the auth header on the user's own model calls; slot ids (`free-N`), never key material, appear in logs/stats.

> Tracked as the **BYOK management UX** milestone in `docs/plan.md` (Phase 9, merged with the rotation item 2026-07-10). Promoted out of "Out of scope" below now that it has a home.

## The finding

### `paidKey` is one word doing three jobs

Across the codebase `paidKey?: string` is overloaded with three concerns that **coincide in the default Gemini pack but decouple under BYOK**:

1. **A credential** — which key to authenticate with (`gemini.ts`).
2. **A quota strategy** — which RPD-ordered pool to rotate (`FREE_*_POOL` vs `PAID_*_POOL`, `gemini.ts:33–56`).
3. **A capability claim** — "this model can reason well enough." This is what every `if (paidKey)` in `evaluator.ts` _actually means_: confident vs hedged prompts (`:799`), resolution-aware doc regen (`:963`, Tier-2 A), authoritative-with-grace sweep (`:1141`, Tier-2 B).

For the default pack these are the same fact (paid key → strong pool → `gemini-2.5-pro` → capable). For BYOK they split.

### The wiring used to mis-handle BYOK (fixed in Phase 5)

**Before:** `paidKey` was sourced **only** from `VITE_GEMINI_PAID_KEY`; the sidecar key field wrote to `apiKey` → `freeKey`. So a BYOK user who pasted a capable key (Claude-Opus-grade, GPT-grade) into the UI got it routed through `FREE_STRONG_POOL` (flash-lite) **with hedged prompts and all resolution-aware logic disabled** — their strong model driven like the weakest free model.

**After (Phase 5):** the sidecar exposes a key-tier toggle; declaring the key "strong" promotes it into the `paidKey` routing slot **and** sets `capability` to strong, so `strong()` routes to the paid pool and the confident + resolution-aware paths turn on. The "one capable key for everything" scenario below now works.

### Two BYOK scenarios, one root cause

| Scenario                           | Was broken                                                                           | Now                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **One capable key for everything** | Treated as `freeKey`; `strong()` → flash-lite pool; hedged + no resolution-awareness | ✅ Phase 5: declare tier strong → key promoted to `paidKey` slot, `strong()` routes to it, capability enables confident + resolution-aware paths |
| **Several keys for rotation**      | No path — pools rotate models on a single key                                        | ⏳ Phase 9: pool entries become `{key, model}`; cool-down keyed by `key+model`; capability is the pool's configured floor                        |

## What's already clean (no rework needed)

The hard seams are sound:

- **`ModelRouter` (`fast`/`strong`)** — a real abstraction; call sites never see provider details (`router.ts:24`).
- **`createRouter(apiKey, paidKey)`** — single construction funnel; every evaluator entry point goes through it (`factory.ts:36`). One place to change the capability decision.
- **Mock/record/replay** — provider-agnostic wrap (`factory.ts:13`).
- **Rotation + cool-down + backoff** — all inside the router module per the stated extension seam (`gemini.ts:245`).
- **Per-key cool-down registries** — already separate objects (`freeRegistry`/`paidRegistry`, `gemini.ts:76`); the pattern extends to N keys.

## The decision: credential ≠ capability

**Branch reconciliation on an explicit capability descriptor decided once at the boundary; keep the credential in the router for routing/quota.** This is a rename-and-relocate, not a rewrite — the router interface, every `router.fast/strong` call shape, the mock layer, and the reconciliation logic itself are untouched. Only the _source_ and _type_ of the gating boolean change. The Tier-2 work in `doc_scope_reconciliation.md` is safe under this: it already branches on a capability flag that today happens to be spelled `paidKey`.

Two things to bake in _while_ doing the rename, cheaply:

- **Capability is not binary.** A BYO user may bring a mid model (local Llama, Haiku) that beats flash-lite but shouldn't be trusted to drive authoritative closures. The resolution-aware features need "a genuine reasoning model" — a per-capability judgment, not free-vs-paid. Type the descriptor so a third tier doesn't force another cross-cutting sweep, even if only two values are used now.
- **Read capability from config, not `import.meta.env`.** That's where "one capable key for everything" gets answered: the user (or a sane default) declares the key's tier, and `strong()` routes to it.

## Out of scope

- The actual BYO key-management UI (entry, validation, per-key tier declaration) — a Phase 5/6 UX deliverable, specced when scheduled.
- Non-Gemini providers (OpenAI/Anthropic/local adapters) — the `ModelRouter` seam already permits them; adapter work is separate and not blocked by this decoupling.
- Cost/usage metering per BYO key — relates to `debug_log.md` (token/cost, Phase 5) but is a distinct concern.
