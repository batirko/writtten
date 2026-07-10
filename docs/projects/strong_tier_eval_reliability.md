---
status: idea
kind: infra
phases: [7]
summary: Bound strong-tier reasoning per adapter, raise the shared request timeout, and give paid strong pools a failure-only fallback so a slow contradiction sweep no longer drops the whole call.
---

# Strong-tier eval reliability

## Status

Phase 7. **Idea** — designed, not yet built. Prompted by a live OpenAI failure (see _Context_).
Deferred to Phase 7 with the rest of Phase 6's open items when Phase 6 closed (2026-07-10).
Scoped to the model-router resilience layer (`src/model/*`); no evaluator or prompt changes.

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

- [ ] **#1 timeout (general):** raise `REQUEST_TIMEOUT_MS.strong` 45_000 → 60_000 in `rotation.ts`;
      update the rationale comment. Leave `fast: 30_000`.
- [ ] **#2 reasoning (per-adapter):** OpenAI `buildRequest` → `reasoning_effort: "minimal"`;
      Gemini `buildRequest` → `generationConfig.thinkingConfig = { thinkingBudget: 0 }`
      (guard `gemini-2.5-pro`, which may need a non-zero floor); Anthropic already floors
      (`thinking: {type:"disabled"}`) — no change.
- [ ] **#4 paid fallback (per-adapter data):** OpenAI `paidStrong` → `[...STRONG_CATALOG]`
      (`["gpt-5.5","gpt-5.6","gpt-5.4"]`). Anthropic can't (single strong model) — note it. Gemini
      already has pool depth.
- [ ] Tests: `adapters.test.ts` (reasoning params + OpenAI fallback pool; default still `gpt-5.5`).
- [ ] Docs: update `multi_provider_router.md` "paid don't rotate" stance + adapter header comments.
- [ ] Full `npm test` + `lint` + `build`; live provider verification (see Verification below).

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
- **OpenAI** — add `body.reasoning_effort = "minimal"`.
- **Gemini** — add `generationConfig.thinkingConfig = { thinkingBudget: 0 }`. ⚠️ Verify
  `gemini-2.5-pro` accepts `0` (Pro may enforce a non-zero minimum, unlike Flash); if it 400s,
  gate by model id: `0` for `flash`, small floor (e.g. `128`) for `pro`.

### #4 — Failure-only paid fallback (PER-ADAPTER DATA)

`callWithRotation` already advances through a multi-entry pool on any retryable error — identical
path for free and paid (proven by `rotation.test.ts` with a 2-model paid pool). "Paid providers
don't rotate" is enforced _only_ by single-entry pools, so this is pure data.

- **OpenAI** — `paidStrong: [...STRONG_CATALOG]`. `defaultModels` reads `catalog.strong[0]`
  (`registry.ts`), so default stays `gpt-5.5`.
- **Anthropic** — only `claude-sonnet-5` in the strong catalog; no fallback possible. Protected by
  #1 + #2. Documented as a known limitation.
- **Gemini** — already multi-model; no change.

Scope: strong pools only; `paidFast` stays single-model.

## Verification

1. Full `npm test` + `lint` + `build`.
2. Live: dev server on an alt port in a worktree, real OpenAI BYO key in Settings, strong tier,
   load the same 58-claim Juno PRD (via `window.__sidecar__.loadDoc`). Confirm the contradiction
   sweep completes **<60s, status 200** and yields cross-claim observations; check the debug log
   shows `reasoning_effort` on the request.
3. Gemini guard: with a paid Gemini key, run one strong sweep on `gemini-2.5-pro`; confirm
   `thinkingBudget: 0` isn't rejected (else apply the model-gated floor).
4. Fallback: inject a 503 on the primary strong model; confirm rotation advances to `gpt-5.6`.
5. Show the running fix on a dedicated port and get an explicit "ship it" before the PR. One
   coherent change → one PR.
