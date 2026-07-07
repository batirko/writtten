---
status: in-progress
kind: infra
phases: [6]
summary: Expand BYOK from Gemini-only to Gemini + OpenAI + Anthropic at launch by lifting the Gemini-shaped resilience layer (pools, cool-down, 429/quota parsing) into a provider-agnostic seam, adding two reference adapters, and reworking the global weak/strong toggle into per-provider model selection. Turns the "non-Gemini reference adapter" OSS Superb-tier item into a first-party three-provider launch feature.
---

# Multi-provider model router

> Design written 2026-07-06. Read alongside `src/model/router.ts` (the `ModelRouter` interface every call site depends on), `src/model/gemini.ts` (the resilience code to be generalized), `docs/projects/byok_capability_model.md` (the capability↔credential decoupling this builds on), `docs/projects/model_rotation_and_debugging.md` (the rotation/cool-down seam), and `docs/architecture.md` § _Model router_ (the "deliberate extension seam" this fulfils). Supersedes and expands the OSS Superb-tier "a non-Gemini reference adapter" item in `docs/projects/oss_launch_readiness.md` — instead of leaving it to contributors, ship two adapters first-party.

## Status

> Canonical status is the frontmatter above, mirrored in the Projects Index in `docs/plan.md`. This block is human-readable scope only.

**Status: `in-progress` — Phase 6. Launch blocker.** Decision locked 2026-07-06: **support Gemini + OpenAI + Anthropic at launch** (user call, this session), and the launch bar is "Good-enough **plus** multi-provider" — the repo does not go public until all three ship. Design is specced here to 🟢 (the adapter interface, the resilience abstraction boundary, the concrete model IDs, and the browser-CORS question are all resolved below). Being built across 4 PRs (2026-07-07): **PR 1 — provider-agnostic resilience seam** (§A) is done — `ProviderAdapter` (`src/model/provider.ts`) + generic engine (`src/model/rotation.ts`); Gemini reduced to an adapter (`src/model/gemini.ts`) with `createGeminiRouter` preserved as a thin shim; zero behavior change, all tests green. Remaining: PR 2 adapters + registry (§B/§C), PR 3 Settings UX (§D), PR 4 docs (§E). This is **model-router / platform** work — client-side, no server/telemetry/egress (standing rule 5); each provider is called direct-from-browser with the user's own key, exactly as Gemini is today.

### The load-bearing fact that shapes everything

**Gemini is the only one of the three with a free API tier.** OpenAI and Anthropic are paid-only — there is no free key to obtain. Consequences that drive the design:

- The **free / zero-config on-ramp rides entirely on Gemini** (whether the user's own free key or, separately, a hosted proxy — see `docs/projects/hosted_proxy.md`). OpenAI/Anthropic BYOK only ever means "the user already pays their own provider."
- The current **global `weak`/`strong` capability toggle stops generalizing.** "Weak = free pool with hedged prompts" is a Gemini-free-tier concept. Across three providers, capability must become a **per-provider model choice** (each adapter declares its own `fast` and `strong` model), while the existing `ModelCapability` descriptor (`src/model/capability.ts`) continues to gate evaluator behavior. See §_Capability model_.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | Provider-agnostic resilience seam + provider registry; Gemini refactored onto it (no behavior change); OpenAI and Anthropic reference adapters; Settings UX for provider + key + model selection; per-provider model tables; docs (`architecture.md` seam section, README "how to get a key" per provider). |

_No Phase-7 slice is currently scoped here; multi-key rotation (`byok_capability_model.md` Phase 7) is orthogonal and stays in that doc._

## Todo

### A — Provider-agnostic resilience seam (do first; no behavior change)

- [x] Define a `ProviderAdapter` interface (new `src/model/provider.ts`) that captures everything `gemini.ts` currently hard-codes:
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
    classifyError(
      status: number,
      headers: Headers,
      body: unknown
    ): {
      retryable: boolean;
      coolDownMs: number; // how long to bench this (key,model)
      quotaKind?: "perDay" | "perMinute" | "inputTokens" | "other";
    };
  }
  ```
- [x] Lift `callWithRotation`, `CoolDownRegistry`, the retry/stall handling, and `trackCall`/logging out of `gemini.ts` into a provider-agnostic `src/model/rotation.ts` that drives any `ProviderAdapter`. The Gemini-specific bits (`parse429`, `parseRetryDelay`, `msTilPacificMidnight`, pool constants) move **into** the Gemini adapter's `classifyError`/`pools`.
- [x] Reduce `src/model/gemini.ts` to a `ProviderAdapter` implementation. `createGeminiRouter(freeKey, paidKey)` is now a thin shim over the generic `createRouterForAdapter(geminiAdapter, freeKey, paidKey)`. **Acceptance met: zero change to eval behavior, all 716 tests green.**

> **Interface refinements made while building (vs. the sketch above), carried into PR 2:**
> - `buildRequest` returns `{ url, init }` only — key redaction for logs is done generically in `rotation.ts` (`url.split(key).join('<free|paid>')`), so header-auth providers (OpenAI/Anthropic) get a clean logged endpoint for free and adapters never format a log string.
> - `parseResponse(body)` returns `{ text, usage? }` (not bare `string`) — `usage` preserves the session/cost accounting the Gemini path already fed to `logger.ts`.
> - `classifyError(status, headers, body)` takes `body: string` (raw response text) — matches Gemini's `parse429(string)` and keeps the per-model 429 stats in `logger.ts` computing independently from the raw error body.
> - Retryability is carried by an internal `ProviderCallError { retryable }` thrown from the attempt; the pool loop advances on `retryable`, aborts otherwise. Router-level free→paid fallback (`fast`/`strong`) still swallows a paid-pool error and retries the free pool, exactly as before. Covered by `src/model/rotation.test.ts`.

### B — Reference adapters (OpenAI, Anthropic)

- [x] `src/model/openai.ts` — `ProviderAdapter` for the OpenAI Chat Completions API. `classifyError`: 429 → `retryable`, honor `Retry-After` header; `insufficient_quota` → non-retryable with a clear surfaced message (no free tier to fall back to). Defaults `gpt-5.4-mini` (fast) / `gpt-5.5` (strong); catalog offers nano→5.6.
- [x] `src/model/anthropic.ts` — `ProviderAdapter` for the Anthropic Messages API. **Browser CORS: resolved.** Endpoint `POST https://api.anthropic.com/v1/messages`; headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`, **and `anthropic-dangerous-direct-browser-access: true`** (README security note is PR 4). `classifyError`: 429 → retryable honoring `retry-after`, 5xx retryable, 400/401/403 non-retryable. `thinking: {type:"disabled"}` on the `strong` (Sonnet 5) request only (Haiku takes no thinking config). **`temperature` is omitted entirely** — corrected while building (2026-07-07): Sonnet 5 rejects a non-default sampling parameter with a 400, so we can't send `temperature: 0.2` as originally sketched; determinism rides on the prompt + disabled thinking. `parseResponse` reads the first `text` block and parses JSON exactly as the Gemini path.
- [x] Adapter shape (`buildRequest`/`parseResponse`/`classifyError`) is covered by unit tests (`src/model/adapters.test.ts`) rather than live smoke tests — a keyed live smoke remains a manual step (run the in-product "Ping model" once PR 3 lands). Selection→routing is covered end-to-end by `src/model/factory.selection.test.ts` (stubbed fetch).

### C — Provider registry + selection

- [x] `src/model/registry.ts`: `PROVIDERS`, `PROVIDER_IDS`, `resolveProvider(id)`, `catalogFor`/`defaultModels`, and `withSelection` (single-model paid routing). `factory.createRouterForSelection(selection, apiKey, paidKey)` is the new entry point: Gemini reuses the existing `createRouter` path (rotation pools + the mock/record `wrap`); paid providers drive the generic engine with one selected model per tier. `createRouter` is unchanged, so the evaluator call sites and the `../model/gemini` test mocks keep working (the mocks now spread `importOriginal` so the added `geminiAdapter` export survives).
- [ ] Persist the chosen provider (`writtten_provider`, default `"gemini"`) + per-provider model selections alongside `writtten_api_key` / `writtten_key_tier` in `App.tsx`, and thread `createRouterForSelection` into the eval path. **→ moved to PR 3** (coupled with the Settings UI that writes these localStorage keys and derives capability from the selected `strong` model).

### D — Settings UX (per-provider key + model)

**Two design goals set 2026-07-07: make it as easy as possible (1) to know how to get a key, and (2) to control what models are in the rotation.** The controls below are ordered legible-before-configurable, and the pool-editing / multi-key power surface is explicitly deferred to Phase 7 (see §_Control the rotation_ note).

- [ ] Extend the Settings panel (`src/sidecar/ControlCenter.tsx`): a provider selector (Gemini / OpenAI / Anthropic), the key field re-labeled per provider, and — replacing the single "capable model (paid tier)" checkbox — a **model picker per tier** driven by the active provider's pools. Keep `data-testid="api-key-input"` stable; add `data-testid="provider-select"`.
- [ ] **"Know how to get the key" — kill the three moments of doubt:**
  - _Getting there:_ deep-link the exact key-creation page per provider (Gemini → AI Studio; OpenAI → `platform.openai.com/api-keys`; Anthropic → `console.anthropic.com/settings/keys`), with the honest free/paid one-liner inline (Gemini "free tier available" vs OpenAI/Anthropic "paid API account required"), plus the key **shape** (`sk-ant-…`, `sk-…`) so a user can eyeball a correct paste.
  - _Did it work?:_ extend the existing "Ping model" test to **every** provider and **decode the failure** through the adapter's `classifyError` — "invalid key" vs "valid but needs billing / no quota" vs "CORS / network". Surfacing the plain-language verdict (not a raw status code) is the single biggest confidence win; it turns a silent dead-end into an actionable next step.
  - _What will it cost?:_ for paid providers, an honest **static** cost line now (e.g. "a typical PRD session ≈ N calls, mostly on the cheap model"); live per-key metering is Phase 7 (`byok_capability_model.md`).
  - _Trust:_ surface Anthropic's `anthropic-dangerous-direct-browser-access` requirement as a plain trust note (same posture as key-in-`localStorage`), not hidden.
- [ ] **"Control the rotation" — legibility card + per-tier picker (Phase 6 slice).** A read-first **"what's running and why" card**: per tier, the model name + one plain-English line on its job ("Haiku watches for contradictions as you write; Sonnet does the deeper adjudication when checks conflict"). Most users want to _understand_, not tweak — this makes the black box legible before offering the per-tier dropdown as the actual control. Note the two meanings of "rotation": **paid providers do not rotate** (one model per tier, two dropdowns); the ordered rotation _pool_ is a Gemini-free-tier concept only.
- [ ] Empty/first-run copy stays provider-neutral until a key is set; the zero-config example (`onboarding_first_run.md`) is unaffected (it's a canned replay, no live provider).

> **Legibility card + per-tier picker ship in Phase 6; pool editing and multi-key rotation stay Phase 7.** Editing the Gemini free _pool_ (add/remove/reorder models) and adding multiple keys for RPD spreading land on the same surface `byok_capability_model.md` already scopes as the Phase-7 "BYOK management UX". Keeping the Phase-6 control to "show what's running + pick one model per tier" preserves the quiet, non-config-dump feel the management-UX note in `CLAUDE.md` warns to protect.

### E — Docs

- [ ] `docs/architecture.md` § Model router: document the `ProviderAdapter` seam as the canonical extension point (a fourth provider = one new adapter file, zero call-site changes).
- [ ] README: a short "Bring your own key" section with per-provider key-issuance instructions (Gemini → AI Studio; OpenAI → platform.openai.com/api-keys; Anthropic → console.anthropic.com). This closes the "add instructions on how to obtain keys" ask.
- [ ] Update this doc's status → `done` and the Projects Index when shipped.

## Per-provider model table

Map the two router tiers (`fast` = cheap/frequent, `strong` = capable/rare) to concrete models. Anthropic IDs and prices are pinned (verified against the Claude API reference, 2026-07-06); Gemini is the existing pool; OpenAI IDs are the intent and should be confirmed against OpenAI's current lineup at build time.

| Provider  | `fast` (cheap, frequent)         | `strong` (capable, rare)         | Endpoint / auth                                                               | Free tier?                |
| --------- | -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- | ------------------------- |
| Gemini    | flash-lite (rotation pool)       | pro / flash (rotation pool)      | `generativelanguage.googleapis.com` · `?key=`                                 | ✅ — the zero-key on-ramp |
| OpenAI    | a small/`mini` model (confirm)   | a flagship model (confirm)       | `https://api.openai.com/v1/chat/completions` · `Authorization: Bearer`        | ❌ paid only              |
| Anthropic | `claude-haiku-4-5` ($1/$5 /Mtok) | `claude-sonnet-5` ($3/$15 /Mtok) | `https://api.anthropic.com/v1/messages` · `x-api-key` + browser-access header | ❌ paid only              |

> **Anthropic specifics (pinned):** `anthropic-version: 2023-06-01` on every call; add `anthropic-dangerous-direct-browser-access: true` for the direct-from-browser call; set `thinking: {type: "disabled"}` on the Sonnet 5 `strong` request (adaptive thinking is on-by-default when omitted — unwanted for deterministic eval). Sonnet 5 has an introductory $2/$10 per-Mtok price through 2026-08-31.
> **OpenAI:** IDs move fast — confirm the current small and flagship model names against OpenAI's docs when writing `openai.ts`, rather than hard-coding from memory.

## Capability model (how this meets `byok_capability_model.md`)

The existing `ModelCapability` descriptor (`{ tier, adjudicateConfidently, driveResolution }`) is **kept and honored** — it's what the evaluator branches on, and it must not regress. What changes is only how a capability is _chosen_:

- **Today:** one global `weak`/`strong` toggle, meaningful only because Gemini has a weak free pool and a strong paid pool.
- **After:** the active provider + selected model implies the capability. Gemini keeps its free-pool `weak` default. For a paid-only provider, the user's chosen `strong` model maps to strong capability; a chosen small/`fast` model maps to weak. The App boundary still decides capability **once** and threads it via `EvalContext.capability` exactly as it does now — no evaluator changes.

This keeps the invariant that reconciliation branches on **capability, not credential**, while removing the Gemini-free-tier assumption baked into the toggle's meaning.

### Paid-provider default: the capable split, `strong` on (decided 2026-07-07)

When a user first adds a **paid** provider (OpenAI/Anthropic), the default is the **capable split** — `fast` = the cheap model (Haiku 4.5 / a `mini`), `strong` = the capable model (Sonnet 5 / a flagship), with `strong` **enabled**. Rationale:

- The reason to bring a paid key is "I want better signal than the free tier." Defaulting a paying user to an all-`fast` (weak-capability) setup would hand them the hedged-prompt, resolution-aware-Tier-2-off experience while they pay their provider — the wrong first impression.
- Cost stays bounded **by design, not by neutering capability**: `strong` is the rare adjudicator (invariant #3 — cross-doc checks run against the claim ledger, not full re-reads), so most calls hit the cheap model and only the occasional adjudication hits the flagship. All-Sonnet/all-flagship would be overkill for span classification; all-Haiku would regress a paying user to weak capability.

Gemini's default is unchanged: free-pool `weak`. The capability descriptor stays truthful in both cases; only the _default selection_ differs by provider.

## Non-goals / guardrails

- **No server, no proxy, no egress change.** Every provider is called direct-from-browser with the user's key. (The separate hosted-proxy idea is `docs/projects/hosted_proxy.md` and is explicitly opt-in.)
- **No new eval behavior.** This is a routing/credential change; the taxonomy, prompts, and lifecycle are untouched. Prompts remain provider-neutral (system+user text); if a provider needs prompt massaging, that's an adapter concern, not an evaluator concern.
- **No multi-key rotation here.** That's `byok_capability_model.md` Phase 7 and stays orthogonal — though the generic `rotation.ts` should make it cheaper to add later.
- **Keep `dangerouslyAllowBrowser`-style flags honest.** Where a provider requires an explicit "I know I'm calling from the browser" acknowledgement, that reflects a real trust/exposure fact (the key sits in `localStorage`); surface it in the README security note rather than hiding it.
