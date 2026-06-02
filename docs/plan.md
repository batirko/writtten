# Plan

> Phased build plan. **Check the "Current phase" marker before adding functionality.** If a thing belongs to a later phase, don't build it yet — flag it instead. Scope creep is this project's primary risk. Refine phases as you learn; keep this file the source of truth for sequencing.

**Current phase: Phase 2 — "Full taxonomy & lifecycle."** (Phase 1 fully verified 2026-06-01.)

---

## Projects index

> **Completeness contract:** every file in `docs/projects/` appears in this table — if it isn't listed here, it doesn't exist. When you create a project file you **must** add a row here (minimum); if it's scoped to specific phases, **also** add `→ see` links on those milestone lines below (maximum). Status is the file's frontmatter `status:` field, mirrored here — never encoded in the filename. `docs/projects.index.test.ts` enforces folder ↔ table ↔ frontmatter consistency.

| Project                      | Status      | Phases            | One-line                                                                                                                                  |
| ---------------------------- | ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [message_generation_workflow](projects/message_generation_workflow.md) | in-progress | 1 ✅ · 2 · 3       | The contract between editor, evaluator, model router, and feed — when observations fire, what context the LLM sees, how the feed behaves. |
| [model_rotation_and_debugging](projects/model_rotation_and_debugging.md) | in-progress | 1 ✅ · 3 (partial) | Gemini free-tier rate-limit resiliency: call batching, model rotation, cool-down registry, LLM debug panel.                               |
| [ai_tooling_integration](projects/ai_tooling_integration.md) | idea | 2 · 3 · 4 | SkillOpt, LEANN, and markitdown — when to adopt, what each needs, and how each maps to a specific phase milestone. |
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

- [ ] Remaining span checks: `unsupported_claim`, `undefined_jargon`.
- [ ] Remaining doc-level checks: `missing_topic`, `underexposed_topic`, `structure_flow`, `audience_mismatch`.
- [ ] Content threshold gating for doc-level checks (warm-up curve). → see `docs/projects/message_generation_workflow.md`
- [ ] **Dismissal** + "dismissal teaches" suppression (per-doc; per-user optional). → see `docs/projects/message_generation_workflow.md`
- [ ] Full message lifecycle: `auto_closed` / `dismissed` / `superseded`. → see `docs/projects/message_generation_workflow.md`
- [ ] **Archive** UI: browsable, filterable by type and state.
- [ ] **Stage inference** with one-click confirm/edit ("Looks like a PRD for … — right?"). → see `docs/projects/message_generation_workflow.md` (stage-changed trigger)
- [ ] Master-summary maintenance hardened. → see `docs/projects/message_generation_workflow.md`

**Exit criteria:** a PM can write a real PRD start-to-finish and the feed behaves well throughout — quiet early, useful during revision, no re-nagging on dismissed items, archive populated correctly, stage inferred sensibly.

**Harness exit criterion:** [ ] `getState()` updated for new observation types (`unsupported_claim`, `undefined_jargon`, doc-level checks); dismissal/suppression records seedable via `loadLedger` or a new `loadSuppressions` fixture; mock-mode contradiction determinism fixed (stable claim index in prompt); `data-testid` added to archive UI and dismissal affordances. → `docs/projects/agent_acceptance_harness.md`

**Out of scope:** export polish, model tiering, BYO key (basic single-provider is fine to carry from Phase 0/1).

---

## Phase 3 — Models, cost, and BYO key

**Goal:** make it cheap to run free and powerful when the user pays their own way.

Milestones:

- [ ] Model **tiering** live: cheap/fast for summaries + span checks; strong for doc-level adjudication. → see `docs/projects/model_rotation_and_debugging.md`
- [x] **Rate limit resiliency**: rotation pools, cool-down registry, LLM debug panel (Ollama offline fallback skipped for now). → see `docs/projects/model_rotation_and_debugging.md`
- [ ] **BYO-key** flow: settings UI, local key storage, direct-from-client provider calls.
- [ ] Embedding-based **prefiltering** for the claim ledger so contradiction checks stay bounded as documents grow. → see `docs/projects/message_generation_workflow.md` · `docs/projects/ai_tooling_integration.md` (LEANN as candidate engine)
- [ ] Cost/latency instrumentation (local only) to tune debounce, thresholds, and tier routing. → see `docs/projects/message_generation_workflow.md` (orchestrator queue)
- [ ] Decision point (log it here): does the free tier need a thin shared proxy, or can it stay fully client-side? Keep client-side if at all possible.

**Exit criteria:** free tier works with no key and acceptable latency/cost; adding a key visibly improves observation quality; large documents don't blow up the contradiction check.

**Harness exit criterion:** [ ] Mock-mode covers the embedding-prefilter path (ledger slice fixture); `data-testid` on BYO-key settings UI; cost/latency instrumentation fields surfaced in `getState()` or event stream if needed for perf acceptance tests. → `docs/projects/agent_acceptance_harness.md`

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
