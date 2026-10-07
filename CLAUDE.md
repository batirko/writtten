# CLAUDE.md

Agent guide for **writtten** (writtten.com). Area rules load from `.claude/rules/` when you work in those files.

## What this is

A local-first, open-source writing tool that inverts the AI-writing paradigm. The user writes everything in a rich text editor. Beside it, a live feed of AI observations reacts to the document: unclear passages, internal contradictions, unsupported claims, missing topics. The AI never writes or rewrites the user's prose. It provokes thinking; it doesn't do the thinking.

First persona: product managers writing PRDs, specs, comms, and decision docs.

## The one principle

**Provoke, don't prescribe.** The AI surfaces observations, never fixes.

- ✅ "This contradicts the success metric you set in §2." The user goes and thinks.
- ❌ "Change this sentence to: …", or an "Apply suggestion" button. The AI did the thinking.

This is the product's reason to exist and its defense against becoming Grammarly with extra steps. If a request implies the AI editing the user's text, stop and flag it against this principle.

The principle has a finer edge than "no apply button". Three failure modes look like helpfulness from the inside:

- **Anti-taxonomy:** never surface grammar, style, or surface nits.
- **Register discipline:** locate, don't prescribe; no leading questions.
- **Flattery-resistant dismissal:** muting a nit isn't silencing a true critique.

The fidelity bar is `docs/product-requirements.md`. The substantive rules are in `docs/features.md` (_Anti-taxonomy_, _Register discipline_, _Dismissal should teach_).

## Hard invariants

These hold in every phase. `docs/plan.md` points here rather than keeping its own copy.

1. **No fix-application affordances.** No apply, auto-fix, or rewrite, ever. See the principle above.
2. **Fixed observation taxonomy.** Observations come from a defined, typed list with per-type prompts, never free-form LLM chatter. See `docs/features.md`.
3. **No per-keystroke full-document scans.** Evaluation is incremental and debounced. Cross-document checks (contradiction, missing topic) run against the claim ledger, not a re-read of the whole doc. See `docs/architecture.md`.
4. **Quiet while generating, opinionated while revising.** Never critique an in-progress sentence or an under-threshold document. Silence during idea formation is a feature.
5. **Local-first and privacy-respecting.** Don't introduce a required server, telemetry, or data egress without an explicit decision logged in `docs/plan.md`.

## Scope

`docs/plan.md` holds the current phase and what's in or out of scope. Check it before adding functionality. Scope creep is this project's main risk: if something belongs to a later phase, say so and don't build it. Phase 9 and _Discovered / unscheduled_ hold parked work; don't pre-build it.

## Document map

| File                           | Read it when…                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `docs/concept.md`              | You need the why: philosophy, persona, positioning, non-goals.                                                |
| `docs/product-requirements.md` | You need the fidelity bar. Acceptance gates derive from it in `docs/acceptance-testing/fidelity-criteria.md`. |
| `docs/features.md`             | You're building UX, the observation taxonomy, message lifecycle, archive, or export.                          |
| `docs/architecture.md`         | You're building the eval pipeline, claim ledger, persistence, model router, or editor internals.              |
| `docs/plan.md`                 | You need the current phase, open milestones, or the Projects Index.                                           |
| `docs/plan-archive.md`         | You need the full record of closed Phases 0–6, or the original lane rules.                                    |
| `docs/projects/`               | You need the design spec for a feature or subsystem.                                                          |
| `docs/mechanics/`              | You're touching a built mechanic. These describe what runs, not designs.                                      |
| `docs/logs/`                   | You saw a prompt misfire or a UX issue during testing.                                                        |
| `docs/snapshots/`              | You want a point-in-time review of product quality or a test session.                                         |

Two upkeep rules:

- When a code change alters a documented mechanic, update its `docs/mechanics/` file in the same task.
- When a prompt produces a false positive, false negative, or misclassification in any test or eval, append an entry to `docs/logs/prompt_quality_observations.md`. Don't fix it inline unless the fix is trivially safe. The log accumulates until a remediation sprint drains it.

## Repo conventions

- Source in `src/`, docs in `docs/`, tests colocated as `*.test.ts`.
- Prefer small, single-purpose modules. The eval checks, model providers, and export formats are each pluggable; keep those seams clean.
- The editor is TipTap (ProseMirror), chosen for decorations and position mapping. Annotation anchoring depends on it, so read `docs/architecture.md` before proposing a swap.
- LLM access goes through the single model-router interface. It's a deliberate extension seam.
- **In docs, cite code by file plus a greppable symbol, never `file.ts:NNN`.** Write "`isSpanSuppressed` in `evaluatorAnchoring.ts`", not "`evaluator.ts:111`". A 2026-07-24 sweep found nearly all 123 line refs in live docs stale. Some pointed at the wrong file or a deleted symbol, and repointing one by number would have landed on matching but wrong code. Leave refs in `docs/plan-archive.md`, `docs/logs/`, and `docs/snapshots/` alone: those are frozen records.

## Working alongside parallel sessions

Assume another agent may be editing this repo right now. Work is often split into parallel lanes (see _Parallel work lanes (live)_ in `docs/plan.md`).

- **Work on a feature branch in your own worktree, cut from `origin/main`.** Before touching anything, run `git status`. Uncommitted changes you didn't make belong to a concurrent session. Don't branch on top of them, and don't let them into your commits. On 2026-07-09 a fix begun in the shared `main` tree carried another session's docs all the way and had to be untangled by hand.
- **Take next-number IDs from `origin/main`.** `OBS-NNN` and `UX-NNN` IDs in `docs/logs/`, and plan milestones, are "one past the last". Run `git fetch origin main` and take the next free ID from there, not from your local base. Renumber after rebase if a collision slipped through. On 2026-07-09 two sessions both created `OBS-033`.
- **Don't merge on your own initiative.** The owner's checkpoint comes before the PR. Implement, show the running feature on a dedicated port, and get an explicit "ship it". Then open the PR and merge once CI (`verify`) is green.
- **Stay inside your lane's files.** Lanes are drawn so their hub files don't overlap. The single-writer hubs are `src/sidecar/SidecarFeed.tsx`, `src/styles.css`, `src/services/evaluator.ts`, `src/services/evaluatorPrompts.ts`, `src/editor/Editor.tsx`, and `src/services/orchestrator.ts`. If your task needs another lane's hub file, the work isn't parallel-safe; flag it.
- **Keep edits to shared files small.** Several lanes touch `src/services/types.ts` and `src/styles.css`. Only one lane bumps the `db.ts` schema version at a time.
- **Rebase before you finalize**, then rerun `npm test && npm run lint && npm run build`.
- **The dev server on `:5173` is shared.** Don't assume you own it. Harness state is global, so call `window.__sidecar__.clear()` after seeding fixtures.

## Commands

`package.json` lists the scripts. The ones with non-obvious behavior:

```
npm run dev            # dev server → http://localhost:5173 (shared; see above)
npm test               # vitest run; CI also runs lint and build
npm run eval:record    # re-record LLM fixtures (live calls)
npm run live-check     # gated live harness; sources .env.test.local
npm run release:check  # lint + test + build + live-check
```

**App key.** Copy `.env.local.example` to `.env.local` and set `VITE_GEMINI_API_KEY`. It's the only key the app and dev server read. To verify a key, paste it into the Settings key field and read the field's subtitle.

**Test keys.** `.env.test.local` (copy from `.env.test.local.example`, gitignored) holds real provider keys: `OPENAI`, `ANTHROPIC`, `GEMINI_FREE`, `GEMINI_PAID`. The app doesn't read it; `scripts/live-check.sh` sources it without printing values. Use these for live sanity checks or to re-record a fixture at weak capability. `GEMINI_FREE` is the tier a keyless first-run user gets. To drive the app at the free tier, source the file, then run `VITE_GEMINI_API_KEY=$GEMINI_FREE npm run dev -- --port <NNNN> --strictPort`. Never echo key values, and leave `GEMINI_PAID` unset in that shell.
