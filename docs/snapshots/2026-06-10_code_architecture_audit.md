# Code & Architecture Audit — `src/` as built

> **Snapshot date:** 2026-06-10
> **Scope:** Implementation audit of `src/` (~7.7k lines) — architecture, correctness, maintainability, doc↔code fidelity. The product concept itself was covered by the separate due-diligence audit (`2026-06-10_due_diligence_audit.md`); this snapshot judges only the code as it exists.
> **Method:** Ran the project's own gates (`npm run build` / `npm test` / `npm run lint`), then read the source directly and traced call paths. Every finding cites file:line. Verified against installed dependencies (e.g. prosemirror-view source) where behavior depends on them.

## Verdict

This is a promising prototype with unusually good architectural instincts, carrying a cluster of correctness debt exactly where the product can least afford it. The seams the docs brag about are mostly real: the IndexedDB seal is genuinely ESLint-enforced, the model layer's rotation/quota handling is better than most production code, and the record-replay eval-ratchet is rare engineering for a project this size. But the repo's own gates are rotten — **`npm run build` fails (exit 1) and `npm run lint` fails with 31 errors**, with no CI to notice — and the observation lifecycle, the product's trust currency, has three independent ways to silently end up wrong: a dead collapse-detection path (a one-token ProseMirror API misuse), an eval-state wedge where a failed strong call permanently drops a section's observations until the user edits it again, and a block-removal race that resurrects ledger claims for deleted text. **The single biggest implementation risk: observation-lifecycle integrity under failure and concurrency** — the feed can show stale, missing, or zombie observations with no error anywhere, and none of the affected modules (orchestrator, Editor, db migrations) have tests.

---

## Checks: what the project's own gates say

| Gate | Result |
|---|---|
| `npm test` | ✅ 346 passed, 9 skipped (live ratchet, gated by `EVAL_LIVE`), 22 files |
| `npm run build` | ❌ **exit 1** — ~20 tsc errors |
| `npm run lint` | ❌ **31 errors** |
| CI | None (no `.github/workflows`) |

The build fails because `tsconfig.app.json` includes all of `src` (test files included) while the repo lacks `@types/node`/`@types/jsdom`, and `vite.config.ts:30` uses the vitest `test` key without importing `defineConfig` from `vitest/config`. Tests pass only because vitest type-strips with esbuild — which is also how a literal duplicate object key survives in `src/services/evaluator.test.ts:166–178` (`blockId: "block1"` and `blockId` in the same expectation literal — TS1117; the second silently wins). The lint failures are real signal too: the rules are meaningful (see the db seal below), they're just failing on `as any` and unused destructures in `src/model/debugLog.ts:216` and `src/model/logger.ts:525`.

---

## Prioritized findings

### 1. [CRITICAL] `npm run build` is broken — the project cannot produce a production artifact

- **Location:** build output; `tsconfig.app.json`, `vite.config.ts:30`.
- **Evidence:** `tsc -b` fails on test files (`jsdom` untyped, `node:fs`/`process`/`global` unresolvable, unused `db` imports, the TS1117 duplicate key) before `vite build` ever runs.
- **Impact:** No deploy, no PWA, no verification of the "harness is stripped from prod" claim. With no CI, this rots invisibly — tests stay green while the ship path is dead.
- **What would change my mind:** Evidence of a separate working build path (none found; `package.json` has exactly one build script).

### 2. [CRITICAL] Auto-close-on-deletion is dead code — a ProseMirror `attrs`-vs-`spec` confusion

- **Claim:** Deleting flagged text never auto-closes its observation; the documented-as-mandatory collapse mechanic has never worked.
- **Location:** `src/editor/extensions/ObservationHighlighter.ts:127–131` (write) vs `:195–209` (read).
- **Evidence:** Decorations are created as `Decoration.inline(start, end, { class…, "data-obs-id": obs.id })` — three args, so the id lands in `attrs`. The collapse detector reads `(d.spec as Record<string, unknown>)["data-obs-id"]`. In the installed prosemirror-view, `spec` defaults to `noSpec` (`{}`) when the 4th argument is omitted (`class InlineType { constructor(attrs, spec) { this.spec = spec || noSpec; … } }`). So `hasDeco` and `wasDecoBefore` are both always false and `onObservationCollapsed` never fires. The wired-up handler `src/App.tsx:205` is unreachable. `ObservationHighlighter.test.ts` tests only `charOffsetToPmPos` — the collapse path has zero coverage, which is how this shipped.
- **Impact:** `docs/projects/message_generation_workflow.md:138` says "Auto-close on collapse is mandatory." In reality, deleting a flagged sentence leaves the card active with no highlight, until a later section re-eval happens to reconcile it away. Trigger: select a highlighted span, delete it, don't re-settle the section — the card sits there pointing at nothing.
- **What would change my mind:** Nothing — this is mechanical. Fix is one argument: pass `{ "data-obs-id": obs.id }` as the `spec` (4th) parameter too.

### 3. [CRITICAL] A failed strong call wedges a section's observation state until the user edits it again

- **Claim:** The merged fast call's observations are silently dropped — and stale ones never closed — whenever the contradiction call fails, because the dirty-check hash is persisted *before* reconciliation.
- **Location:** `src/services/evaluator.ts:703` (`saveBlockSummary` with `hash`), `:803` (strong call), `:900` (reconcile), `:901–903` (catch-all that only `console.error`s).
- **Evidence:** The call path: fast call succeeds → summary + hash saved at step 4 → strong contradiction call throws (e.g. `Pool exhausted (free)` from `src/model/gemini.ts:302` after the free pool cools down — routine on the 20-RPD free tier) → caught at line 901 → `reconcileObservations` at line 900 never runs. Next eval of the unchanged section short-circuits at `:612–615` on the hash match and returns. Clarity/jargon/unsupported observations the fast call already produced are lost, and previously-active observations the edit resolved stay open — permanently, until the section's text changes.
- **Impact:** Exactly the failure the product can't afford: the feed silently disagrees with the document, with no error surfaced. The user reads silence as "this section is fine."
- **What would change my mind:** A retry path that re-enters reconciliation. There isn't one — the catch is terminal and the orchestrator's `finally` just clears in-flight state.

### 4. [MAJOR] Block removal races in-flight evals: zombie claims and summaries resurrect

- **Claim:** Deleting a section while its eval is in flight re-inserts active ledger claims and a block summary for blocks that no longer exist.
- **Location:** `src/services/orchestrator.ts:106–153` (`handleBlockRemoved`), `src/services/evaluator.ts:703–704` (post-LLM writes).
- **Evidence:** `handleBlockRemoved` cancels coalesce timers and queued re-runs, orphans claims, deletes the summary — but never cancels or invalidates an *in-flight* `evaluateSection` for that section (`inFlightSections` is untouched, and `evaluateSection` has no "does this section still exist" guard before its writes). When the LLM response lands seconds later, `saveClaimsForBlock` deletes the orphaned rows and re-adds them as `active`, and `saveBlockSummary` recreates the deleted summary. Trigger: paste a section, wait for `request` to fire, select-all-delete before the response arrives.
- **Impact:** Phantom claims from deleted text permanently feed every future contradiction check, prefilter, glossary, and doc-level review (`loadActiveClaimsForDocument` has no liveness filter beyond `status`). The user gets contradictions against text that isn't in the document. Nothing ever cleans these up short of Clear Workspace.
- **What would change my mind:** A generation counter or tombstone check in the write path; traced `saveClaimsForBlock` and there is none.

### 5. [MAJOR] Dismissals don't reliably hold — suppression is keyed to raw offsets, and the sweep uses different offsets

- **Claim:** A dismissed contradiction can resurface, violating the flattery-resistant-dismissal invariant (G1/R5).
- **Location:** `src/App.tsx:174–177` (suppression records `blockId:startOffset:endOffset`), `src/services/evaluator.ts:162–184` (`isSpanSuppressed`), `:1307–1310` (sweep anchors at `0:9999`).
- **Evidence:** Per-section contradictions are anchored via `anchorSubstring` to real offsets; the bootstrap sweep anchors the *same logical conflict* at `startOffset: 0, endOffset: 9999`. A user dismisses the per-section card → suppression `b1:12:40`. A later bulk paste triggers the sweep, which re-emits the conflict with signature `b1:0:9999` → `isSpanSuppressed` misses → the dismissed card returns. (`conflictPairKey` dedup at `:1198` only checks *active* conflicts; the dismissed one isn't active.) More broadly, any text edit that shifts offsets before re-eval breaks span suppression, because `anchorText` — which exists precisely for this (`src/store/db.ts:72`: "to allow matching across edits") — is never consulted in suppression matching, nor anywhere else outside the archive UI.
- **Impact:** "I dismissed this and it came back" is the single fastest way to lose the trust the register-discipline work is buying.
- **What would change my mind:** Evidence sweep conflicts can't co-occur with dismissed per-section ones in practice; but the bulk-paste-into-existing-doc path makes the overlap easy.

### 6. [MAJOR] Highlights are rebuilt from stale stored offsets on every observation refresh

- **Claim:** The position-mapping that the editor choice exists for is discarded every time the feed refreshes.
- **Location:** `src/editor/extensions/ObservationHighlighter.ts:78` (correct `map()`), `:92–163` (rebuild path), `src/App.tsx:135–140` (`refreshObservations` after every eval/dismiss), `src/editor/Editor.tsx:612–615`.
- **Evidence:** Between meta updates, decorations are correctly mapped through transactions. But `refreshObservations` fires on every eval completion and produces a new array; the `useEffect` dispatches `setObservations`; the plugin then rebuilds *all* decorations from `obs.startOffset/endOffset` as stored at eval time. If the user typed anywhere earlier in a block after its last eval, the rebuilt highlight is shifted by exactly the inserted length. Trigger: get a highlight, type a clause at the start of that block, let any *other* section's eval complete → the highlight visibly jumps to the wrong span.
- **Impact:** Visible wrongness in the core anchoring mechanic; also feeds finding 5 (offset drift breaks suppression). The fix direction already exists in the schema (`anchorText` re-anchoring) — it's just not implemented.

### 7. [MAJOR] The highest-risk modules have zero tests

- **Claim:** Test quality is good where tests exist, but coverage is inverted relative to risk.
- **Location:** No `orchestrator.test.ts`, no `Editor` test, no `db.test.ts`, no `App`/`SidecarFeed` tests.
- **Evidence:** What *is* tested is genuinely behavioral — `feedBudget.test.ts` pins the priority-membership/document-order contract, `docReconcile.test.ts` pins the "never false-supersede" honesty invariant, the ratchet fixtures (`evalRatchet.test.ts`) regression-test prompt quality deterministically — that's rare and excellent. But the coalesce/serialize/queue state machine in the orchestrator, all eight IndexedDB migrations (including the v5 `nature→kind` data rewrite that could corrupt user data if wrong), the settle/departure trigger logic in `Editor.tsx`, and every race in findings 3–6 are untested. Findings 2–4 are precisely the kind of bug this gap predicts.
- **Impact:** Refactoring the orchestrator or db is currently unguarded; migration mistakes would destroy user data with no test ever noticing.

### 8. [MAJOR] `evaluator.ts` is a god-module, and its size is hiding the bugs above

- **Claim:** 1,331 lines mixing six prompt constants, JSON parsing, anchoring, three distinct reconcilers, and three evaluator entry points.
- **Location:** `src/services/evaluator.ts` — prompts :402–534, parsing :72–96, anchoring :566–577, span reconcile :186–288, doc reconcile :309–396, sweep reconcile :1147–1211, evaluators :586, :940, :1221.
- **Evidence:** The pieces are *already* pure and separable — the project proved the pattern by extracting `docReconcile.ts` (pure planner, injected similarity, well tested). The remaining in-file reconcilers (`reconcileObservations`, `reconcileSweepContradictions`) interleave DB awaits with decision logic, which is exactly why finding 3's ordering bug (hash-before-reconcile) wasn't visible. Minor rot inside: the dead `closureReason` branch at `:283` (`existing` is pre-filtered to member blocks, so `text_removed` is unreachable), the `9999` end-offset sentinel, and 32-bit `hashCode` dirty-checks where a collision silently skips an eval.
- **Impact:** Every lifecycle fix (findings 3–5) lands in this file; at this size and structure, each fix risks the others.

### 9. [MINOR] Debug residue and prod-surface leaks

- `[TIMER-DEBUG]` console.logs left in `src/editor/Editor.tsx:518–536` (dev-gated path, but still residue).
- The LLM debug panel defaults **on** (`useState(true)`, `src/sidecar/SidecarFeed.tsx:221`) and `llmLogger` is not DEV-gated — production users get a debug panel showing full prompts (their document text) by default.
- The harness's "stripped from production builds" claim (`src/debug/harness.ts:16–18`) is only half true: call sites are DCE'd, but the module has a top-level side effect (`llmLogger.setEventSyncHook`, `harness.ts:302`) and a circular import with `db.ts`, so the code ships (unverifiable in `dist/` while the build is broken).
- `src/App.tsx:50`: `envPaidKey || keyTier === "strong" ? "strong" : "weak"` — correct but precedence-obscure; parenthesize.

### 10. [MINOR] Performance: per-keystroke O(doc) work in the editor hot path

- **Evidence:** Every `onUpdate` runs `getBlockIds` + `getWordCount` + `emitBlockOrderIfChanged` + `resolveSection` → `resolveSections` which builds `combinedText` for **every section in the document** (`src/editor/section.ts:71–80`) — full-document string materialization per keystroke; `onSelectionUpdate` does another full resolve. The *LLM-side* "no full-document scan" invariant genuinely holds (hash dirty-checks at `evaluator.ts:612`, :972, :1245; section unit; top-10 prefilter), but the CPU-side editor path will degrade on long documents. Also: `refreshObservations` does a full-table observation scan after every eval, the archive list renders unbounded and unvirtualized, and archive rows accumulate forever.

### Privacy & security — verified, mostly clean

The single network egress in all of `src/` is the Gemini fetch at `src/model/gemini.ts:157`; no telemetry, no beacons. Logged URLs redact the key (`key=<free>`). Observation/markdown rendering goes through React escaping and the ProseMirror schema; `SemanticPaste`'s `innerHTML` use operates on a detached `DOMParser` document that PM then schema-filters — no execution surface found. Two nits: the API key rides in the URL query string (the `x-goog-api-key` header avoids proxy/extension exposure), and it's in plaintext `localStorage` (acceptable for local-first BYO-key, worth a README sentence).

---

## Doc ↔ code drift

1. **"The only pinned constant is `DOC_ID` in `App.tsx`"** (`docs/architecture.md:171`) — **false**: independently hardcoded at `src/editor/Editor.tsx:16`.
2. **"Auto-close on collapse is mandatory"** (`docs/projects/message_generation_workflow.md:138`) — the mechanism has never functioned (finding 2).
3. **`anchorText` "to allow matching across edits, resolving OBS-003"** (`src/store/db.ts:72`) — aspirational; stored and displayed, never used for matching (findings 5, 6).
4. **CLAUDE.md "known gap: contradiction strong call non-deterministic in mock (prompt embeds DB auto-increment id)"** — appears stale: prompts now use stable sorted indices (`evaluator.ts:783–794`, :1238–1241). Remove or re-verify.
5. **"Harness stripped from production builds"** — partially true (see finding 9).
6. **"IndexedDB sealed behind db.ts, ESLint-enforced"** — **true and verified**: `no-restricted-imports`/`no-restricted-globals` in `eslint.config.js`, scoped to `src/**` with `db.ts` exempt. Credit where due.
7. **"Suppression is kind/severity-aware"** — true in schema and logic (`evaluator.ts:162–184`), but note the consequence: any *medium/low*-severity dismissal is category-wide for the doc, so dismissing one `missing_topic` note mutes **all** future missing-topic observations (`evaluator.ts:322–325`) — arguably the "silencing a true critique" failure R5.4 warns about, since those are real critiques, just never high-severity by construction in `src/services/priority.ts`.
8. **Trigger/coalesce/RPM mechanics** (`docs/mechanics/evaluation-triggers.md`) — **accurate** against the code; constants match.

## What's genuinely well built

1. **The model layer** (`src/model/gemini.ts`, `src/model/logger.ts`): rotation pools with per-key cooldown registries, `parse429` distinguishing per-day vs per-minute quota with Pacific-midnight cooldowns, stall signaling, and the capability-vs-credential separation (`src/model/capability.ts`) — real operational maturity.
2. **The eval-ratchet + record/replay harness**: deterministic prompt-quality regression tests with a scorer, plus a live tier — almost nobody builds this.
3. **The `db.ts` seal**, enforced by lint rather than convention.
4. **`planDocReconciliation`**: pure planner, injected similarity/floor seams, tests asserting honesty invariants ("never a false `superseded`") rather than internals — the model for how the other reconcilers should look.
5. **Debug-log correlation** (`evalId`/`callId`/`promptRef` threading) and the harness event stream with monotonic `seq` — genuinely contributor-ready observability.

## The 3 fixes I'd do first

1. **Repair the gates** — exclude `*.test.ts` from the build tsconfig (or add a test tsconfig + `@types/node`/`@types/jsdom`), fix the `vite.config.ts` typing, clear the 31 lint errors, and add a minimal CI running build+test+lint. *Payoff: a shippable artifact and gates that stop the next regression; everything below is unverifiable in `dist/` until this lands.*
2. **Fix the lifecycle-correctness cluster as one unit**: pass the `spec` argument in `Decoration.inline` (finding 2, one-line); move the `saveBlockSummary` hash write after reconciliation, or reconcile fast-call observations even when the strong call fails (finding 3); add a liveness guard (or eval-generation token) before post-LLM writes so removed sections can't resurrect claims (finding 4). Add orchestrator/race tests alongside. *Payoff: the feed stops being silently wrong — the product's entire value proposition.*
3. **Make `anchorText` load-bearing**: re-anchor observations and match suppressions by anchor text (with offset fallback) instead of raw offsets, and unify sweep vs per-section conflict identity on `conflictPairKey` for suppression. Do it while splitting `evaluator.ts` into `prompts.ts` / `anchoring.ts` / `reconcile.ts` along the seam `docReconcile.ts` already proved. *Payoff: dismissals hold and highlights stay truthful through edits — and the heart of the codebase becomes reviewable.*
