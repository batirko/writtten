---
status: done
kind: infra
phases: [6]
summary: Expand BYOK from Gemini-only to Gemini + OpenAI + Anthropic at launch by lifting the Gemini-shaped resilience layer (pools, cool-down, 429/quota parsing) into a provider-agnostic seam, adding two reference adapters, and reworking the global weak/strong toggle into per-provider model selection. Turns the "non-Gemini reference adapter" OSS Superb-tier item into a first-party three-provider launch feature.
---

# Multi-provider model router

> Design written 2026-07-06. Read alongside `src/model/router.ts` (the `ModelRouter` interface every call site depends on), `src/model/gemini.ts` (the resilience code to be generalized), `docs/projects/byok_capability_model.md` (the capability↔credential decoupling this builds on), `docs/projects/model_rotation_and_debugging.md` (the rotation/cool-down seam), and `docs/architecture.md` § _Model router_ (the "deliberate extension seam" this fulfils). Supersedes and expands the OSS Superb-tier "a non-Gemini reference adapter" item in `docs/projects/oss_launch_readiness.md` — instead of leaving it to contributors, ship two adapters first-party.

## Status

> Canonical status is the frontmatter above, mirrored in the Projects Index in `docs/plan.md`. This block is human-readable scope only.

**Status: `done` — Phase 6. Launch blocker cleared.** Decision locked 2026-07-06: **support Gemini + OpenAI + Anthropic at launch** (user call), launch bar "Good-enough **plus** multi-provider". Shipped across 4 PRs (2026-07-07): **PR 1** — provider-agnostic resilience seam (§A: `ProviderAdapter` + generic `rotation.ts`; Gemini reduced to an adapter, zero behavior change). **PR 2** — OpenAI + Anthropic adapters + registry + selection API (§B/§C). **PR 3** — Settings UX + App wiring: segmented provider selector, per-tier model pickers, "what's running" legibility card, per-provider "Ping model" decode, honest cost/trust notes; provider + per-provider keys + model selections persisted; routing via app-global `setActiveProviderSelection`, capability still threaded explicitly (§C/§D). **PR 4** — docs (`architecture.md` seam section + README BYOK; §E). All client-side, no server/telemetry/egress (standing rule 5); each provider is called direct-from-browser with the user's own key. **Deferred to Phase 7:** Gemini free-pool editing + multi-key rotation (`byok_capability_model.md`), and surfacing BYOK in the first-run screen (see the §D planned note).

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
- [x] Persist the chosen provider (`writtten_provider`, default `"gemini"`) + per-provider keys (`writtten_key_openai` / `writtten_key_anthropic`; Gemini keeps `writtten_api_key`) + model selections (`writtten_model_selections`) in `App.tsx` (PR 3). Routing threads via a module-global `factory.setActiveProviderSelection(...)` that `createRouter` consults — provider choice is one app-global setting, so the evaluator/orchestrator signatures stay untouched (no hub-file churn), while capability stays threaded explicitly through `EvalContext`. Capability derives from the active provider: Gemini keeps its weak/strong logic; a paid provider → the capable split (strong). A paid key rides the `paidKey` slot and is also passed as the free key only to satisfy the evaluator's key guard (the free pool is empty, so it never hits the network).

### D — Settings UX (per-provider key + model)

**Two design goals set 2026-07-07: make it as easy as possible (1) to know how to get a key, and (2) to control what models are in the rotation.** The controls below are ordered legible-before-configurable, and the pool-editing / multi-key power surface is explicitly deferred to Phase 7 (see §_Control the rotation_ note).

- [x] Extend the Settings panel (`src/sidecar/ControlCenter.tsx`): a **segmented provider selector** (Gemini / OpenAI / Anthropic, `data-testid="provider-select"`), the key field re-labeled + re-linked per provider, and per-tier **model pickers** for paid providers (`data-testid="model-select-fast"` / `-strong`). `data-testid="api-key-input"` kept stable; the "capable model" checkbox now shows for Gemini only.
- [x] **"Know how to get the key" — kill the three moments of doubt:**
  - _Getting there:_ deep-link the exact key-creation page per provider (Gemini → AI Studio; OpenAI → `platform.openai.com/api-keys`; Anthropic → `console.anthropic.com/settings/keys`), with the honest free/paid one-liner inline (Gemini "free tier available" vs OpenAI/Anthropic "paid API account required"), plus the key **shape** (`sk-ant-…`, `sk-…`) so a user can eyeball a correct paste.
  - _Did it work?:_ a per-provider **"Ping model"** button (`src/model/ping.ts` → `pingProvider`, `data-testid="ping-model"` / `ping-verdict`) that fetches once and **decodes the outcome into plain language** — "Invalid key" / "Valid key — billing not enabled" / "rate-limited" / "Couldn't reach the provider — check your network or CORS". Verified in-browser end to end: a bad `sk-ant-…` key → 401 → "Invalid key." (also proves Anthropic's browser-access CORS path works).
  - _What will it cost?:_ a static cost line for paid providers ("Roughly 20–40 calls per PRD session, mostly on the cheap model"); live per-key metering stays Phase 7 (`byok_capability_model.md`).
  - _Trust:_ Anthropic's `anthropic-dangerous-direct-browser-access` requirement is surfaced as a plain trust note (`data-testid="trust-note"`), not hidden.
- [x] **"Control the rotation" — legibility card + per-tier picker (Phase 6 slice).** The **"what's running and why"** card names the model per tier + a one-line job. It collapses to a single honest row when both tiers resolve to the same model (Gemini free runs `gemini-3.1-flash-lite` for both — so the card says "your free-tier workhorse … a paid key unlocks a stronger adjudicator" rather than showing a duplicate). Paid providers get two per-tier dropdowns; **Gemini shows a read-only pool note** (its free rotation pool isn't user-editable in Phase 6). Gemini's `catalog` was re-pointed at the *free* pools so the card names what actually runs free, not the 0-RPD `pro`.
- [x] Empty/first-run copy stays provider-neutral until a key is set; the zero-config example (`onboarding_first_run.md`) is unaffected (it's a canned replay, no live provider).

> **Planned (not in Phase 6) — surface BYOK in the first-run / welcome screen.** Today the settings panel is where a user discovers BYOK; the welcome card + zero-config example (`onboarding_first_run.md`) never mention it. Open question raised 2026-07-07: *where and how* should the BYOK path appear in the first interaction — a line on the welcome card, a step after the canned example, or a gentle prompt once the example ends? Needs design; belongs with `onboarding_first_run.md`. Deliberately **not** built in this milestone (keep first-run provider-neutral). See [[onboarding_first_run]].

> **Legibility card + per-tier picker ship in Phase 6; pool editing and multi-key rotation stay Phase 7.** Editing the Gemini free _pool_ (add/remove/reorder models) and adding multiple keys for RPD spreading land on the same surface `byok_capability_model.md` already scopes as the Phase-7 "BYOK management UX". Keeping the Phase-6 control to "show what's running + pick one model per tier" preserves the quiet, non-config-dump feel the management-UX note in `CLAUDE.md` warns to protect.

### E — Docs

- [x] `docs/architecture.md` § Model router: documented the `ProviderAdapter` seam as the canonical extension point (a fourth provider = one new adapter file, zero call-site changes).
- [x] README: a "Bring your own key" section with the per-provider key-issuance table (Gemini → AI Studio; OpenAI → platform.openai.com/api-keys; Anthropic → console.anthropic.com), key shapes, and the local-storage / browser-access trust note.
- [x] Status → `done`; Projects Index + the `docs/plan.md` milestone updated (PR 4, 2026-07-07).

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

## Follow-up (field-discovered 2026-07-07) — "What's running" card legibility

Two confusions in the Settings **"What's running"** legibility card (the legibility-card milestone above). Both are small copy/representation changes to the same card component (`ControlCenter.tsx` running-card + the Models note); scheduled as one Phase-6 milestone in `docs/plan.md`.

**1. The title asserts activity that isn't happening when keyless (all providers).** The card always reads **"What's running · and why"** and names a model even when **no key is set** for that provider — but keyless, nothing runs (the evaluator skips every check, `src/services/evaluator.ts:181`). So the title is false in exactly the state a first-time user is in, for all three providers. Fix: when the provider has no key, retitle to the conditional — **"What _will_ run"** / "What runs once you add a key" — and/or visibly mute the card as a preview. Ties into the first-run activation honesty work (keyless = demo; `onboarding_first_run.md` § Revision).

**2. Gemini: the card names one model but the note below says a pool rotates.** For Gemini free the card shows a single row — `gemini-3.1-flash-lite` — because `geminiRunningModels(false)` returns the pool **primary** (`registry.ts`) as a representative, and the card collapses same-model tiers to one row (intentional, per the milestone above). But directly below, the **Models** note reads "Free tier rotates a fixed pool to spread your daily quota." The two read as contradictory — *one* model named as "what's running" vs. a *pool* that rotates. The user's mental model ("we rotate a group of free models") is the **correct** one; the card under-represents it. Reality: `FREE_FAST_POOL` is a 4-model rotation (`gemini.ts:27` — `gemini-3.1-flash-lite` at 500 RPD as primary + three 20-RPD fallbacks), with flash-lite the workhorse the others back up. Fix direction: make the Gemini free row **signal the rotation** so it agrees with the note — e.g. "`gemini-3.1-flash-lite` (+3 fallbacks, rotated to spread quota)" — or fold the two blocks into one coherent "what runs" story instead of a single-model row plus a contradicting pool note. Keep it honest that flash-lite carries most calls (it's the 500-RPD primary) — it isn't an equal round-robin.

### More Settings follow-ups (field-decided 2026-07-07) — model choice, key trust, selection cue

**3. Dynamic per-provider model list (replaces the preset catalogs).** Decided: fetch each provider's available models **live from its API** instead of the hardcoded `catalog` arrays (`openai.ts:25`, `anthropic.ts:27`). Resolves two things at once: the single-option **"false dropdown"** (Anthropic's `[claude-haiku-4-5]` / `[claude-sonnet-5]` render as pickers with one choice) becomes a real list, and the **staleness** the `openai.ts:10` comment already flags (hardcoded ids rot as providers ship new models). Build notes: each provider has a models-list endpoint (OpenAI `/v1/models`, Anthropic `/v1/models`, Gemini `models.list`) → per-adapter parse + a **fast/strong tier classification** heuristic (endpoints return a flat list; we split into tiers) + **caching** (don't refetch on every modal open) + a **keyless fallback** to the current preset catalog (you can't list models without a key). Filter to chat-capable models. Keep Gemini free-tier's **rotation-pool** story intact (that pool isn't a single user pick — see item 2 above). Couples with the Phase-7 BYOK management UX (`byok_capability_model.md`).

**4. Consistent key-privacy line + Remove-key control (all providers).** Today the reassurance sentence lives in `meta.trust` and is set **only for Anthropic** (`ControlCenter.tsx:83`); it's empty for Gemini/OpenAI — yet the privacy fact (the key goes direct to the provider, is stored only in `localStorage`, and never touches a server of ours) is **equally true for all three**. Decided: **(a)** generalize it to a single shared privacy line shown on every provider (not a per-provider `trust` field), and **(b)** add a **Remove key** control next to the key input so the user sees they hold — and can delete — the credential at will. _(Declined for now: a "see exactly what we send" transparency surface and lower-stakes "free/scoped/revocable key" messaging — revisit if trust proves a conversion blocker.)_ Matters more now that first-run asks for the key up front (`onboarding_first_run.md` § Revision).

**5. Provider selection reads as an inert tab — add a persisted/active affirmation.** The segmented Gemini/OpenAI/Anthropic selector persists the choice (shipped), but gives no *felt* confirmation that a provider is **selected and preserved** — it reads like flipping a passive view tab. Decided: add a clear active/committed cue (an explicit "Active provider" affirmation, a persisted checkmark, and/or visibly restoring the last-selected provider on reopen) so switching feels durable. Small `ControlCenter` UI change.

### Readiness specs (settled 2026-07-07) — build-ready detail for the follow-ups above

**"What's running" card (items 1–2) — build:**
- *Keyless title:* when the active provider has **no key**, retitle the card to **"What will run"** (and drop the "and why" → keep the job copy) and apply a muted/preview treatment (reduced opacity or a "preview" tag); with a key it stays "What's running · and why". Gate on the same key-presence check the modal already computes per provider.
- *Gemini rotation honesty:* render the free row as `gemini-3.1-flash-lite` **+ a rotation suffix** — e.g. `· rotates with 3 fallbacks to spread your daily quota` — and **remove the now-redundant separate "Models" pool note** (fold its content into this one row) so the two can't contradict. Keep the "flash-lite carries most calls" truth: phrase it as *primary + fallbacks*, not an equal round-robin. Paid Gemini + other providers are unaffected (they show real per-tier models).

**Dynamic per-provider model list (item 3) — build:**
- *Endpoints:* OpenAI `GET https://api.openai.com/v1/models` (Bearer key); Anthropic `GET https://api.anthropic.com/v1/models` (`x-api-key` + `anthropic-version`, plus the browser-access header the adapter already sends); Gemini `GET https://generativelanguage.googleapis.com/v1beta/models?key=…`. All are the same direct-from-browser trust posture as the eval calls (no new egress surface).
- *Filter:* keep chat/generation-capable models only — drop embeddings/tts/vision-only/whisper/image by id substring + (Gemini) the `supportedGenerationMethods` field must include `generateContent`.
- *Fast/strong classification (heuristic, per-adapter `classifyTier(id)`):* `fast` if the id matches `mini|nano|lite|flash|haiku`; `strong` if it matches `pro|opus|sonnet|gpt-5\.[5-9]|gpt-[6-9]`; otherwise default to `strong` (safer to over-tier than to route a heavy model as the frequent fast call). Ship the classifier as a pure, unit-tested function so it's tunable.
- *Caching + fallback:* fetch once per (provider, key) on first modal open / key change; cache in memory (+ optional `localStorage` with a short TTL). **Keyless (or fetch failure) → fall back to the current preset `catalog`** (which stays in each adapter as the honest default). Never block the modal on the fetch — render presets immediately, swap in the live list when it resolves.
- *Gemini exception:* the **free rotation pool stays a read-only pool note**, not a picker (item 2 rationale); dynamic listing applies to the paid/single-select providers (OpenAI, Anthropic, paid Gemini). Verify each provider's real response shape against the live API at build (shapes from docs/memory; confirm before parsing).

**Provider selection affirmation (item 5) — build:** strengthen the selected segment (it already highlights) with an explicit **active** affirmation — a small checkmark or "Active" label on the chosen provider — and ensure the modal **opens showing the persisted provider already selected** (restore-on-open), so the choice reads as committed, not a transient tab. Pure `ControlCenter` UI; the persistence already exists.
