# Plan — archive (Phases 0–5)

> Historical record. Phases 0–5 are **fully shipped**; their milestone-level detail lived in [`plan.md`](plan.md) until 2026-07-10, when it was moved here to keep the live plan readable. Nothing here is open work — the single item still open at archival time (**L8 — editor hot-path perf**) was carried forward into the live plan.
>
> For the current phases (6–7), the Projects Index, and the backlog, see [`plan.md`](plan.md). This file is **not** scanned by the routing-annotation contract (`docs/plan.annotations.test.ts` reads `plan.md` only), so the `[x]`/`[ ]` markers below are frozen as of archival.

---

## Phase 0 — Foundation

**Goal:** a running local-first app where the user can write and persist a document, with the plumbing the eval loop will later need — but no AI behavior yet.

Milestones:

- [x] Project scaffolding (TypeScript, build tooling, lint/test). **Record the real install/dev/build/test/lint commands in `CLAUDE.md` once they exist.**
- [x] TipTap editor renders; rich text editing works; Markdown-friendly schema.
- [x] Stable per-block ids assigned and persisted across edits (ProseMirror plugin).
- [x] Client-side persistence (IndexedDB): document saves and reloads.
- [x] Two-panel layout shell: editor + empty sidecar feed.
- [x] Model-router interface stubbed (`fast`/`strong`), with one cheap provider wired and a trivial test call proving the path works.

**Exit criteria:** open the app, write a multi-paragraph doc, reload, content persists; block ids are stable; a manual test call through the router returns a response.

**Out of scope:** any observations, summaries, ledger, archive, export.

---

## Phase 1 — "The Wow" (the v0 that proves the concept)

**Goal:** the single moment that justifies the product — _"it caught a contradiction I wrote and made me go fix it myself."_ Build the least machinery that lands this.

Scope is ruthless. Only:

- [x] **Settled-block detection** (debounce + terminal punctuation + min length). Quiet while drafting. → see `docs/projects/message_generation_workflow.md`
- [x] **Block summarization** on settle, with trivial-change short-circuit (hash diff). Merge summarize + claims + clarity into one structured-output `router.fast` call per block to stay within free-tier RPM limits. → see `docs/projects/model_rotation_and_debugging.md`
- [x] **Claim ledger** (extract → upsert/retire per block; orphan on block delete).
- [x] **Two checks only:** `clarity` (span) and `contradiction` (against the ledger / stage).
- [x] **writtten feed** rendering active observations. → see `docs/projects/message_generation_workflow.md`
- [x] **Hover → highlight** the referenced span(s); contradiction highlights both sides.
- [x] **Anchoring via position mapping** so highlights track text through edits.
- [x] **Auto-close** observations resolved by an edit (incl. close when the span is deleted). → see `docs/projects/message_generation_workflow.md`
- [x] Minimal stage definition as a plain editable field (inference comes later).

**Exit criteria (the demo script):** write a doc containing a self-contradiction; within a few seconds of the second claim settling, a `contradiction` observation appears referencing both spans; hovering highlights both; editing one side to resolve it auto-closes the observation — **and at no point did the tool offer to fix the text.**

**Harness exit criterion:** [x] `getState()` exposes blocks, ledger, observations, pending, activeModel; event stream covers settle/request/response/ledger-write/observation/block-removed; `loadDoc`/`loadLedger`/`clear`/mock-mode all work; `data-testid` set covers feed cards, provider chip, status chip, clear modal. → `docs/projects/agent_acceptance_harness.md`

**Explicitly out of scope:** archive UI, dismissal, the remaining observation types, document-level checks beyond contradiction, stage inference, BYO key, model tiering, export. Resist all of it.

---

## Phase 2 — Full taxonomy & lifecycle

**Goal:** turn the proof into a usable daily tool.

Milestones:

- [x] Remaining span checks: `unsupported_claim`, `undefined_jargon`.
- [x] Remaining doc-level checks: `missing_topic`, `underexposed_topic`, `structure_flow`, `audience_mismatch`.
- [x] Content threshold gating for doc-level checks (warm-up curve: 150-word minimum). → see `docs/projects/message_generation_workflow.md`
- [x] **Dismissal** + "dismissal teaches" suppression (per-span; per-doc-type). → see `docs/projects/message_generation_workflow.md`
- [x] Full message lifecycle: `auto_closed` / `dismissed` / `superseded`. → see `docs/projects/message_generation_workflow.md`
- [x] **Archive** UI: collapsible section showing dismissed/auto_closed/superseded with status badges.
- [x] **Stage inference** with one-click confirm/dismiss chip. → see `docs/projects/message_generation_workflow.md` (stage-changed trigger)
- [x] Master-summary maintenance: block summaries loaded per-doc for doc-level context (full master-summary rollup deferred to Phase 3).

**Exit criteria:** a PM can write a real PRD start-to-finish and the feed behaves well throughout — quiet early, useful during revision, no re-nagging on dismissed items, archive populated correctly, stage inferred sensibly.

**Harness exit criterion:** [x] `getState()` includes suppressions count; `loadSuppressions` fixture added; `data-testid` added to archive UI (`archive-toggle`, `archive-list`, `archive-card`), stage inference chip (`stage-suggestion`, `stage-suggestion-accept`, `stage-suggestion-dismiss`). → `docs/projects/agent_acceptance_harness.md`

**Out of scope:** export polish, model tiering, BYO key (basic single-provider is fine to carry from Phase 0/1).

**Carry-over (incomplete):** the **SkillOpt labeled eval fixture set** (`src/services/eval-fixtures/`, 20–40 ground-truth docs wired into Vitest as a regression suite) was scoped here but never built. → see `docs/projects/ai_tooling_integration.md` (Phase 2 todo). It is independently valuable as a quality ratchet regardless of SkillOpt; **now scheduled into Phase 4** as the evaluator quality ratchet, since recommendation quality is the core experience.

---

## Phase 3 — Models, cost, and BYO key

**Goal:** make it cheap to run free and powerful when the user pays their own way.

Milestones:

- [x] Model **tiering** live: `FAST_POOL` starts with flash-lite (cheapest); `STRONG_POOL` starts with pro tier (highest quality). → `src/model/gemini.ts`
- [x] **Rate limit resiliency**: rotation pools, cool-down registry, LLM debug panel (Ollama offline fallback skipped for now). → see `docs/projects/model_rotation_and_debugging.md`
- [x] **BYO-key** flow: settings UI with `data-testid="api-key-input"` / `data-testid="settings-panel"`, local key storage in localStorage, direct Gemini calls from client. `src/sidecar/SidecarFeed.tsx`
- [x] Embedding-based **prefiltering** for the claim ledger — lexical prefilter (Jaccard token-overlap, top-10) bounds contradiction prompt as documents grow. LEANN deferred (Python dep). → `src/services/prefilter.ts`
- [x] Cost/latency instrumentation (local only): session-level `fastCalls`, `strongCalls`, `avgLatencyMs` tracked in `llmLogger.getSessionStats()`; shown in debug panel; surfaced in `getState()`. RPM budget in `src/model/rpmBudget.ts`; orchestrator defers doc-idle when near limit. → `src/model/logger.ts`, `src/model/rpmBudget.ts`, `src/services/orchestrator.ts`
- [x] **Decision point — free tier proxy:** stays fully client-side. Direct-to-Gemini calls from the browser work without a proxy; no CORS issues with the `generativelanguage.googleapis.com` endpoint. A thin proxy would add infra cost, a mandatory server, and a privacy-model change — none of these are worth it at current scale. Revisit if the free-tier model list changes.

**Exit criteria:** free tier works with no key and acceptable latency/cost; adding a key visibly improves observation quality; large documents don't blow up the contradiction check.

**Harness exit criterion:** [x] `data-testid="api-key-input"` and `data-testid="settings-panel"` on BYO-key settings UI; `getState().sessionStats` exposes `fastCalls`, `strongCalls`, `avgLatencyMs`; prefilter is a pure function (no mock needed — tested directly in `prefilter.test.ts`); `data-testid="session-stats"` on debug panel cost row; `data-testid="arrival-indicator"` on batched arrival chip. → `docs/projects/agent_acceptance_harness.md`

---

## Phase 4 — Core experience: signal quality & calm feed

**Goal:** make the write → observe → rethink loop genuinely good. The product's whole reason to exist is that the recommendations are high-signal and the feed stays calm and trustworthy. This is the differentiator; it earns its place _ahead_ of egress and packaging. (Reprioritized 2026-06-03: getting text out and installability matter, but they're table-stakes — they follow the core loop being worth living in, not the other way round.)

**Already shipped here** (this work was always core-experience, not egress — recorded as the foundation the rest builds on):

- [x] **Section as evaluation unit** (heading + body is the atomic eval input; blocks remain the anchoring unit). → see `docs/projects/section_as_eval_unit.md`
- [x] **Evaluation signal-quality remediation** (Tier A/B/C: meta-claim guard, defined-terms dedup, `unsupported_claim` carve-out, observation dedup, tier-calibrated contradiction confidence, per-request timeout + stall affordance, doc-level dirty-check). → see `docs/projects/evaluation_signal_quality.md`
- [x] **Import and Markdown-aware paste** — lets the user bring an existing draft into the loop (semantic paste via TipTap plugin; markitdown binary import deferred, Markdown/TXT-only to hold the local-first invariant). → see `docs/projects/ai_tooling_integration.md` · `docs/projects/section_as_eval_unit.md`

**Now active** (pulled forward from the old Phase 5 / field-test backlog because they _are_ the core experience):

- [x] **Observation priority axes** — add `kind` / `severity` / `confidence` / `priority` to the observation model + IndexedDB migration. → see `docs/projects/observation_taxonomy_and_priority.md` (Milestone A)
- [x] **Pure priority function** `src/services/priority.ts` (type-prior × claim-kind escalation × confidence) + unit tests. → see `docs/projects/observation_taxonomy_and_priority.md` (Milestone B)
- [x] **Budget-based calm feed** — sort by priority, show top-N, "also noticed" drawer, kind floors/ceilings. The single biggest "feels calm vs. feels like a wall" lever. → see `docs/projects/observation_taxonomy_and_priority.md` (Milestone E)
- [x] **Confidence / impact badging** — visual hierarchy so a contradiction outranks a clarity nit instead of competing with it. `kind × severity` border matrix + low-confidence `~` qualifier on the type tag. → `docs/snapshots/2026-06-03_evaluation_signal_quality_review.md`
- [x] **Observation aggregation** — collapse cross-type flags on the _same span_ into one high-impact card (the Q2/Q3 paradox fired three). Same-span grouping (`blockId:start:end`) → one budget slot; primary shown, others in a "N more on this passage" collapse. → `src/sidecar/obsAggregation.ts`
- [x] **Jargon allow-list / domain dictionary** — kill `undefined_jargon` false-positives on standard domain terms ("soft launch", "rollout cohort") that erode trust. Hardcoded PM preset (`src/services/jargonPreset.ts`) always merged into the glossary + user dictionary textarea. → same snapshot.
- [x] **`strategic_tension` observation type** — a bucket for strategic tradeoffs that aren't strict factual contradictions, so they stop being mis-flagged. The cross-claim check now returns both `contradictions` (hard logical incompatibility, `problem`) and `tensions` (deliberate tradeoffs, `opportunity` — softer teal register, never floored, priority 1.5). Both contradiction prompts tightened to route tradeoffs away from `contradiction`. → same snapshot; resolves OBS-004. (Taxonomy addition — within the fixed-taxonomy invariant.)
- [x] **Evaluator quality ratchet** — labeled fixture corpus (`src/services/eval-fixtures/`, 6 seed cases) + two-tier scorer: Tier 1 deterministic replay in CI (exact precision/recall=1, zero quota); Tier 2 opt-in live scorer (`EVAL_LIVE=1 npm run eval:live`, precision/recall floor, `knownGaps` tracking). Record helper (`npm run eval:record`) makes adding fixtures frictionless. → see `docs/projects/evaluator_quality_ratchet.md` · `docs/projects/ai_tooling_integration.md` (Phase 2 carry-over)

**Newly scheduled** (2026-06-04 requirements analysis — the qualitative trust guardrails that were asserted in the fidelity bar but unenforced; they are signal-quality work, so they belong in this phase, not packaging):

- [x] **Flattery-resistant dismissal (G1)** — make dismissal-suppression kind/severity-aware so muting a nit never silences a true high-severity critique on other spans. The product's defining counter-positioning ("won't learn to flatter you"), currently unguarded. → see `docs/projects/philosophy_guardrails.md` (G1) · R5.4
- [x] **Explicit anti-taxonomy (G2)** — negative-list prompt instruction (never surface grammar/style/surface nits) + a ratchet fixture asserting they never appear. Holds the line against the surface-drift gravity well. → see `docs/projects/philosophy_guardrails.md` (G2) · R4.3

**Field-test blockers** (2026-06-04 dogfooding — acceptance blockers for the "calm feed" goal, not Phase 5 polish; root-cause analysis in `docs/projects/quality_remediation_synthesis.md`):

- [x] **Decouple settle from window focus; collapse double strong-tier call (R1)** — stop treating `window-blurred` as "done"; require genuine idle or structural maturity. Merge the two simultaneous `gemini-2.5-pro` calls (ledger + doc-level) into one debounced request per settle. Alt-tabbing to reference material currently burns 4–6 paid-tier invocations per paste and spams premature warnings. → see `docs/projects/quality_remediation_synthesis.md` (R1) · resolves OBS-014, OBS-020
- [x] **Fix text-extraction block-separator bug (R5)** — join ProseMirror blocks with a separator before substring/offset matching so highlights don't bleed across bullet boundaries. Cheap correctness fix with visible trust impact. → see `docs/projects/quality_remediation_synthesis.md` (R5) · resolves OBS-007, OBS-017
- [x] **Repair observation reconciliation / lifecycle engine (R3)** — fix ghost-archiving, false resolution, and active/archive duplication; inject a block's prior active observations into re-eval prompts so the model can confirm whether an edit resolved the specific issue. The archive-context and feed-choreography UX in Phase 6 are unshippable until this is stable. → see `docs/projects/quality_remediation_synthesis.md` (R3) · resolves OBS-012, OBS-021
- [x] **Feed-prioritisation transparency (R7a)** — add a severity/impact/confidence cue to cards so the user understands why a card is promoted vs. "also noticed." The budget feed already ranks; it just doesn't explain itself. → see `docs/projects/quality_remediation_synthesis.md` (R7) · resolves OBS-013 / UX-003

**Exit criteria:** in a real PRD revision session the feed _feels_ calm and trustworthy — high-impact items (contradictions) surface first and visibly outrank nits, near-duplicate flags collapse, and jargon/tension false-alarms don't appear. **The feed never flatters** (dismissing a true critique doesn't silence the category elsewhere) **and never surfaces anti-taxonomy nits** (grammar/style/surface). A regression suite guards the bar.

**Harness exit criterion:** [x] `getState()` exposes `priority`/`severity`/`confidence` per observation (Milestone A); `data-testid="also-noticed-drawer"` (Milestone E); `data-testid="impact-badge"` on severity/confidence dot (R7a, 2026-06-04). → `docs/projects/agent_acceptance_harness.md`

---

## Phase 5 — Egress, install, hardening

**Goal:** once the core loop is worth living in, make getting text out frictionless and the app pleasant to keep open. (Was Phase 4; demoted below the core experience on 2026-06-03 — egress is table-stakes, not the draw.)

> **Status (2026-06-17): essentially complete.** Egress (export/copy), PWA, and accessibility shipped; the hardening sprint is L1–L7 done with only **L8** (editor perf, deferrable) trailing. The phase's exit criteria are met. The experience/feel, signal-quality, and validation work that had accreted here was **moved to Phase 6** (the re-cut on 2026-06-17) so this phase reflects its real, near-closed scope.

**Hardening sprint (immediate — code-correctness cluster, sequenced _ahead_ of the UX polish below).** From the 2026-06-10 code-architecture audit (re-verified 2026-06-13). The repo's own gates are broken and the observation lifecycle has three silent-failure paths — the build can't currently produce the PWA/export/accessibility artifacts the milestones below mark `[x]` (those checkmarks are **unverifiable in `dist/` until L1 lands**), and a silently-wrong feed undercuts the core trust proposition. → see `docs/projects/lifecycle_integrity.md`

- [x] **L1 — Repair gates + add CI.** Added `tsconfig.test.json` (test files type-checked with `@types/node`/`@types/jsdom`) + excluded `*.test.ts` from the app build; fixed `vite.config.ts` (`defineConfig` from `vitest/config`); dropped the duplicate `blockId` key in `evaluator.test.ts`; cleared all 31 lint errors (`ignoreRestSiblings` for the destructure-omit idiom, `no-explicit-any` off for test files, precise types for the two prod casts); converted the Projects Index to markdown links so `projects.index.test.ts` is green; added `.github/workflows/ci.yml` running lint+build+test. Build now produces a verifiable `dist/` (incl. PWA `sw.js`/manifest). (2026-06-13)
- [x] **L2 — Fix dead auto-close-on-deletion.** Passed `{ "data-obs-id": obs.id }` as the 4th (`spec`) arg of both `Decoration.inline` calls so the collapse detector resolves `hasDeco`/`wasDecoBefore` and `onObservationCollapsed` fires on span deletion; added a jsdom collapse-path test (+ negative test) and reconciled the `message_generation_workflow.md` claim. (2026-06-13)
- [x] **L3 — Fix eval-wedge under strong-call failure.** Re-verified the wedge was real, then fixed via atomic dirty-check: moved the `saveBlockSummary` hash write to _after_ `reconcileObservations` (main + empty-section paths) so a failed strong call leaves the section dirty for retry instead of short-circuiting on a stale hash. Rejected the "reconcile fast obs on failure" option — it would falsely auto-close still-valid contradictions via the reconcile orphan pass. +3 failure tests (regression-guarded), mechanic doc updated. (2026-06-14)
- [x] **L4 — Fix block-removal race (zombie claims).** Added an eval-generation token (`sectionEvalGeneration` in `orchestrator.ts`): `handleBlockRemoved` bumps it, `dispatch` threads an `isLive()` predicate into `evaluateSection`, which checks it before its post-LLM writes (after the fast call, after the strong call, and on the empty path). A removed section's late LLM response can no longer resurrect `active` claims/summary. Invalidates writes rather than cancelling the in-flight `fetch` (quota-only optimisation, deferred). New `orchestrator.test.ts` + 3 evaluator liveness tests, all regression-verified. (2026-06-14)
- [x] **L5 — Make `anchorText` load-bearing.** Shipped as three PRs: 5a — suppressions match by anchorText / conflictPairKey (offset fallback), so a dismissal holds across edits and a dismissed contradiction also suppresses the sweep re-emission; 5b — highlights re-anchor by anchorText on rebuild (`reanchorOffset`), so they don't jump on refresh; 5c — per-section reconcile dedupes conflicts by `conflictPairKey`, coalescing with the sweep. DB v8→v9. +13 tests, regression-verified. (2026-06-14)
- [x] **L6 — Split `evaluator.ts`** into `evaluatorPrompts.ts` (prompts + parseJSONResponse, pure) / `evaluatorAnchoring.ts` (anchoring helpers + identity, pure) / `evaluatorReconcile.ts` (DB-interleaved reconcilers); `evaluator.ts` rewritten to import from all three and re-export the full prior public API. Dead `"text_removed"` branch removed. Zero consumer changes; 393 tests green. (2026-06-15)
- [x] **L7 — Close prod prompt-leak.** `debugMode` defaults off; debug panel UI and toggle wrapped with `import.meta.env.DEV` (Vite DCEs in prod); harness top-level `llmLogger.setEventSyncHook` moved into a DEV guard; all emit/archive call sites confirmed already gated. +1 regression test. (2026-06-15)
> **L8 — Editor hot-path perf** — the one milestone still open when Phase 5 was archived; **carried forward to the live [`plan.md`](plan.md)** (per-keystroke O(doc) `resolveSections`/`refreshObservations` full scans; profile first, lower priority).

Milestones:

- [x] Export: Markdown and PDF (PDF via browser print-to-PDF behind a swap seam). → see `docs/projects/egress.md`
- [x] Copy to clipboard: rich text and Markdown. → see `docs/projects/egress.md`
- [x] PWA: installable, offline-capable app shell (empty/early-state _polish_ rides with Onboarding & Visual style). → see `docs/projects/egress.md`
- [x] Accessibility and keyboard-first polish in the feed and hover/highlight interactions. → see `docs/projects/accessibility.md`
- [x] **Debug-log unify** — single emitter feeding both the agent event stream and the human debug panel; token/cost capture from Gemini `usageMetadata`; redaction + retention review. → see `docs/projects/debug_log.md` (Phase 5)

**Exit criteria:** a user can import a draft, work in it, and export/copy clean output in all formats; the app installs and runs offline.

**Harness exit criterion:** [x] `loadDoc` accepts a Markdown string as an alternative to the block-array fixture so import round-trips are testable without typing. [ ] `data-testid` on export/copy affordances and PWA install prompt (— 🟢 Low · 🔧). → `docs/projects/agent_acceptance_harness.md`

