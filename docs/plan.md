# Plan

> Phased build plan. **Check the "Current phase" marker before adding functionality.** If a thing belongs to a later phase, don't build it yet — flag it instead. Scope creep is this project's primary risk. Refine phases as you learn; keep this file the source of truth for sequencing.

**Current phase: Phase 4 — "Egress, install, hardening."** (Phase 1 fully verified 2026-06-01. Phase 2 fully implemented 2026-06-02. Phase 3 fully implemented 2026-06-02.)

---

## Projects index

> **Completeness contract:** every file in `docs/projects/` appears in this table — if it isn't listed here, it doesn't exist. When you create a project file you **must** add a row here (minimum); if it's scoped to specific phases, **also** add `→ see` links on those milestone lines below (maximum). Status is the file's frontmatter `status:` field, mirrored here — never encoded in the filename. `docs/projects.index.test.ts` enforces folder ↔ table ↔ frontmatter consistency.

| Project                      | Status      | Phases            | One-line                                                                                                                                  |
| ---------------------------- | ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [message_generation_workflow](projects/message_generation_workflow.md) | done | 1 ✅ · 2 ✅ · 3 ✅   | The contract between editor, evaluator, model router, and feed — when observations fire, what context the LLM sees, how the feed behaves. |
| [model_rotation_and_debugging](projects/model_rotation_and_debugging.md) | done | 1 ✅ · 3 ✅ (Ollama skipped) | Gemini free-tier rate-limit resiliency: call batching, model rotation, cool-down registry, LLM debug panel.                               |
| [ai_tooling_integration](projects/ai_tooling_integration.md) | idea | 2 · 3 (LEANN deferred) · 4 | SkillOpt, LEANN, and markitdown — when to adopt, what each needs, and how each maps to a specific phase milestone. |
| [agent_acceptance_harness](projects/agent_acceptance_harness.md) | done | 1 · 2 | Dev-only observability + control surface (debug state API, structured event stream, readiness signal, seedable state, mock LLM) so an agent can drive and verify acceptance tests deterministically. |

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

## Phase 4 — Egress, install, hardening

**Goal:** make getting text out frictionless and the app pleasant to live in.

Milestones:

- [ ] Export: Markdown and PDF.
- [ ] Copy to clipboard: rich text and Markdown.
- [ ] Import / lossless round-trip of existing Markdown drafts. → see `docs/projects/ai_tooling_integration.md` (markitdown for binary-format import; decision point: path choice logged before writing code)
- [ ] PWA: installable, offline-capable, polished empty/early states that express the "quiet by design" intent.
- [ ] Accessibility and keyboard-first polish in the feed and hover/highlight interactions.

**Exit criteria:** a user can import a draft, work in it, and export/copy clean output in all formats; the app installs and runs offline.

**Harness exit criterion:** [ ] `data-testid` on export/copy affordances and PWA install prompt; `loadDoc` accepts Markdown string as an alternative to the block-array fixture so import round-trips are testable without typing. → `docs/projects/agent_acceptance_harness.md`

---

## Phase 5 — Later / optional (post-traction)

Only if the drafting habit has taken hold. Don't pre-build any of this.

- Living _where users already write_ (Notion / Linear / Confluence / email) instead of being a drafting annex — the real long-term play, per `docs/concept.md`.
- Documented **extension API** for the three seams (observation types, model providers, export formats) to invite OSS contribution.
- Optional Tauri desktop wrapper.
- Lightweight monetization exploration (hosted convenience / managed model access on an OSS core) — only if traction warrants it.

---

## Standing rules across all phases

1. **No fix-application affordances. Ever.** (The product principle — see `CLAUDE.md`.)
2. Observations stay within the **fixed, typed taxonomy**.
3. **No per-keystroke full-document scans;** cross-doc checks go through the claim ledger.
4. **Quiet while generating, opinionated while revising.**
5. **Local-first / privacy** — no required server, telemetry, or egress without a decision logged in this file.
