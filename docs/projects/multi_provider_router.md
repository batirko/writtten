---
status: idea
kind: infra
phases: [6]
summary: Expand BYOK from Gemini-only to Gemini + OpenAI + Anthropic at launch by lifting the Gemini-shaped resilience layer (pools, cool-down, 429/quota parsing) into a provider-agnostic seam, adding two reference adapters, and reworking the global weak/strong toggle into per-provider model selection. Turns the "non-Gemini reference adapter" OSS Superb-tier item into a first-party three-provider launch feature.
---

# Multi-provider model router

> Design written 2026-07-06. Read alongside `src/model/router.ts` (the `ModelRouter` interface every call site depends on), `src/model/gemini.ts` (the resilience code to be generalized), `docs/projects/byok_capability_model.md` (the capability↔credential decoupling this builds on), `docs/projects/model_rotation_and_debugging.md` (the rotation/cool-down seam), and `docs/architecture.md` § _Model router_ (the "deliberate extension seam" this fulfils). Supersedes and expands the OSS Superb-tier "a non-Gemini reference adapter" item in `docs/projects/oss_launch_readiness.md` — instead of leaving it to contributors, ship two adapters first-party.

## Status

> Canonical status is the frontmatter above, mirrored in the Projects Index in `docs/plan.md`. This block is human-readable scope only.

**Status: `idea` — Phase 6.** Decision locked 2026-07-06: **support Gemini + OpenAI + Anthropic at launch** (user call, this session). Design is specced here; not yet started. Readiness is 🟡 (the interface and adapter boundary are decided below; the resilience-abstraction has judgment calls that surface during the build). This is **model-router / platform** work — client-side, no server/telemetry/egress (standing rule 5); each provider is called direct-from-browser with the user's own key, exactly as Gemini is today.

### The load-bearing fact that shapes everything

**Gemini is the only one of the three with a free API tier.** OpenAI and Anthropic are paid-only — there is no free key to obtain. Consequences that drive the design:

- The **free / zero-config on-ramp rides entirely on Gemini** (whether the user's own free key or, separately, a hosted proxy — see `docs/projects/hosted_proxy.md`). OpenAI/Anthropic BYOK only ever means "the user already pays their own provider."
- The current **global `weak`/`strong` capability toggle stops generalizing.** "Weak = free pool with hedged prompts" is a Gemini-free-tier concept. Across three providers, capability must become a **per-provider model choice** (each adapter declares its own `fast` and `strong` model), while the existing `ModelCapability` descriptor (`src/model/capability.ts`) continues to gate evaluator behavior. See §_Capability model_.

## Phased Plan

| Phase | Contributes |
| ----- | ----------- |
| **6** | Provider-agnostic resilience seam + provider registry; Gemini refactored onto it (no behavior change); OpenAI and Anthropic reference adapters; Settings UX for provider + key + model selection; per-provider model tables; docs (`architecture.md` seam section, README "how to get a key" per provider). |

_No Phase-7 slice is currently scoped here; multi-key rotation (`byok_capability_model.md` Phase 7) is orthogonal and stays in that doc._

## Todo

### A — Provider-agnostic resilience seam (do first; no behavior change)

- [ ] Define a `ProviderAdapter` interface (new `src/model/provider.ts`) that captures everything `gemini.ts` currently hard-codes:
  ```ts
  export interface ProviderAdapter {
    id: "gemini" | "openai" | "anthropic";
    label: string;
    /** Ordered rotation pools per tier. For paid-only providers, `free*` may be empty. */
    pools: { freeFast: string[]; freeStrong: string[]; paidFast: string[]; paidStrong: string[] };
    /** Build the HTTP call for one model attempt. */
    buildRequest(model: string, req: LLMRequest, key: string): { url: string; init: RequestInit };
    /** Extract the model's text output from a 2xx body. */
    parseResponse(body: unknown): string;
    /** Map a non-2xx response to the rotation machinery's common vocabulary. */
    classifyError(status: number, headers: Headers, body: unknown): {
      retryable: boolean;
      coolDownMs: number;           // how long to bench this (key,model)
      quotaKind?: "perDay" | "perMinute" | "inputTokens" | "other";
    };
  }
  ```
- [ ] Lift `callWithRotation`, `CoolDownRegistry`, the retry/stall handling, and `trackCall`/logging out of `gemini.ts` into a provider-agnostic `src/model/rotation.ts` that drives any `ProviderAdapter`. The Gemini-specific bits (`parse429`, `parseRetryDelay`, `msTilPacificMidnight`, pool constants) move **into** the Gemini adapter's `classifyError`/`pools`.
- [ ] Reduce `src/model/gemini.ts` to a `ProviderAdapter` implementation. `createGeminiRouter(freeKey, paidKey)` becomes `createRouter(geminiAdapter, {freeKey, paidKey})`, or a thin shim over the generic factory. **Acceptance: zero change to eval behavior, all existing tests green, the Gemini rate-limit tests still pass.**

### B — Reference adapters (OpenAI, Anthropic)

- [ ] `src/model/openai.ts` — `ProviderAdapter` for the OpenAI Chat/Responses API. Models table below. `classifyError`: 429 → `retryable`, honor `Retry-After` header; `insufficient_quota` → non-retryable with a clear surfaced message (no free tier to fall back to).
- [ ] `src/model/anthropic.ts` — `ProviderAdapter` for the Anthropic Messages API. **Verify browser CORS**: direct-from-browser calls need the `anthropic-dangerous-direct-browser-access` header (or the call is blocked). If a provider genuinely can't be called from the browser, that's a per-provider constraint to flag — **not** a reason to route document content through a server (architecture.md § Privacy). Document the outcome here.
- [ ] Each adapter ships a tiny live smoke test (opt-in, excluded from CI like `eval-fixtures/record.test.ts`) — one `fast` and one `strong` call, asserting `parseResponse` shape.

### C — Provider registry + selection

- [ ] `src/model/registry.ts`: `PROVIDERS: Record<ProviderId, ProviderAdapter>` and `resolveProvider(id)`. The mock/record `wrap()` in `factory.ts` is provider-agnostic already (it hashes on system/user/json) — keep it, just feed it the resolved provider's router.
- [ ] Persist the chosen provider (`writtten_provider`, default `"gemini"`) alongside the existing `writtten_api_key` / `writtten_key_tier` in `App.tsx`.

### D — Settings UX (per-provider key + model)

- [ ] Extend the Settings panel (`src/sidecar/ControlCenter.tsx`): a provider selector (Gemini / OpenAI / Anthropic), the key field re-labeled per provider, and — replacing the single "capable model (paid tier)" checkbox — a **model picker per tier** driven by the active provider's pools. Keep `data-testid="api-key-input"` stable; add `data-testid="provider-select"`.
- [ ] Per-provider help text with the honest free-tier line: Gemini → "free key available"; OpenAI/Anthropic → "paid API account required". Link the key-issuance page for each.
- [ ] Empty/first-run copy stays provider-neutral until a key is set; the zero-config example (`onboarding_first_run.md`) is unaffected (it's a canned replay, no live provider).

### E — Docs

- [ ] `docs/architecture.md` § Model router: document the `ProviderAdapter` seam as the canonical extension point (a fourth provider = one new adapter file, zero call-site changes).
- [ ] README: a short "Bring your own key" section with per-provider key-issuance instructions (Gemini → AI Studio; OpenAI → platform.openai.com/api-keys; Anthropic → console.anthropic.com). This closes the "add instructions on how to obtain keys" ask.
- [ ] Update this doc's status → `done` and the Projects Index when shipped.

## Per-provider model table

Map the two router tiers (`fast` = cheap/frequent, `strong` = capable/rare) to concrete models. Exact model IDs are set at build time against then-current availability; this table is the intent.

| Provider  | `fast` (cheap, frequent)      | `strong` (capable, rare)     | Free tier?              |
| --------- | ----------------------------- | ---------------------------- | ----------------------- |
| Gemini    | flash-lite (rotation pool)    | pro / flash (rotation pool)  | ✅ — the zero-key on-ramp |
| OpenAI    | a small/mini model            | a flagship reasoning model   | ❌ paid only             |
| Anthropic | Haiku (latest)                | Sonnet (latest)              | ❌ paid only             |

> When picking concrete model IDs during the build, consult the Claude API skill / provider docs for current names and pricing rather than hard-coding from memory — model lineups move.

## Capability model (how this meets `byok_capability_model.md`)

The existing `ModelCapability` descriptor (`{ tier, adjudicateConfidently, driveResolution }`) is **kept and honored** — it's what the evaluator branches on, and it must not regress. What changes is only how a capability is _chosen_:

- **Today:** one global `weak`/`strong` toggle, meaningful only because Gemini has a weak free pool and a strong paid pool.
- **After:** the active provider + selected model implies the capability. Gemini keeps its free-pool `weak` default. For a paid-only provider, the user's chosen `strong` model maps to strong capability; a chosen small/`fast` model maps to weak. The App boundary still decides capability **once** and threads it via `EvalContext.capability` exactly as it does now — no evaluator changes.

This keeps the invariant that reconciliation branches on **capability, not credential**, while removing the Gemini-free-tier assumption baked into the toggle's meaning.

## Non-goals / guardrails

- **No server, no proxy, no egress change.** Every provider is called direct-from-browser with the user's key. (The separate hosted-proxy idea is `docs/projects/hosted_proxy.md` and is explicitly opt-in.)
- **No new eval behavior.** This is a routing/credential change; the taxonomy, prompts, and lifecycle are untouched. Prompts remain provider-neutral (system+user text); if a provider needs prompt massaging, that's an adapter concern, not an evaluator concern.
- **No multi-key rotation here.** That's `byok_capability_model.md` Phase 7 and stays orthogonal — though the generic `rotation.ts` should make it cheaper to add later.
- **Keep `dangerouslyAllowBrowser`-style flags honest.** Where a provider requires an explicit "I know I'm calling from the browser" acknowledgement, that reflects a real trust/exposure fact (the key sits in `localStorage`); surface it in the README security note rather than hiding it.
