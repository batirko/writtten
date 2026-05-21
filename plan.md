# Plan

> Phased build plan. **Check the "Current phase" marker before adding functionality.** If a thing belongs to a later phase, don't build it yet — flag it instead. Scope creep is this project's primary risk. Refine phases as you learn; keep this file the source of truth for sequencing.

**Current phase: Phase 1 — "The Wow."** (Phase 0 must be done first if not already.)

---

## Phase 0 — Foundation

**Goal:** a running local-first app where the user can write and persist a document, with the plumbing the eval loop will later need — but no AI behavior yet.

Milestones:

- [ ] Project scaffolding (TypeScript, build tooling, lint/test). **Record the real install/dev/build/test/lint commands in `CLAUDE.md` once they exist.**
- [ ] TipTap editor renders; rich text editing works; Markdown-friendly schema.
- [ ] Stable per-block ids assigned and persisted across edits (ProseMirror plugin).
- [ ] Client-side persistence (IndexedDB): document saves and reloads.
- [ ] Two-panel layout shell: editor + empty sidecar feed.
- [ ] Model-router interface stubbed (`fast`/`strong`), with one cheap provider wired and a trivial test call proving the path works.

**Exit criteria:** open the app, write a multi-paragraph doc, reload, content persists; block ids are stable; a manual test call through the router returns a response.

**Out of scope:** any observations, summaries, ledger, archive, export.

---

## Phase 1 — "The Wow" (the v0 that proves the concept)

**Goal:** the single moment that justifies the product — _"it caught a contradiction I wrote and made me go fix it myself."_ Build the least machinery that lands this.

Scope is ruthless. Only:

- [ ] **Settled-block detection** (debounce + terminal punctuation + min length). Quiet while drafting.
- [ ] **Block summarization** on settle, with trivial-change short-circuit (hash diff).
- [ ] **Claim ledger** (extract → upsert/retire per block; orphan on block delete).
- [ ] **Two checks only:** `clarity` (span) and `contradiction` (against the ledger / stage).
- [ ] **Sidecar feed** rendering active observations.
- [ ] **Hover → highlight** the referenced span(s); contradiction highlights both sides.
- [ ] **Anchoring via position mapping** so highlights track text through edits.
- [ ] **Auto-close** observations resolved by an edit (incl. close when the span is deleted).
- [ ] Minimal stage definition as a plain editable field (inference comes later).

**Exit criteria (the demo script):** write a doc containing a self-contradiction; within a few seconds of the second claim settling, a `contradiction` observation appears referencing both spans; hovering highlights both; editing one side to resolve it auto-closes the observation — **and at no point did the tool offer to fix the text.**

**Explicitly out of scope:** archive UI, dismissal, the remaining observation types, document-level checks beyond contradiction, stage inference, BYO key, model tiering, export. Resist all of it.

---

## Phase 2 — Full taxonomy & lifecycle

**Goal:** turn the proof into a usable daily tool.

Milestones:

- [ ] Remaining span checks: `unsupported_claim`, `undefined_jargon`.
- [ ] Remaining doc-level checks: `missing_topic`, `underexposed_topic`, `structure_flow`, `audience_mismatch`.
- [ ] Content threshold gating for doc-level checks (warm-up curve).
- [ ] **Dismissal** + "dismissal teaches" suppression (per-doc; per-user optional).
- [ ] Full message lifecycle: `auto_closed` / `dismissed` / `superseded`.
- [ ] **Archive** UI: browsable, filterable by type and state.
- [ ] **Stage inference** with one-click confirm/edit ("Looks like a PRD for … — right?").
- [ ] Master-summary maintenance hardened.

**Exit criteria:** a PM can write a real PRD start-to-finish and the feed behaves well throughout — quiet early, useful during revision, no re-nagging on dismissed items, archive populated correctly, stage inferred sensibly.

**Out of scope:** export polish, model tiering, BYO key (basic single-provider is fine to carry from Phase 0/1).

---

## Phase 3 — Models, cost, and BYO key

**Goal:** make it cheap to run free and powerful when the user pays their own way.

Milestones:

- [ ] Model **tiering** live: cheap/fast for summaries + span checks; strong for doc-level adjudication.
- [ ] **BYO-key** flow: settings UI, local key storage, direct-from-client provider calls.
- [ ] Embedding-based **prefiltering** for the claim ledger so contradiction checks stay bounded as documents grow.
- [ ] Cost/latency instrumentation (local only) to tune debounce, thresholds, and tier routing.
- [ ] Decision point (log it here): does the free tier need a thin shared proxy, or can it stay fully client-side? Keep client-side if at all possible.

**Exit criteria:** free tier works with no key and acceptable latency/cost; adding a key visibly improves observation quality; large documents don't blow up the contradiction check.

---

## Phase 4 — Egress, install, hardening

**Goal:** make getting text out frictionless and the app pleasant to live in.

Milestones:

- [ ] Export: Markdown and PDF.
- [ ] Copy to clipboard: rich text and Markdown.
- [ ] Import / lossless round-trip of existing Markdown drafts.
- [ ] PWA: installable, offline-capable, polished empty/early states that express the "quiet by design" intent.
- [ ] Accessibility and keyboard-first polish in the feed and hover/highlight interactions.

**Exit criteria:** a user can import a draft, work in it, and export/copy clean output in all formats; the app installs and runs offline.

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
