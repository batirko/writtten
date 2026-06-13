---
status: idea
phases: [5]
summary: The code-correctness hardening cluster from the 2026-06-10 code-architecture audit — repair the broken build/lint gates and add CI, then close the three silent-failure paths in the observation lifecycle (dead auto-close-on-deletion, the strong-call eval-wedge, the block-removal zombie-claim race) and make `anchorText` actually load-bearing so dismissals hold and highlights stay truthful through edits.
---

# Lifecycle integrity — gates, feed-correctness, and load-bearing anchoring

> **Readiness target:** turn the 2026-06-10 code-architecture audit (`docs/snapshots/2026-06-10_code_architecture_audit.md`) into scheduled, build-ready work. This is the **immediate hardening sprint** — it sequences **ahead of** the remaining Phase 5 UX-polish milestones, because the repo can't currently produce a shippable artifact and the feed can be silently wrong, which is the one thing the product's trust proposition can't afford.

## Status

**Idea — Phase 5 (immediate hardening sprint).** The audit ran the project's own gates and read `src/` directly; every finding below cites `file:line` and was re-verified against the tree on 2026-06-13 (gates still broken; findings 2, 4, 5, 6, 7, 9 still hold; finding 3 ambiguous — see L3). This file owns the **code-correctness** half of the audit; the strategic/product half lives in `docs/projects/field_validation.md`.

Read alongside:

- `docs/snapshots/2026-06-10_code_architecture_audit.md` — the source findings (this file's L-IDs map to the audit's numbered findings).
- `docs/projects/quality_remediation_synthesis.md` — R3 (reconciliation/lifecycle engine) is the design context for L3–L5; this file is the correctness layer beneath it.
- `docs/projects/archive_trust.md` — R3b already adds `anchorText`/`closureReason` to the schema and renders them; **L5 makes that same `anchorText` load-bearing for matching**, not just display. Coordinate so the two don't fight over the field's contract.
- `docs/projects/doc_scope_reconciliation.md` — the doc-scope reconciler is the proven seam (`docReconcile.ts`) the L6 split should follow.
- `docs/architecture.md` (_Anchoring & position mapping_, invariant 1 the idb seal) — the invariants L1/L5 must keep true.

## Phased Plan

| Phase | Contributes |
| --- | --- |
| **5** | **L1** repair gates + add CI. **L2–L4** the "feed is silently wrong" cluster (dead auto-close, eval-wedge, block-removal race), landed as one unit. **L5** `anchorText` load-bearing (dismissals hold, highlights stay truthful). **L6** split `evaluator.ts` along the `docReconcile.ts` seam so the lifecycle fixes are reviewable and don't risk each other. **L7** close the prod prompt-leak. **L8** editor hot-path perf (lower priority). |

## The problem (today)

The audit's one-line verdict: *"a promising prototype with unusually good architectural instincts, carrying a cluster of correctness debt exactly where the product can least afford it."* Two compounding facts:

1. **The gates are rotten and nothing notices.** `npm run build` exits 1 and `npm run lint` fails with 31 errors, with **no CI**. So the PWA/export/accessibility milestones marked `[x]` in Phase 5 are **unverifiable in `dist/`** — the ship path is dead and rots invisibly while tests stay green.
2. **The observation lifecycle — the product's trust currency — has three independent silent-failure paths.** The feed can show stale, missing, or zombie observations with no error anywhere, and the affected modules (orchestrator, Editor, db, the lifecycle paths in evaluator) have **zero tests**. A feed that silently disagrees with the document is read by the user as "this section is fine" — the precise failure the product can't afford.

## Todo

### L1 — Repair gates + add CI — 🟢 Low–Med · 🔧 (audit #1, #10)

- [ ] Stop the build pulling in test files: exclude `*.test.ts` from `tsconfig.app.json`, **or** add a dedicated test tsconfig + `@types/node`/`@types/jsdom` devDeps (the build errors are `node:fs`/`process`/`global`/`jsdom` untyped in test files).
- [ ] Fix `vite.config.ts:30` — import `defineConfig` from `vitest/config` (not `vite`) so the `test` key type-checks (`TS2769`).
- [ ] Remove the duplicate `blockId` key in `src/services/evaluator.test.ts:166–178` (`TS1117` — the second silently wins; type-strip hides it today).
- [ ] Clear the 31 lint errors (`as any` / unused destructures in `src/model/debugLog.ts:216`, `src/model/logger.ts:525`, etc.). The lint rules are meaningful (they enforce the idb seal) — fix the code, not the rules.
- [ ] Add a minimal `.github/workflows/ci.yml` running `npm ci && npm run build && npm test && npm run lint` on push/PR. *This is the keystone — everything else is unverifiable in `dist/` until build is green again.*

### L2 — Fix dead auto-close-on-deletion — 🟢 Low · 🔧 (audit #2)

- [ ] `src/editor/extensions/ObservationHighlighter.ts:127–131` — `Decoration.inline(start, end, attrs)` lands `data-obs-id` in **`attrs`**, but the collapse detector at `:195–209` reads it off **`spec`** (which defaults to `noSpec`/`{}` when the 4th arg is omitted). So `hasDeco`/`wasDecoBefore` are always false, `onObservationCollapsed` never fires, and `App.tsx:205`'s handler is unreachable. **Fix: pass `{ "data-obs-id": obs.id }` as the 4th (`spec`) argument too.**
- [ ] Add a collapse-path test (the file currently tests only `charOffsetToPmPos`, which is how this shipped): select a highlighted span, delete it, assert `onObservationCollapsed` fires and the card closes without waiting for a re-eval.
- [ ] Reconcile the doc claim once fixed: `docs/projects/message_generation_workflow.md:138` "Auto-close on collapse is mandatory" is currently false-in-practice.

### L3 — Fix the eval-wedge under strong-call failure — 🟡 Med · 🧠 (audit #3)

> **Re-verify before fixing.** The audit found the dirty-check hash persisted (`evaluator.ts` `saveBlockSummary` with `hash`, ~:703) *before* the strong contradiction call (~:803) and `reconcileObservations` (~:900), with a terminal `catch` (~:901–903) that only `console.error`s. A 2026-06-13 spot-check found the same structure (hash saved early, terminal catch) — so this likely **still holds** despite a sub-agent labeling it fixed. Confirm against the current line numbers first.

- [ ] If confirmed: a failed `router.strong()` (e.g. `Pool exhausted (free)` — routine on the 20-RPD free tier) skips reconciliation, but the hash is already saved, so the next eval short-circuits on the hash match (~:612–615) and the fast-call observations are lost / stale ones never close — **permanently, until the section's text changes**. Fix by either (a) reconciling the fast-call observations even when the strong call throws, or (b) moving the `saveBlockSummary` hash write to *after* reconciliation so a failure doesn't poison the dirty-check.
- [ ] Add an orchestrator/failure test: stub `router.strong` to throw, assert fast-call observations still reconcile and the section isn't wedged on the next idle.

### L4 — Fix the block-removal race (zombie claims) — 🟡 Med · 🧠 (audit #4)

- [ ] `src/services/orchestrator.ts:106–153` (`handleBlockRemoved`) cancels coalesce timers + queued re-runs and orphans claims/deletes the summary, but never cancels or invalidates an **in-flight** `evaluateSection` (`inFlightSections` is untouched). When the LLM response lands seconds later, `saveClaimsForBlock`/`saveBlockSummary` (~:703–704) re-insert `active` claims and recreate the summary for a block that no longer exists. Trigger: paste a section, wait for `request`, select-all-delete before the response.
- [ ] Add a liveness/generation guard (eval-generation token or tombstone check) before the post-LLM writes so a removed section can't resurrect claims; cancel/invalidate the in-flight `evaluateSection`. Note `loadActiveClaimsForDocument` has no liveness filter beyond `status`, so phantom claims feed every future contradiction check, prefilter, glossary, and doc-level review until Clear Workspace.
- [ ] Add a race test driving remove-during-in-flight.

### L5 — Make `anchorText` load-bearing — 🟡 High · 🧠 (audit #5, #6, #7)

- [ ] Re-anchor observations and **match suppressions by anchor text** (with offset fallback) instead of raw offsets. Today suppression is keyed `blockId:startOffset:endOffset` (`App.tsx:174–177`; `isSpanSuppressed` `evaluator.ts:162–184`), but any edit that shifts offsets — or the bootstrap sweep that anchors the same logical conflict at `0:9999` — makes a dismissed card resurface ("I dismissed this and it came back" is the fastest way to lose trust). `anchorText` exists for exactly this (`db.ts:72`) but is never consulted outside display.
- [ ] Unify sweep vs per-section conflict identity on `conflictPairKey` so a dismissed per-section contradiction and the sweep's re-emission of the same conflict share a suppression signature.
- [ ] Stop rebuilding highlights from stale stored offsets on every refresh: `ObservationHighlighter.ts` correctly `map()`s decorations between meta updates, but `refreshObservations` (`App.tsx:135–140`) fires on every eval and rebuilds **all** decorations from `obs.startOffset/endOffset` as stored at eval time — so a highlight visibly jumps if the user typed earlier in the block. Re-anchor by `anchorText` (offset fallback) on rebuild.
- [ ] Coordinate with `archive_trust.md` (R3b) on the `anchorText`/`conflictingAnchorText` contract — both read the field; this milestone makes it authoritative for matching.

### L6 — Split `evaluator.ts` (enabling refactor) — 🟢 Med · ⚙️ (audit #8)

- [ ] Extract the 1,331-line god-module into `prompts.ts` / `anchoring.ts` / `reconcile.ts` along the seam `docReconcile.ts` already proved (pure planner, injected similarity, well-tested). The in-file reconcilers interleave DB awaits with decision logic, which is exactly why L3's ordering bug wasn't visible. Do this **alongside** L3–L5 so each fix lands in a reviewable unit, not on top of the others.
- [ ] Sweep minor rot while splitting: dead `closureReason` branch (~:283, `text_removed` unreachable because `existing` is pre-filtered to member blocks), the `9999` end-offset sentinel, 32-bit `hashCode` dirty-checks (a collision silently skips an eval).

### L7 — Close the prod prompt-leak — 🟢 Low · 🔧 (audit #9)

- [ ] Default the LLM debug panel **off** — `src/sidecar/SidecarFeed.tsx:221` is `useState(true)`, so production users get a panel showing full prompts (their document text) by default.
- [ ] DEV-gate `llmLogger` so the panel/log can't ship enabled. Re-verify the "harness stripped from production builds" claim once L1 makes `dist/` buildable — the harness module has a top-level side effect (`harness.ts:302`) and a circular import with `db.ts`, so today only its call sites are DCE'd, not the module.

### L8 — Editor hot-path perf — 🟠 Med · ⚙️ (audit #10)

- [ ] Profile first. Every `onUpdate` runs `getBlockIds` + `getWordCount` + `emitBlockOrderIfChanged` + `resolveSection` → `resolveSections`, which materializes `combinedText` for **every section** (`src/editor/section.ts:71–80`) per keystroke; `onSelectionUpdate` does another full resolve. The LLM-side "no full-document scan" invariant holds; this is CPU-side and degrades on long docs. Also: `refreshObservations` full-table scans after every eval; the archive list is unbounded/unvirtualized.
- [ ] Lower priority than L1–L5 — schedule only if dogfooding shows real lag.

## Notes / non-goals

- This file **schedules** the fixes; it does not perform them. Each L-ID is a follow-up session's unit of work.
- No product-behavior changes — these are correctness and tooling fixes. The lifecycle *design* (when to archive/supersede) is owned by R3 in `quality_remediation_synthesis.md`; this is the correctness floor beneath it.
- L2–L4 should land as **one PR/unit** (the audit's recommendation) with their tests, since they're the same "feed silently wrong" failure surface and share the orchestrator/evaluator paths.

## Verification

1. **Gates (L1):** `npm run build` exits 0 and produces `dist/`; `npm run lint` clean; CI runs build+test+lint on PR. Confirm the harness is actually absent from `dist/` (now that it builds).
2. **Lifecycle (L2–L4):** new collapse-path, strong-call-failure, and remove-during-in-flight tests, each red before the fix and green after.
3. **Anchoring (L5):** a test that dismisses a per-section contradiction, then triggers the sweep, and asserts it does **not** resurface; an edit-then-refresh test asserting the highlight tracks `anchorText`, not the stale offset.
4. **No regressions:** full `npm test` green, including the eval ratchet and the `projects.index.test.ts` row added for this file.
