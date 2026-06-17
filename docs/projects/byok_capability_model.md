---
status: in-progress
kind: infra
phases: [5, 7]
summary: Decouple model *capability* from the *credential* for BYOK — `paidKey` conflated "I have a second key" with "my model can reason well enough." Phase 5 shipped (2026-06-06): explicit `ModelCapability` descriptor threaded via EvalContext, evaluator re-gated, UI key-tier toggle. Phase 7 (multi-key rotation) remains.
---

# BYOK capability model

> Architecture-fitness note, written 2026-06-06 while the Tier-2 resolution-aware reconciliation (`doc_scope_reconciliation.md`) was fresh, then built the same day. The original "no code change yet" framing has been overtaken — Phase 5 (the capability decoupling) is shipped. Read alongside `model_rotation_and_debugging.md` (the router/rotation seam this extends) and `docs/architecture.md` (the model-router as deliberate extension seam).

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Status: `in-progress`** (Phase 5 shipped 2026-06-06; Phase 7 remaining). The credential→capability decoupling is done: an explicit `ModelCapability` descriptor (`src/model/capability.ts`) is decided once at the App boundary and threaded through `EvalContext`; the evaluator branches on it, never on `paidKey` presence; a UI toggle lets a BYO key declare itself capable. The architecture now _takes BYOK without major refactoring_ — confirmed by doing it. Phase 7 (multi-key rotation) is the remaining, additive piece (contained in `gemini.ts`).

This is **model-router / capability-gating** work — client-side, no server/telemetry/egress (standing rule 5). BYOK is the privacy-respecting heavy-user path already assumed by `docs/concept.md` ("BYO-key design already means heavy users pay their own inference costs").

## Phased Plan

| Phase | Contribution                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5** | **Capability decoupling (the debt).** Replace the `paidKey?: string` capability-predicate threaded through the evaluator with an explicit capability descriptor decided once at the `createRouter` boundary. Credential stays in the router for routing/quota; capability is what reconciliation branches on. Wire the UI BYO key (today only `apiKey`) into a declarable tier so a capable single key drives the strong path. Contained: ~5 signatures, no logic rewrite. |
| **7** | **Multi-key rotation (additive).** Extend each rotation pool from "models on one key" to "(key, model) pairs"; key the cool-down registry by `key+model`. Fully contained in `gemini.ts` — zero call-site impact behind the `ModelRouter` interface. Optional richer capability tiers (mid-capability BYO models).                                                                                                                                                         |

## Todo

### Phase 5 — capability decoupling (the debt to pay before BYOK) — shipped 2026-06-06

- [x] **Introduce a capability descriptor.** `src/model/capability.ts`: `ModelTier = "weak" | "strong"`, `ModelCapability { tier, adjudicateConfidently, driveResolution }`, `capabilityForTier(tier)`, and a `WEAK_CAPABILITY` floor. Decided **once** at the App boundary, threaded via `EvalContext.capability`.
- [x] **Re-gate the evaluator on capability, not credential.** Every `if (paidKey)` / `paidKey ? … : …` in `src/services/evaluator.ts` that meant "the model can reason" now reads `capability.adjudicateConfidently` (confident vs hedged contradiction + sweep prompts, `contradictionTier`) or `capability.driveResolution` (resolution-aware doc regen — Tier-2 A `priorId`/`resolved_prior`; authoritative-with-grace sweep — Tier-2 B). `reconcileSweepContradictions` takes `capability` instead of `paidKey`.
- [x] **Keep the credential in the router.** The only remaining `paidKey` uses in `evaluator.ts` are `createRouter(apiKey, paidKey)` (routing/quota) and signature passthrough. Reconciliation logic no longer reads it.
- [x] **Wire the UI BYO key into a declarable tier.** `App.tsx` boundary: a persisted `keyTier` (`writtten_key_tier`, default `weak`) lets a user mark their BYO key capable. When strong (or an env `VITE_GEMINI_PAID_KEY` exists), the key is promoted into the `paidKey` routing slot **and** `capability` becomes strong. The sidecar exposes a `[data-testid="key-tier-toggle"]` checkbox shown whenever a key is set. Verified end-to-end in the preview: toggle persists strong/weak and drives the derivation.
- [x] **Tests.** `src/model/capability.test.ts` (descriptor) + capability-flag updates across `evaluator.test.ts` and `signal-quality.test.ts` — strong capability gets confident prompts + resolution-aware paths; weak (default) gets hedged + additive — independent of credentials. 251 passing.

### Phase 7 — multi-key rotation (additive, contained in `gemini.ts`)

- [ ] Extend pool entries from `"model"` to `{ key, model }`.
- [ ] Key `CoolDownRegistry` by `key+model` (today: `model`).
- [ ] Optional: a third capability tier for mid-capability BYO models (local Llama, Haiku) — better than flash-lite but not trusted to drive authoritative closures.

### Phase 7 — BYOK management UX (the surface multi-key enables)

The rotation plumbing above is invisible to the user; this is the UI over it. Today the BYO surface is one key field + one "this is a capable model" checkbox (`SidecarFeed.tsx`). The richer surface:

- [ ] **Multiple keys.** Let the user add/remove several keys (entry + validation), persisted client-side.
- [ ] **"Here are your models, here's how we use them."** Show, per key, which models it grants and how the router uses each (which check runs fast vs strong, what each tier means for observation quality). This is the "want to change something?" view — readable, not a raw config dump.
- [ ] **Optional routing override.** Let an advanced user pin a model to a tier, on top of the `capability.ts` descriptor (which already decouples credential from capability — so this is UI over an existing seam, not a re-architecture).
- [ ] **Provider scope decision.** Which providers this surface offers — Gemini today; OpenAI / Anthropic / local adapters are an **unspecced open question** (the `ModelRouter` seam permits them but no adapter is written — see plan Discovered/unscheduled). Decide whether the management UX is Gemini-only or multi-provider before building it.
- [ ] Stays fully client-side (standing rule 5) — no key ever leaves the machine except as the auth header on the user's own model calls.

> Tracked as the **BYOK management UX** milestone in `docs/plan.md` (Phase 7). Promoted out of "Out of scope" below now that it has a home.

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
| **Several keys for rotation**      | No path — pools rotate models on a single key                                        | ⏳ Phase 7: pool entries become `{key, model}`; cool-down keyed by `key+model`; capability is the pool's configured floor                        |

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
