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

**Status: `idea` — Phase 6. Launch blocker.** Decision locked 2026-07-06: **support Gemini + OpenAI + Anthropic at launch** (user call, this session), and the launch bar is "Good-enough **plus** multi-provider" — the repo does not go public until all three ship. Design is specced here to 🟢 (the adapter interface, the resilience abstraction boundary, the concrete model IDs, and the browser-CORS question are all resolved below); not yet started. This is **model-router / platform** work — client-side, no server/telemetry/egress (standing rule 5); each provider is called direct-from-browser with the user's own key, exactly as Gemini is today.

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
- [ ] Lift `callWithRotation`, `CoolDownRegistry`, the retry/stall handling, and `trackCall`/logging out of `gemini.ts` into a provider-agnostic `src/model/rotation.ts` that drives any `ProviderAdapter`. The Gemini-specific bits (`parse429`, `parseRetryDelay`, `msTilPacificMidnight`, pool constants) move **into** the Gemini adapter's `classifyError`/`pools`.
- [ ] Reduce `src/model/gemini.ts` to a `ProviderAdapter` implementation. `createGeminiRouter(freeKey, paidKey)` becomes `createRouter(geminiAdapter, {freeKey, paidKey})`, or a thin shim over the generic factory. **Acceptance: zero change to eval behavior, all existing tests green, the Gemini rate-limit tests still pass.**

### B — Reference adapters (OpenAI, Anthropic)

- [ ] `src/model/openai.ts` — `ProviderAdapter` for the OpenAI Chat/Responses API. Models table below. `classifyError`: 429 → `retryable`, honor `Retry-After` header; `insufficient_quota` → non-retryable with a clear surfaced message (no free tier to fall back to).
- [ ] `src/model/anthropic.ts` — `ProviderAdapter` for the Anthropic Messages API. **Browser CORS: resolved — it works.** Endpoint `POST https://api.anthropic.com/v1/messages`; required headers `x-api-key: <key>`, `anthropic-version: 2023-06-01`, `content-type: application/json`, **and `anthropic-dangerous-direct-browser-access: true`** (the flag that permits the direct-from-browser call — same trust posture as Gemini's key-in-`localStorage`; surface it in the README security note, don't hide it). `classifyError`: 429 → retryable, honor the `retry-after` header; non-retryable 400/401/403 surfaced with a clear message. **Eval calls are single-shot JSON classification, so set `thinking: {type: "disabled"}`** on the `strong` (Sonnet 5) request — Sonnet 5 runs adaptive thinking by default when `thinking` is omitted, which we don't want to pay for on a deterministic span/contradiction check. (Haiku 4.5 takes no thinking config.) `parseResponse` reads `content[0].text`; the eval prompts already ask for JSON, so parse it from the text exactly as the Gemini path does.
- [ ] Each adapter ships a tiny live smoke test (opt-in, excluded from CI like `eval-fixtures/record.test.ts`) — one `fast` and one `strong` call, asserting `parseResponse` shape.

### C — Provider registry + selection

- [ ] `src/model/registry.ts`: `PROVIDERS: Record<ProviderId, ProviderAdapter>` and `resolveProvider(id)`. The mock/record `wrap()` in `factory.ts` is provider-agnostic already (it hashes on system/user/json) — keep it, just feed it the resolved provider's router.
- [ ] Persist the chosen provider (`writtten_provider`, default `"gemini"`) alongside the existing `writtten_api_key` / `writtten_key_tier` in `App.tsx`.

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
