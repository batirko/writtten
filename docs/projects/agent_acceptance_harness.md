---
status: done
phases: [1, 2]
summary: A dev-only agent harness — debug state API, structured event stream, readiness signal, seedable state, and mock LLM — so acceptance tests run deterministically and an agent can observe app internals.
---

# Agent Acceptance Harness

> Observability + control surface that lets an AI agent (or a human) drive the app through acceptance tests and **see what it's doing internally**. Born out of the first automated Phase 1 acceptance run (`docs/acceptance-testing/phase1-results.md`), where the agent could operate the UI but had no machine-readable view of state and no deterministic way to wait on it.

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Closed 2026-06-01.** All Phase 1 and Phase 2 todos shipped and verified. Phase 1 acceptance suite confirmed end-to-end: T6-hover (both contradiction spans highlight on card hover), T7 (decorations position-map through edits via `DecorationSet.map` — required removing `|| docChanged` rebuild condition), T8 (contradiction auto-closes when resolving edit settles). Contradiction mock-mode determinism fixed; hermetic CI fixture committed. Phase 3/4 harness exit-criteria in `docs/plan.md` are forward references; this file reopens when Phase 3 work begins.

**Phase scope:** Phase 1 (the three observability primitives — debug state API, structured event stream, readiness signal) · Phase 2 (deterministic fixtures: state seeding + mock LLM, stable selectors, non-native confirm). **Summary:** a dev-only harness so acceptance tests are observable and repeatable rather than latency-bound and inferred-from-screenshots.

This is **test/dev infrastructure**, not product. It is entirely client-side and gated behind the existing **Enable LLM Debug Mode** flag, so it introduces no required server, telemetry, or egress — consistent with standing rule 5 (local-first / privacy) in `docs/plan.md`.

---

## Motivation — what the first acceptance run exposed

The Phase 1 run worked "to some extent" but hit repeated, avoidable friction (full detail in `docs/acceptance-testing/phase1-results.md`):

1. **`wait_for` matched stale log entries.** The debug log is append-only and shows all history, so waiting for `RESPONSE` / `settle-pause` matched an _old_ entry, not the new one. The agent fell back to blind `sleep` + snapshot ~5 times.
2. **Snapshots were dominated by the debug log** — the whole growing log re-rendered on every `take_snapshot`, costing thousands of tokens of mostly-repeated text per call.
3. **No machine-readable state.** `evaluate_script` found nothing exposed; state had to be parsed out of the accessibility tree.
4. **The T6 root cause could only be _inferred_.** The agent saw two paragraphs share block id `gD-8uoum` in the REQUEST lines but could not inspect the claim ledger to confirm the overwrite. The headline bug write-up is still a hypothesis because the ledger isn't observable.
5. **Native `confirm()` on every "Clear workspace"** errored the click and forced a second `handle_dialog` call.
6. **LLM latency variance (3–24 s)** made fixed waits unreliable and turned the pause-vs-blur timing (T3) into a race decided by tool latency, not the app.

Each item below maps back to one or more of these.

---

## Phased Plan

| Phase       | Contribution                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 1** | The three observability primitives — `window.__sidecar__` debug state API, a structured + monotonic event stream (console + in-memory), and a readiness signal — so the just-fixed T6 contradiction path can be **re-verified deterministically** instead of inferred. Highest leverage; small surface.      |
| **Phase 2** | Deterministic fixtures: seed document + ledger state without typing or live calls, a mock / record-replay LLM mode, `data-testid` selectors, and a non-native confirm. Turns the growing acceptance matrix (full taxonomy lands in Phase 2) into a fast, repeatable suite that doesn't burn free-tier quota. |

---

## Todo

### Phase 1

- [x] Expose `window.__sidecar__` (dev-gated via `import.meta.env.DEV`) returning structured state: blocks (with ids+text), claim ledger, active observations, pending count, last event seq, active model. `getState()` is async (ledger/observations live in IndexedDB). (#3, #4) — `src/debug/harness.ts`
- [x] Emit a **structured, greppable console event stream** (`[sidecar] <type> seq=<n> …`) with a monotonic `seq` and an in-memory ring buffer (`getEvents(sinceSeq)`), including `ledger-write action=insert|overwrite` plus `settle` / `request` / `response` / `observation` / `block-removed`. (#1, #2, #4)
- [x] Add a **readiness signal**: a status element (`data-testid="sidecar-status"`, `idle` / `evaluating (N pending)`) driven by `harness.subscribePending`, plus `getState().pending`, so `wait_for(["idle"])` and polling are reliable. (#1, #6)
- [x] Re-run Phase 1 T6 against the surface once the block-id collision fix lands; confirm the ledger holds two competing claims via `__sidecar__` rather than by inference. — Done 2026-06-01: after the `BlockId.ts` fix, `getState().ledger` holds both the Q3 and Q2 commitments under distinct block ids and a `contradiction` observation fires (see `docs/acceptance-testing/phase1-results.md` #1 RESOLVED). T6-hover / T7 / T8 confirmed in follow-up pass (see below).

### Phase 2

- [x] **Seedable state:** `__sidecar__.loadDoc(fixture)` / `loadLedger(fixture)` to install a known document + ledger instantly. (#6) — `loadDoc` mints block ids up front and schedules a settle eval for **every** seeded block (plain `setContent` leaves the cursor in one block, so only that block would otherwise settle); `loadLedger` writes claims straight to IDB. → `src/debug/harness.ts`, `registerDocWriter` in `src/editor/Editor.tsx`
- [x] **Mock / record-replay LLM mode:** canned responses keyed by a stable request hash; `record` captures real responses, `mock` replays them offline. Deterministic, fast, quota-free. (#6) → `src/model/mock.ts`, `src/model/factory.ts` (evaluator builds its router via `createRouter`)
- [x] **`data-testid`** on feed cards (`obs-card`), dismiss buttons (`obs-dismiss`), provider chip, status element, clear button + modal, debug entries. → `src/sidecar/SidecarFeed.tsx`
- [x] Replace native `confirm()` on destructive actions with an in-app modal; add `__sidecar__.clear()` that skips it. (#5) → `src/sidecar/SidecarFeed.tsx`, `registerClear` in `src/App.tsx`
- [x] Codify each phase's acceptance suite as runnable fixtures the agent can drive end-to-end. — Done 2026-06-01: `docs/acceptance-testing/fixtures/phase1-contradiction.json` (Q3/Q2 doc + 3 recorded Gemini responses) + hermetic CI test `src/services/acceptance.phase1.test.ts` that replays the fixture offline with no network calls, asserts ledger has 2 claims and a `contradiction` observation fires. Also serves as the regression lock for the contradiction determinism fix.

> **Known limitation resolved (2026-06-01).** Contradiction replay non-determinism fixed in `src/services/evaluator.ts`: the contradiction prompt now labels existing claims by a **stable, per-request index** (`[Existing Claim #0]`) rather than the IDB auto-increment id, and sorts claims by text+blockId before building the prompt so ordering is deterministic across runs. The model maps back by index; the evaluator resolves to the matching claim entry. Fixture captured after this fix and committed as `docs/acceptance-testing/fixtures/phase1-contradiction.json`. The `src/services/acceptance.phase1.test.ts` hermetic test verifies this end-to-end offline.

---

## 1. Design principles

- **Dev-only, never in the shipped user build.** Tree-shaken out of production; the `window` surface only attaches when Debug Mode is on. No new runtime cost or attack surface for real users.
- **Observe, don't fabricate.** The harness exposes existing internal state (blocks, ledger, requests) — it does not compute new product behaviour. It must reflect exactly what the app already does.
- **Reads are free, writes are loud.** Read APIs (`getState`) are pure. Write APIs (`loadDoc`, `clear`) and the mock LLM are clearly namespaced as test affordances so they can never be mistaken for product features (and never violate the "no fix-application" principle — they manipulate _test setup_, never the user's prose on the user's behalf).
- **Stable contracts.** Event names, `data-testid`s, and the `__sidecar__` shape are an interface the agent depends on; change them deliberately.

## 2. Debug state surface (`window.__sidecar__`)

A single namespaced object, attached only when Debug Mode is active:

```typescript
interface SidecarDebugApi {
  // --- reads (pure) ---
  getState(): {
    seq: number;                       // monotonic event counter (see §3)
    pending: number;                   // in-flight evaluations; 0 == idle
    blocks: Array<{ id: string; text: string }>;
    ledger: Array<{ blockId: string; text: string; kind: ClaimKind }>;
    observations: Array<{ id: string; type: ObservationType; message: string; blockIds: string[] }>;
    activeModel: string;
  };
  getEvents(sinceSeq?: number): HarnessEvent[];   // tail of the structured log

  // --- writes (test-only; Phase 2) ---
  loadDoc(fixture: DocFixture): void;
  loadLedger(fixture: LedgerFixture): void;
  clear(): void;
  setLlmMode(mode: "live" | "mock" | "record"): void;
}
```

`getState().ledger` is the piece that would have turned the T6 write-up from hypothesis to fact: after typing two paragraphs, the agent reads the ledger and sees either two entries (correct) or one overwritten entry (the bug).

## 3. Structured event stream

Every meaningful lifecycle moment emits one structured event, both to `console.log` (so `list_console_messages` is a clean stream) and to an in-memory ring buffer (`getEvents`). Each event carries a **monotonic `seq`** and a stable id, which is what makes waiting reliable — the agent waits for "an event with `seq` greater than the one I last saw," never for a string that also appears in history.

```
[sidecar] settle       seq=42 trigger=settle-pause block=gD-8uoum
[sidecar] request      seq=43 id=req_7 block=gD-8uoum tier=fast
[sidecar] ledger-write seq=44 block=gD-8uoum action=overwrite   ← T6 bug, surfaced directly
[sidecar] response     seq=45 id=req_7 latencyMs=2905 claims=1 observations=2
[sidecar] observation  seq=46 type=contradiction blocks=[gD-8uoum,K3p9..]
```

This reuses the existing `LLMLogEntry` plumbing from `docs/projects/model_rotation_and_debugging.md` (request/response/retry/fallback) and extends it with the editor/ledger events (`settle`, `ledger-write`, `block-removed`, `observation`).

## 4. Readiness signal

The append-only debug panel is for humans; agents need a _current-state_ signal. Two forms, both cheap:

- **DOM:** one status element rendering `idle` or `evaluating (N pending)` — `wait_for(["idle"])` then works without stale matches.
- **API:** `getState().pending === 0`, pollable directly.

Either removes the need for the blind `sleep` calls that made the first run slow and fragile.

## 5. Deterministic fixtures (Phase 2)

The free-tier latency spread (3–24 s) and response variance are the main reasons fixed waits were flaky and why the same test can pass or fail run-to-run.

- **State seeding** installs a known document + ledger in one call, so logic tests don't depend on typing or model round-trips at all (e.g. seed a two-block ledger with competing `Q2`/`Q3` commitments and assert a contradiction fires — no editor, no Gemini).
- **Mock / record-replay LLM** serves canned responses keyed by input hash. A `record` mode captures real responses into fixtures once; `mock` replays them deterministically and offline, with zero quota cost. This is what upgrades the suite from "works to some extent" to a trustworthy CI gate.

## 6. Selectors & confirms (Phase 2)

- `data-testid` on the elements an agent targets repeatedly (feed cards, trigger/provider chips, status element) so targeting survives content changes.
- Swap the native `confirm()` on destructive actions for an in-app modal (clickable via normal flows, better UX too), plus a `__sidecar__.clear()` that skips the prompt in tests.

---

## Non-goals

- **Not a production analytics or telemetry path.** Dev-only, Debug-Mode-gated, no egress.
- **Not new product behaviour.** It surfaces and seeds existing state; it must never become a backdoor to features (especially nothing that edits the user's prose).
- **Not a replacement for `*.test.ts` unit tests.** This harness is for end-to-end acceptance flows an agent drives through the real app; pure logic stays in colocated unit tests.
