# Model request negotiation

How the router decides **what shape of request** to send each model, and how it recovers when a
provider rejects that shape. Describes what is built, as of 2026-07-27.

Read this before editing any `buildRequest` / `classifyError` in `src/model/`.

## The problem it solves

Every provider exposes a "how hard should this model think" knob, and our evals want it at the
floor: our checks are located-critique judgments, not open-ended reasoning, so thinking is pure cost,
pure latency, and — on Anthropic — a competitor for the same `max_tokens` budget the answer needs.

The knob is per-provider, and **the floor is per-model**:

| Provider  | Knob                                    | Floor        | Rejected by                                          |
| --------- | --------------------------------------- | ------------ | ---------------------------------------------------- |
| Gemini    | `generationConfig.thinkingConfig.thinkingBudget` | `0`   | the 3.5+ generation and all `pro` models — thinking-mode-only |
| Anthropic | `thinking`                              | `{type:"disabled"}` | `claude-fable-5` — thinking-mode-only         |
| OpenAI    | `reasoning_effort`                      | `"none"`     | `o3`, `o4-mini`, `*-chat-latest`, `gpt-5-search-api`  |

Until 2026-07-27 each adapter encoded its exception by substring-matching the model id
(`model.includes("2.5-pro")`, `model.includes("sonnet")`). **That rots on every model launch**, because
an id carries no information about what the model accepts. All three had rotted by July, and the
failure mode was bad in both directions: a hard 400 aborting the eval for the models that reject the
floor, and silent billable thinking for `claude-opus-5`, which accepts a knob we never sent it.

This matters more than it looks because the Settings picker lists models **live from each provider's
`/models` endpoint**. The set of reachable models is therefore not something the code knows in
advance — a provider can add one at any time and a user can pick it immediately.

## The mechanic

`src/model/requestCapabilities.ts` holds a session-scoped memo of which **rung** each model sits on.

1. Each adapter declares an ordered **ladder** of settings for its knob, cheapest first — e.g.
   Gemini's `THINKING_BUDGET_LADDER = [0, 128]`, Anthropic's
   `THINKING_LADDER = [{type:"disabled"}, undefined]`, OpenAI's
   `REASONING_EFFORT_LADDER = ["none", "low", "medium", undefined]`. The last rung is usually
   "omit the parameter entirely", which covers models that don't accept it at all.
2. `buildRequest` reads `rung(provider, model)` and builds at that setting. Unknown models start at 0.
3. On a 400 that names the knob, `classifyError` calls `stepDown(...)` and returns
   `renegotiate: true`.
4. `callWithRotation` (`rotation.ts`) sees `renegotiate` and retries **the same model, immediately** —
   no backoff (nothing is rate-limited, the shape was simply wrong) and without consuming a pool slot,
   because the fix belongs to this model and rotating away would lose it *and* leave the knob unfixed.
5. `stepDown` returns `false` once the ladder is exhausted, so the adapter stops asking and the
   failure surfaces normally. A model can never loop.

The discovery sticks for the session, so an unknown model costs **at most one extra request, once**.

### Seeds

`seed(provider, {...})` pre-records rungs already verified against the live APIs, so known models
never pay that extra request. Seeds are an optimization, not a source of truth — a stale seed is
silently corrected by negotiation. They are stored separately from discovered rungs so the test hook
`_resetCapabilities()` can clear session state without deleting them.

### What is deliberately NOT uniform

Gemini's floor is not simply set to `128` everywhere to avoid the ladder. Measured 2026-07-27, a
`128` budget on `gemini-3.5-flash` spends ~90 thinking tokens and takes ~1370ms, versus 0 tokens and
~816ms at budget `0`. The floor is only free on models that cannot think at all, so it stays a rung.

## Guard

`src/model/poolRequests.live.test.ts` (gated; runs in `npm run live-check`) fires each adapter's
**real** request at every model in its pools and catalog and requires a 200.

This is the check that catches the class of bug above, and it is deliberately separate from
`poolLiveness.live.test.ts`: liveness asks "does this model still exist?" and only treats a 404 as a
failure, so a live model that rejects our request shape passes it. Unit tests can't catch it either —
the request shape is "correct", just not accepted. Only a real 200 proves it.

## When you add or change a model

- Adding to a pool or catalog: nothing else required. Run `npm run live-check`; if the model needs a
  different rung, negotiation finds it and the live test still passes — add a seed to skip the
  round-trip.
- Adding a **new knob** with per-model support: give it a ladder rather than an id check, and make
  `classifyError` recognise the provider's rejection message for it.
- A 400 that is genuinely about the prompt (not the knob) must NOT trigger renegotiation. Anthropic
  and OpenAI gate on the knob name appearing in the error body. Gemini's rejection message is
  sometimes just `"Request contains an invalid argument."`, so it gates on the status alone and
  relies on the finite ladder to bound the cost to one extra request.
