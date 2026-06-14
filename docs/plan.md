# Plan

> Phased build plan. **Check the "Current phase" marker before adding functionality.** If a thing belongs to a later phase, don't build it yet — flag it instead. Scope creep is this project's primary risk. Refine phases as you learn; keep this file the source of truth for sequencing. Field-test reviews in `docs/snapshots/` feed the **Discovered / unscheduled** backlog near the bottom — check there for insights not yet folded into a phase.

> **What "good" means:** `docs/product-requirements.md` is the fidelity bar (tiered requirements R1.1–R6.4 + the five load-bearing tensions); `docs/acceptance-testing/fidelity-criteria.md` turns it into pass/fail gates. The phases below sequence the work; those two files define when it's faithful.

**Current phase: Phase 5 — "Egress, install, hardening."** (Phase 1 fully verified 2026-06-01. Phase 2 fully implemented 2026-06-02. Phase 3 fully implemented 2026-06-02. Phase 4 fully implemented 2026-06-05. Reprioritized 2026-06-03: the core write→observe→recommend loop led; egress/install follows.)

> **Routing legend.** Open milestones below carry an annotation `— <readiness> <complexity> · <agent>` so it's clear what's ready, how hard, and who should build it. Completed (`[x]`) lines are left unannotated.
>
> - **Readiness:** 🟢 fully defined, ready to build · 🟡 mostly defined, decisions along the way · 🟠 not defined, needs pre-work/planning · 🔴 concept only, no design.
> - **Complexity:** Low · Med · High.
> - **Agent:** 🧠 capable/expensive (judgment, design, prompt-quality, architecture) · ⚙️ mid · 🔧 simple/mechanical (well-specified, low-decision).
>
> **This is required metadata, not decoration.** Every new open milestone (here or in any phase section) gets the annotation **on creation** — there is no unannotated open item. And it's **living:** whenever work touches an item, re-assess and update its annotation in the same change. **Readiness** moves the most (e.g. a design spec lands → 🟠→🟡, or a milestone is fully specced → 🟡→🟢); **complexity** and **agent** shift less often but get re-rated when new information changes the picture (e.g. a "simple" item turns out to need architectural judgment → 🔧→🧠). When an item is completed, drop the annotation as the `[x]` is added.

---

## Projects index

> **Completeness contract:** every file in `docs/projects/` appears in this table — if it isn't listed here, it doesn't exist. When you create a project file you **must** add a row here (minimum); if it's scoped to specific phases, **also** add `→ see` links on those milestone lines below (maximum). Status is the file's frontmatter `status:` field, mirrored here — never encoded in the filename. `docs/projects.index.test.ts` enforces folder ↔ table ↔ frontmatter consistency.

| Project                           | Status      | Phases                                                              | One-line                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [message_generation_workflow](projects/message_generation_workflow.md)       | done        | 1 ✅ · 2 ✅ · 3 ✅                                                     | The contract between editor, evaluator, model router, and feed — when observations fire, what context the LLM sees, how the feed behaves.                                                                                                                                                                                 |
| [model_rotation_and_debugging](projects/model_rotation_and_debugging.md)      | done        | 1 ✅ · 3 ✅ (Ollama skipped)                                          | Gemini free-tier rate-limit resiliency: call batching, model rotation, cool-down registry, LLM debug panel.                                                                                                                                                                                                               |
| [ai_tooling_integration](projects/ai_tooling_integration.md)            | idea        | 3 (LEANN deferred) · 4 (SkillOpt ratchet) · 5 (markitdown deferred) | SkillOpt, LEANN, and markitdown — when to adopt, what each needs, and how each maps to a specific phase milestone.                                                                                                                                                                                                        |
| [agent_acceptance_harness](projects/agent_acceptance_harness.md)          | done        | 1 · 2                                                               | Dev-only observability + control surface (debug state API, structured event stream, readiness signal, seedable state, mock LLM) so an agent can drive and verify acceptance tests deterministically.                                                                                                                      |
| [evaluation_signal_quality](projects/evaluation_signal_quality.md)         | done        | 1 · 2 · 3 (remediation)                                             | Signal-to-noise findings from a real PRD paste-test — heading-only blocks hallucinate, the ledger self-pollutes, free-tier "strong" checks run on a weak model and emit confident false contradictions, observations duplicate — remediated in Chunk 1.                                                                   |
| [section_as_eval_unit](projects/section_as_eval_unit.md)              | done        | 4                                                                   | Redesign the evaluation unit from individual ProseMirror blocks to semantic sections (heading + body), unifying typing and paste workflows and eliminating the heading-hallucination class of bugs.                                                                                                                       |
| [bulk_paste_evaluation](projects/bulk_paste_evaluation.md)             | done        | 4                                                                   | Evaluate multi-section drafts on bulk paste/import — fast-tier span checks per section plus one ledger-internal contradiction sweep — closing the gap where a single paste went unevaluated and import fired N paid-tier calls.                                                                                           |
| [observation_taxonomy_and_priority](projects/observation_taxonomy_and_priority.md) | in-progress | 4 (A·B·E ✅) · 6 (C·D)                                               | Extend observations with kind/severity/confidence/priority axes, close the decision-rigor taxonomy gap, add a client-side reflection mirror kind, and introduce a budget-based noisiness model in the feed.                                                                                                               |
| [evaluator_quality_ratchet](projects/evaluator_quality_ratchet.md)         | done        | 4                                                                   | Labeled fixture corpus + two-tier scorer (deterministic replay CI + opt-in live precision/recall) so evaluator accuracy can't silently regress. Prerequisite for SkillOpt prompt optimization.                                                                                                                            |
| [prompt_quality_observations](projects/prompt_quality_observations.md)       | idea        | 5 · 6                                                               | Living log of observed prompt quality issues (false positives, misclassifications, missed signals) — accumulates across test sessions; remediated in a dedicated sprint.                                                                                                                                                  |
| [ux_quality_observations](projects/ux_quality_observations.md)           | idea        | 5                                                                   | Living log of observed UX quality issues (interfaces, behaviors, actions, workflows, etc.) — accumulates across test sessions; remediated in a dedicated sprint.                                                                                                                                                          |
| [quality_remediation_synthesis](projects/quality_remediation_synthesis.md)     | idea        | 4 (R1·R3·R5·transparency) · 5 (UX) · 6 (precision)                  | Root-cause synthesis of the prompt- and UX-quality logs — collapses ~32 field observations into 6 cross-cutting root causes, sequences the fixes, and flags which are Phase 4 acceptance blockers.                                                                                                                        |
| [philosophy_guardrails](projects/philosophy_guardrails.md)             | in-progress | 4 (G1·G2 ✅) · 5 (G3·G4)                                             | The three unguarded qualitative guardrails — flattery-resistant dismissal, explicit anti-taxonomy, no-disguised-fix register — plus a discomfort-budget ceiling. Enforces the qualitative half of the fidelity bar in code + CI.                                                                                          |
| [emotional_register](projects/emotional_register.md)                | idea        | 5                                                                   | Persona spec (trusted senior colleague), wrong-persona anti-patterns, message voice guide, and tone as a labeled eval dimension. The felt-tone half of register discipline.                                                                                                                                               |
| [debug_log](projects/debug_log.md)                         | in-progress | 4 ✅ · 5                                                             | Redesign the debug/observability log into one call-centric, self-describing event model — merge request+response, dereference static prompts, add archival (user + system) records, unify the two divergent logs — for human reading and AI consumption. Phase 4 slice shipped; Phase 5 (log unify + token/cost) remains. |
| [doc_scope_reconciliation](projects/doc_scope_reconciliation.md)          | done        | 4 (best-match + grace period) · 5 (resolution-aware + decisions)    | Repair document-scope observation reconciliation. Tier 1: best-match pairing + grace (2026-06-05). Tier 2A: resolution-aware doc-scope reconciliation, priorId mapping, three-pass reconciler (2026-06-06). Tier 2B: ledger sweep authoritative-with-grace on paid tier (2026-06-06).                                     |
| [byok_capability_model](projects/byok_capability_model.md)             | in-progress | 5 (capability decoupling ✅) · 6 (multi-key rotation)                | Decouple model _capability_ from the _credential_ for BYOK. Phase 5 shipped (2026-06-06): explicit `ModelCapability` descriptor threaded via EvalContext, evaluator re-gated off `paidKey`, UI key-tier toggle. Phase 6 (multi-key rotation, additive in `gemini.ts`) remains.                                            |
| [egress](projects/egress.md)                            | idea        | 5                                                                   | Build-ready specs for Export (MD + print-to-PDF behind a swap seam), Copy (rich text + MD), and PWA install/offline app shell. Lean; client-side only.                                                                                                                                                                    |
| [accessibility](projects/accessibility.md)                     | idea        | 5                                                                   | Itemized a11y & keyboard-first checklist for the feed and hover/highlight interaction — mechanical items plus flagged design-dependent ones.                                                                                                                                                                              |
| [archive_trust](projects/archive_trust.md)                     | idea        | 5                                                                   | R3b — persist each observation's ghost-anchor text + explicit closure reason and render them on archive cards so the archive is trustworthy.                                                                                                                                                                              |
| [lifecycle_integrity](projects/lifecycle_integrity.md)               | in-progress | 5                                                                   | Code-correctness hardening (2026-06-10 code audit): repair broken build/lint gates + add CI, close three silent-failure paths in the observation lifecycle, and make `anchorText` load-bearing so dismissals hold and highlights stay truthful.                                                                           |
| [field_validation](projects/field_validation.md)                  | idea        | 5                                                                   | Close the n=0 gap (2026-06-10 due-diligence audit): base-rate corpus study, external-PM sessions, and hero-miss instrumentation so the central bet becomes falsifiable.                                                                                                                                                   |

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
- [x] **Sidecar feed** rendering active observations. → see `docs/projects/message_generation_workflow.md`
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
- [x] **Repair observation reconciliation / lifecycle engine (R3)** — fix ghost-archiving, false resolution, and active/archive duplication; inject a block's prior active observations into re-eval prompts so the model can confirm whether an edit resolved the specific issue. The archive-context and feed-choreography UX in Phase 5 are unshippable until this is stable. → see `docs/projects/quality_remediation_synthesis.md` (R3) · resolves OBS-012, OBS-021
- [x] **Feed-prioritisation transparency (R7a)** — add a severity/impact/confidence cue to cards so the user understands why a card is promoted vs. "also noticed." The budget feed already ranks; it just doesn't explain itself. → see `docs/projects/quality_remediation_synthesis.md` (R7) · resolves OBS-013 / UX-003

**Exit criteria:** in a real PRD revision session the feed _feels_ calm and trustworthy — high-impact items (contradictions) surface first and visibly outrank nits, near-duplicate flags collapse, and jargon/tension false-alarms don't appear. **The feed never flatters** (dismissing a true critique doesn't silence the category elsewhere) **and never surfaces anti-taxonomy nits** (grammar/style/surface). A regression suite guards the bar.

**Harness exit criterion:** [x] `getState()` exposes `priority`/`severity`/`confidence` per observation (Milestone A); `data-testid="also-noticed-drawer"` (Milestone E); `data-testid="impact-badge"` on severity/confidence dot (R7a, 2026-06-04). → `docs/projects/agent_acceptance_harness.md`

---

## Phase 5 — Egress, install, hardening

**Goal:** once the core loop is worth living in, make getting text out frictionless and the app pleasant to keep open. (Was Phase 4; demoted below the core experience on 2026-06-03 — egress is table-stakes, not the draw.)

**Hardening sprint (immediate — code-correctness cluster, sequenced _ahead_ of the UX polish below).** From the 2026-06-10 code-architecture audit (re-verified 2026-06-13). The repo's own gates are broken and the observation lifecycle has three silent-failure paths — the build can't currently produce the PWA/export/accessibility artifacts the milestones below mark `[x]` (those checkmarks are **unverifiable in `dist/` until L1 lands**), and a silently-wrong feed undercuts the core trust proposition. → see `docs/projects/lifecycle_integrity.md`

- [x] **L1 — Repair gates + add CI.** Added `tsconfig.test.json` (test files type-checked with `@types/node`/`@types/jsdom`) + excluded `*.test.ts` from the app build; fixed `vite.config.ts` (`defineConfig` from `vitest/config`); dropped the duplicate `blockId` key in `evaluator.test.ts`; cleared all 31 lint errors (`ignoreRestSiblings` for the destructure-omit idiom, `no-explicit-any` off for test files, precise types for the two prod casts); converted the Projects Index to markdown links so `projects.index.test.ts` is green; added `.github/workflows/ci.yml` running lint+build+test. Build now produces a verifiable `dist/` (incl. PWA `sw.js`/manifest). (2026-06-13)
- [x] **L2 — Fix dead auto-close-on-deletion.** Passed `{ "data-obs-id": obs.id }` as the 4th (`spec`) arg of both `Decoration.inline` calls so the collapse detector resolves `hasDeco`/`wasDecoBefore` and `onObservationCollapsed` fires on span deletion; added a jsdom collapse-path test (+ negative test) and reconciled the `message_generation_workflow.md` claim. (2026-06-13)
- [x] **L3 — Fix eval-wedge under strong-call failure.** Re-verified the wedge was real, then fixed via atomic dirty-check: moved the `saveBlockSummary` hash write to *after* `reconcileObservations` (main + empty-section paths) so a failed strong call leaves the section dirty for retry instead of short-circuiting on a stale hash. Rejected the "reconcile fast obs on failure" option — it would falsely auto-close still-valid contradictions via the reconcile orphan pass. +3 failure tests (regression-guarded), mechanic doc updated. (2026-06-14)
- [x] **L4 — Fix block-removal race (zombie claims).** Added an eval-generation token (`sectionEvalGeneration` in `orchestrator.ts`): `handleBlockRemoved` bumps it, `dispatch` threads an `isLive()` predicate into `evaluateSection`, which checks it before its post-LLM writes (after the fast call, after the strong call, and on the empty path). A removed section's late LLM response can no longer resurrect `active` claims/summary. Invalidates writes rather than cancelling the in-flight `fetch` (quota-only optimisation, deferred). New `orchestrator.test.ts` + 3 evaluator liveness tests, all regression-verified. (2026-06-14)
- [ ] **L5 — Make `anchorText` load-bearing.** Re-anchor observations + match suppressions by anchor text (offset fallback) and unify sweep vs per-section conflict identity on `conflictPairKey`, so dismissals hold and highlights don't jump on refresh. — 🟡 High · 🧠
- [ ] **L6 — Split `evaluator.ts`** into `prompts.ts`/`anchoring.ts`/`reconcile.ts` along the `docReconcile.ts` seam; do it alongside L3–L5 so each fix is reviewable. — 🟢 Med · ⚙️
- [ ] **L7 — Close prod prompt-leak.** Default the LLM debug panel off and DEV-gate `llmLogger`. — 🟢 Low · 🔧
- [ ] **L8 — Editor hot-path perf** (per-keystroke O(doc) `resolveSections`/`refreshObservations` full scans). Profile first; lower priority. — 🟠 Med · ⚙️

**Validation & evidence (parallel track — does not gate the polish below).** From the 2026-06-10 due-diligence audit: the central bet is unfalsified at n=0 (every field observation is the founder pasting test docs at their own tool). Scheduled to run early in Phase 5 so the polish items are better-aimed, but it does not block them. → see `docs/projects/field_validation.md`

- [ ] **V1 — Base-rate corpus study.** Run the pipeline over 15–20 real PRDs; count un-planted true contradictions (hero base rate), per-type precision in the wild, and the free-vs-paid-tier delta. **Pulled forward from the Phase 6 taxonomy research gate.** — 🟡 Med · 🧠
- [ ] **V2 — External-PM sessions (×5)** on real in-flight drafts: observe write-vs-paste, whether located-critique lands as respect or coldness on a mature draft (the OBS-010 hypothesis), and whether anything drives a second session. — 🟠 Med · 🧠
- [ ] **V3 — Hero-miss instrumentation.** A dev/eval-only way to measure contradiction-at-distance _recall_ (not just false positives) against a hand-labeled corpus, plus the Jaccard-prefilter drop count. — 🟠 Med–High · 🧠
- [ ] **Per-type precision floors in the ratchet** — contradiction ≥ 0.95, nits looser; a second-rater label pass; grow the corpus. → see `docs/projects/evaluator_quality_ratchet.md` (audit #7) — 🟡 Med · 🧠
- [ ] **`clarity` discrimination fixtures** — surface-flawed-but-substantively-clean passages that `clarity` must _not_ flag (it's the laundering slot the anti-taxonomy doesn't cover). → see `docs/projects/philosophy_guardrails.md` (G2, audit #8) — 🟢 Low–Med · 🧠

Milestones:

- [x] Export: Markdown and PDF (PDF via browser print-to-PDF behind a swap seam). → see `docs/projects/egress.md`
- [x] Copy to clipboard: rich text and Markdown. → see `docs/projects/egress.md`
- [x] PWA: installable, offline-capable app shell (empty/early-state _polish_ rides with Onboarding & Visual style). → see `docs/projects/egress.md`
- [x] Accessibility and keyboard-first polish in the feed and hover/highlight interactions. → see `docs/projects/accessibility.md`
- [ ] **UI/UX mechanics pass** — audit and nail the interactions that define the product feel: hover → highlight contract, observation card anatomy (what's shown, in what order), dismiss gesture, span-focus scroll behaviour, "also noticed" drawer open/close. The mechanics are partly built in Phase 4; this pass makes them intentional and consistent. — 🟡 High · 🧠
- [ ] **Visual style** — typography, colour, spacing, component language. The tool should feel calm, editorial, and opinionated — not another dev-tool grey box. Covers editor canvas, feed panel, cards, badges, archive, and empty states. — 🔴 High · 🧠
- [ ] **Onboarding & first-run** — what a brand-new user sees on first open (the blank canvas moment), how the product introduces its own silence (quiet by design), and what the first observation feeling is like. Covers empty states, the first-settle micro-moment, and any minimal orientation copy. — 🟠 High · 🧠
- [ ] **Emotional register** — persona spec (trusted senior colleague), wrong-persona anti-patterns, message voice/copy guide applied across the per-type prompts, and tone as a labeled eval dimension. The felt-tone half of register discipline; rides with visual style + onboarding as the "product feel" pass. → see `docs/projects/emotional_register.md` · R6 — 🟠 High · 🧠
- [x] **No-disguised-fix register polish (G3)** — uniform prompt rule (locate, don't prescribe; no leading questions) hardened with a message lint/fixture. → see `docs/projects/philosophy_guardrails.md` (G3) · R2.2–R2.4
- [ ] **Discomfort-budget ceiling (G4)** — decide whether the contradiction floor needs a ceiling so a doc with many hard critiques doesn't surface them all at once; overflow into "also noticed." → see `docs/projects/philosophy_guardrails.md` (G4) · R6.3 — 🟡 High-decision/Low-build · 🧠 decide, 🔧 build
- [x] **Debug-log unify** — single emitter feeding both the agent event stream and the human debug panel; token/cost capture from Gemini `usageMetadata`; redaction + retention review. → see `docs/projects/debug_log.md` (Phase 5)

**Quality remediation** (from the 2026-06-04 dogfooding synthesis — UX-layer work that depends on Phase 4's R3 reconciliation fix landing first; prompt-precision items that can run in parallel; root-cause analysis in `docs/projects/quality_remediation_synthesis.md`):

- [ ] **Doc-level anchoring schema + category discipline (R4)** — extend the strong-tier doc-level JSON schema to optionally return anchoring targets (block id / substring) so `structure_flow` and `underexposed_topic` can highlight the text they're about; tighten prompts so `audience_mismatch` stops absorbing claim-evidence complaints and `structure_flow` stays strictly about ordering. → see `docs/projects/quality_remediation_synthesis.md` (R4) · resolves OBS-015, OBS-016, OBS-018 / UX-001 — 🟡 Med–High · 🧠
- [x] **Archive trust: closure context + ghost anchors (R3b)** — show the text an archived observation originally referenced ("ghost" anchor) and an explicit closure reason ("resolved by edit" / "superseded" / "text removed"). → see `docs/projects/archive_trust.md` · `docs/projects/quality_remediation_synthesis.md` (R3) · `docs/projects/doc_scope_reconciliation.md` (T1c makes doc-scope closure reasons honest) · resolves UX-002, UX-011
- [ ] **Feed choreography (R3c)** — enter/exit animation + transient "new"/"updated" badge so the user isn't change-blind after an eval. Depends on R3 reconciliation being stable first. → see `docs/projects/quality_remediation_synthesis.md` (R3) · resolves UX-007 — 🟡 Med · ⚙️/🧠
- [ ] **Scanning & interaction affordances (R7b)** — quoted-text subtitle on cards (UX-008); reverse-hover text → card (UX-006); auto-scroll / split-context for out-of-view and distant-contradiction spans (UX-009); visible editor formatting controls (UX-004). → see `docs/projects/quality_remediation_synthesis.md` (R7) — 🟡 Med · 🧠
- [ ] **Smart-feed-vs-manual-control design project (R2c)** — draft a spec resolving the zero-config philosophy against user desire for filtering/sorting/"top 5" controls; lightweight and opinionated, not a settings dashboard. → see `docs/projects/quality_remediation_synthesis.md` (R2) · resolves UX-010 — 🟠 High (design) · 🧠
- [ ] **Fast-tier precision hardening (R6)** — attribution-is-support carve-out (OBS-001); per-kind claim examples to fix metric/commitment/constraint misclassification (OBS-002); few-shot exemplars for forward-looking metrics where zero-shot already failed despite an exact negative example (OBS-019); payments/fraud sub-domain jargon preset (OBS-003) and general process-terms expansion (OBS-005); remove premature user-facing jargon dictionary control until account/project scope exists (UX-005). → see `docs/projects/quality_remediation_synthesis.md` (R6) · resolves OBS-001, OBS-002, OBS-003, OBS-005, OBS-019 / UX-005 — 🟢 Med · 🧠

**Exit criteria:** a user can import a draft, work in it, and export/copy clean output in all formats; the app installs and runs offline.

**Harness exit criterion:** [x] `loadDoc` accepts a Markdown string as an alternative to the block-array fixture so import round-trips are testable without typing. [ ] `data-testid` on export/copy affordances and PWA install prompt (— 🟢 Low · 🔧). → `docs/projects/agent_acceptance_harness.md`

---

## Phase 6 — Later / optional (post-traction)

Only if the drafting habit has taken hold. Don't pre-build any of this.

- **Decision-rigor taxonomy expansion** — `unstated_assumption`, `alternatives_not_considered`, `unmeasurable_criteria`, `scope_ambiguity`, `ownerless_commitment`. **Research-gated:** the 15–20-real-PRD corpus study this waits behind is now **V1 in `docs/projects/field_validation.md`** (pulled forward to Phase 5); the taxonomy expansion itself stays here, downstream of that evidence. → see `docs/projects/observation_taxonomy_and_priority.md` (Milestone C) — 🟠 High · 🧠
- **Reflection / document-mirror kind** — client-side, zero LLM calls, quiet separate panel. → see `docs/projects/observation_taxonomy_and_priority.md` (Milestone D) — 🟢 Med · ⚙️
- **BYOK multi-key rotation** — pool entries become `{key, model}`, cool-down registry keyed by `key+model`; optional mid-capability tier. Additive, contained in `gemini.ts`. → see `docs/projects/byok_capability_model.md` (Phase 6) — 🟢 Med · ⚙️
- **Noisiness control** — three-step switch (Key issues / Balanced / Everything) over the budget feed. → see `docs/projects/observation_taxonomy_and_priority.md` (Milestone E) — 🟢 Low · 🔧
- Living _where users already write_ (Notion / Linear / Confluence / email) instead of being a drafting annex — the real long-term play, per `docs/concept.md`. — 🔴 Very High · 🧠
- Documented **extension API** for the three seams (observation types, model providers, export formats) to invite OSS contribution. — 🟠 High · 🧠
- Optional Tauri desktop wrapper — the "proper local app" path. Mostly _extend-not-rewrite_: the UI runs in the system webview and persistence + model-router are already sealed seams; the main new surface is multi-document and a SQLite/filesystem backend behind `db.ts`. The Tauri-vs-integrations fork and the two enabling invariants (idb sealed; `docId` never re-hardcoded) are documented in `docs/architecture.md` → _Local-app evolution path_; invariant 1 is enforced by an ESLint rule. — 🟡 Med · ⚙️
- Lightweight monetization exploration (hosted convenience / managed model access on an OSS core) — only if traction warrants it. — 🔴 N/A · 🧠

---

## Discovered / unscheduled

> Insights from real test sessions not yet scoped into a phase. Triage each into a phase or discard — don't let them rot here. Source reviews live in `docs/snapshots/`. _(The 2026-06-03 signal-quality review's items — jargon allow-list, `strategic_tension`, aggregation, impact badging — have been triaged into Phase 4 above.)_

> Anticipated-but-unscheduled items below were surfaced by the 2026-06-06 scope analysis from project-doc open-questions / deferred decisions. Each is `(deferred)` (a path chosen against, revisit on a trigger) or an `(open question)` (a decision not yet made). Routing annotations apply as above.

- **LEANN real-vector prefilter** `(deferred)` — shipped as a lexical Jaccard prefilter; real embeddings deferred (Python dep / WASM bundle weight). Revisit if claim density makes contradiction-check misses observable in practice. **The 2026-06-10 due-diligence audit (#2) flags a hidden cost:** the lexical top-10 silently drops semantically-related-but-lexically-distant pairs ("Q2" vs "the second quarter", "20% lift" vs "one in five"), eroding hero-recall invisibly — `field_validation.md` V3 quantifies the drop and is the trigger to revisit. → `docs/projects/ai_tooling_integration.md` — 🟠 · 🧠
- **markitdown binary import (DOCX/PDF)** `(deferred)` — held to preserve the local-first invariant; MD/TXT-only import shipped. Needs the WASM-port-vs-optional-local-helper decision before scoping. → `docs/projects/ai_tooling_integration.md` — 🟠 · 🧠
- **Non-Gemini provider adapters (OpenAI / Anthropic / local)** `(open question)` — the `ModelRouter` seam already permits them; adapter work is unspecified and not blocked by the BYOK capability decoupling. → `docs/projects/byok_capability_model.md` (out of scope) — 🟠 · ⚙️/🧠
- **Priority decay over session time** `(open question)` — gently decay an undismissed observation's priority so the feed stays fresh. UX refinement; don't build without dogfooding evidence that stale-but-undismissed cards are a real problem. → `docs/projects/observation_taxonomy_and_priority.md` — 🟠 · ⚙️
- **Reflection tone-shift detection** `(deferred)` — needs per-section tone metadata in the block-summary schema first; do not build a speculative per-section tone call. → `docs/projects/observation_taxonomy_and_priority.md` — 🟠 · 🧠
- **`ownerless_commitment` as a client-side regex check** `(open question)` — `commitment` claims are already in the ledger; a lightweight no-LLM scan may suffice if the false-positive rate is acceptable. Validate against corpus. → `docs/projects/observation_taxonomy_and_priority.md` — 🟡 · ⚙️

> **Strategic open questions** (2026-06-10 due-diligence audit). These are decisions, not features — they want **evidence, not reasoning** ("naming a risk in beautiful prose feels like handling it"). The `field_validation.md` track (V1/V2) is how they get answered; don't resolve them at a desk.

- **Free tier: real tier or demo?** `(open question)` — the binding free-tier constraint is ~20 RPD per Flash model and **0** for `gemini-2.5-pro`, so free-tier "strong" checks run on a weak model and emit confident false contradictions (the R4.4 failure that discounts the whole feed). If BYO-key is effectively mandatory to meet the bar, say so in `concept.md`/`features.md` and redesign the first-run around it, rather than letting it stay emergent. Cross-ref the "free-tier contradiction strategy" open question in `evaluation_signal_quality.md`. Evidence: V1's free-vs-paid delta. → `docs/projects/field_validation.md` — 🟠 · 🧠
- **Paste-first vs ambient-companion thesis** `(open question)` — if real usage is paste → read → leave, the settling/rhythm/lifecycle machinery (much of R3/R5) services a loop users don't inhabit, and what survives is "LLM document reviewer with great span anchoring." The defensible thesis is the ambient companion; this asks whether it survives contact with the persona's actual workflow. Evidence: V2 (do they write or paste?). → `docs/projects/field_validation.md` — 🔴 · 🧠
- **OSS: real or decorative?** `(open question)` — the success metric is "a tool people want to use **and contribute to**," but the project has no name, no contributor onboarding, and a model router that is Gemini-shaped throughout. If OSS is real it needs a name, a README pitching the inversion, and the extension seams scheduled; if decorative, drop "contribute to" from the metric so the project is honest about being a solo artifact. — 🟠 · 🧠
- **Does maturity-aware severity (R2) dissolve the OBS-010 discomfort?** `(open question)` — the "abrasiveness was about _when_, not _what_" reframe is a good hypothesis promoted to a conclusion without a test; it's also exactly the reasonable-sounding move that lets the project avoid confronting whether "locate, don't prescribe" survives a tired user at 5pm. Links the unstarted R2c smart-feed design. Evidence: V2 (register-compliant critique on a mature draft — respect or cold?). → `docs/projects/quality_remediation_synthesis.md` (R2) · `docs/projects/field_validation.md` — 🟡 · 🧠
- **Pull the Ollama / local-model adapter earlier than Phase 6?** `(open question)` — on the free tier, confidential PRDs are shipped to a provider whose terms may permit training on them, so "local-first / privacy-respecting" (Invariant 5) is currently a claim about _storage_ while every settled block leaves the machine. The local-model adapter is the only thing that makes "no-egress privacy" true; the seam is ready (`architecture.md` → _Local-app evolution path_). — 🟠 · 🧠

---

## Standing rules across all phases

1. **No fix-application affordances. Ever.** (The product principle — see `CLAUDE.md`.)
2. Observations stay within the **fixed, typed taxonomy**.
3. **No per-keystroke full-document scans;** cross-doc checks go through the claim ledger.
4. **Quiet while generating, opinionated while revising.**
5. **Local-first / privacy** — no required server, telemetry, or egress without a decision logged in this file.
