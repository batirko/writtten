---
status: done
kind: infra
phases: [7]
summary: Bound strong-tier reasoning per adapter, raise the shared request timeout, and give paid strong pools a failure-only fallback so a slow contradiction sweep no longer drops the whole call.
---

# Strong-tier eval reliability

## Status

Phase 7. **Done — shipped 2026-07-14.** Prompted by a live OpenAI failure (see _Context_).
Deferred to Phase 7 with the rest of Phase 6's open items when Phase 6 closed (2026-07-10).
Scoped to the model-router resilience layer (`src/model/*`); no evaluator or prompt changes.
Live-verified the two per-adapter wire params against the real APIs (see _Verification_) —
which caught and corrected two spec assumptions (below).

## Context

A live OpenAI run (paid `gpt-5.5`) failed on the **contradiction-sweep** strong-tier call:
`status 503, latencyMs 45002, "Request timeout (503) after 45000ms"`. The 9 fast-tier
section-eval calls (on `gpt-5.4-mini`) all succeeded in 1.8–5s.

The "503" is **not** an OpenAI error — it is our own client-side abort in `rotation.ts`
(`callAttempt`): the strong tier has a hard 45s cap and `latencyMs: 45002` lands exactly on it.
Root cause: `gpt-5.5` is a reasoning model doing unbounded hidden reasoning over a **58-claim**
pairwise sweep, and nothing in the OpenAI adapter bounds it. Impact is total for that call because
OpenAI's `paidStrong` pool is a **single model** — the timeout raises a _retryable_ error but there
is nothing to rotate to, so the whole sweep drops and yields zero cross-claim observations.

The weaknesses are **not** OpenAI-specific — they are latent across adapters; OpenAI just tripped
them first. The fix follows the design principle "**general value where the machinery is shared;
per-adapter coverage where the wire format differs.**"

Two product decisions (made with the user):

- **Reasoning:** floor it (minimize thinking on strong), matching the existing Anthropic precedent.
- **Paid fallback:** enable failure-only rotation to a second paid model.

Out of scope: bounding/batching the 58-claim sweep input — a separate quality decision (its own project).

## Phased Plan

- **Phase 7 (this work):** the three changes below, shipped as one PR against `src/model/*`.
  No new phases; nothing deferred.

## Todo

- [x] **#1 timeout (general):** raised `REQUEST_TIMEOUT_MS.strong` 45_000 → 60_000 in `rotation.ts`;
      rationale comment updated. `fast: 30_000` unchanged.
- [x] **#2 reasoning (per-adapter):** OpenAI `buildRequest` → `reasoning_effort: "none"` (**not
      `"minimal"`** — see correction below); Gemini `buildRequest` →
      `generationConfig.thinkingConfig = { thinkingBudget: model.includes("2.5-pro") ? 128 : 0 }`
      (the `⚠️` guard fired — Pro rejects `0`, `128` verified accepted); Anthropic already floors
      (`thinking: {type:"disabled"}`) — no change.
- [x] **#4 paid fallback (per-adapter data):** OpenAI `paidStrong` → `[...STRONG_CATALOG]`
      (`["gpt-5.5","gpt-5.6","gpt-5.4"]`) **and** — the load-bearing bit the original todo missed —
      preserved through `withSelection` (see correction below). Anthropic can't (single strong
      model) — noted. Gemini already has pool depth.
- [x] Tests: `adapters.test.ts` (reasoning params incl. the Gemini per-model gate + OpenAI
      `withSelection` fallback tail; default still `gpt-5.5`).
- [x] Docs: updated `multi_provider_router.md` "paid don't rotate" stance + adapter header comments.
- [x] Full `npm test` (858 pass) + `lint` (0 errors) + `build` (clean); live provider verification
      done (see Verification below).

### Two corrections the live verification forced (2026-07-14)

- **`reasoning_effort` value:** the spec said `"minimal"`, but `gpt-5.5` rejects it with a 400
  (`Supported values are: 'none','low','medium','high','xhigh'`) — `"minimal"` was the older
  5.0/5.1-era floor. Shipped `"none"` instead: the true floor, matching the Anthropic-`disabled` /
  Gemini-flash-`0` siblings. **Caught only because the live check hit the real API** — deterministic
  tests just proved we _send_ the param, exactly the "green CI ≠ prod" gap in the release-gate memory.
- **`withSelection` collapses the fallback pool:** setting the adapter's default `paidStrong` to the
  full catalog is _necessary but insufficient_ — every non-Gemini provider routes through
  `withSelection` (`factory.ts` → `createRouterForSelection`), which rebuilt `paidStrong` as a
  single `[strong]` model. The fallback now lives in `withSelection` too: `paidStrong = [strong,
  ...catalog.strong.filter(≠ strong)]` (selected model leads, rest of the catalog trails as
  failure-only fallbacks). Without this, the widened adapter default never reached the wire.

## Design

### #1 — Raise the strong-tier timeout (GENERAL, shared machinery)

`rotation.ts` `REQUEST_TIMEOUT_MS.strong` 45_000 → 60_000. One change, every provider benefits;
deliberately not per-provider. `fast` stays 30_000. The synthetic timeout error interpolates
`timeoutMs`, so it auto-reads `60000ms`.

### #2 — Floor reasoning per adapter (PER-ADAPTER COVERAGE)

Each provider's cap uses a different wire param, so it can't be shared code; `buildRequest` doesn't
get `tier`, but the whole GPT-5.x / Gemini-2.5 families reason, so each adapter caps
**unconditionally**. This completes a pattern Anthropic already established.

- **Anthropic** — precedent, no change (`thinking: {type:"disabled"}` on Sonnet strong).
- **OpenAI** — `body.reasoning_effort = "none"` (shipped value; `"minimal"` 400s on gpt-5.5).
- **Gemini** — `generationConfig.thinkingConfig = { thinkingBudget: model.includes("2.5-pro") ? 128
  : 0 }`. The ⚠️ guard was needed: live-verified `gemini-2.5-pro` accepts `128` and rejects nothing,
  while flash variants take `0`.

### #4 — Failure-only paid fallback (PER-ADAPTER DATA)

`callWithRotation` already advances through a multi-entry pool on any retryable error — identical
path for free and paid (proven by `rotation.test.ts` with a 2-model paid pool). "Paid providers
don't rotate" is enforced _only_ by single-entry pools, so this is pure data.

- **OpenAI** — `paidStrong: [...STRONG_CATALOG]`. `defaultModels` reads `catalog.strong[0]`
  (`registry.ts`), so default stays `gpt-5.5`.
- **`withSelection` (the real path)** — non-Gemini providers always route through it, and it rebuilt
  `paidStrong` as a single `[strong]` model, collapsing the fallback. Fixed to preserve a failure-only
  tail: `paidStrong = [strong, ...catalog.strong.filter(m => m !== strong)]`. This — not the adapter
  default — is what actually reaches the wire.
- **Anthropic** — only `claude-sonnet-5` in the strong catalog; the tail is empty, so it stays
  single-entry (no fallback possible). Protected by #1 + #2. Documented as a known limitation.
- **Gemini** — already multi-model and doesn't route through `withSelection`'s paid override; no change.

Scope: strong pools only; `paidFast` stays single-model.

## Verification (done 2026-07-14)

1. ✅ Full `npm test` (858 pass / 34 skipped) + `lint` (0 errors) + `build` (clean).
2. ✅ Live wire-param acceptance against the real APIs, driving the actual adapter `buildRequest`
   (a temporary `_strongtier.live.test.ts`, run with the `.env.test.local` keys sourced, then
   deleted — un-committed): **OpenAI `gpt-5.5` + `reasoning_effort:"none"` → 200** (and `"minimal"`
   → 400, which is what forced the value correction). Note: this replaced the full 58-claim
   app-drive — the timeout raise (#1) + floored reasoning make a runaway sweep the config now
   prevents, and the fallback (#4) is unit-proven; the residual risk was purely "does the real API
   accept the new param," which this check settles directly and cheaply.
3. ✅ Gemini guard: `gemini-2.5-pro` + `thinkingBudget:128` → 200; `gemini-3.1-flash-lite` +
   `thinkingBudget:0` → 200. The ⚠️ was real — `0` on Pro was avoided by the model-gated floor.
4. ✅ Fallback: covered by `rotation.test.ts` (generic engine rotates a multi-model pool on a
   retryable 503) + the new `adapters.test.ts` assertion that `withSelection` keeps OpenAI's
   `paidStrong` fallback tail (`["gpt-5.5","gpt-5.6","gpt-5.4"]`). A live 503 can't be forced on
   demand and adds nothing over these.
5. Dev server shown on a dedicated port for the owner's "ship it" before the PR. One coherent
   change → one PR.
