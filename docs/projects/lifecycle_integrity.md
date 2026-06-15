---
status: in-progress
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

- [x] Added a dedicated `tsconfig.test.json` (includes `src` + `vitest.record.config.ts`, `types: ["node", "jsdom"]`) referenced from the root `tsconfig.json`, and excluded `*.test.ts`/`*.test.tsx` from `tsconfig.app.json`. Installed `@types/node` + `@types/jsdom`. (2026-06-13)
- [x] Fixed `vite.config.ts` — imports `defineConfig` from `vitest/config`. (2026-06-13)
- [x] Removed the duplicate `blockId` key in `src/services/evaluator.test.ts` (the shorthand `blockId` after the explicit `blockId: "block1"`). (2026-06-13)
- [x] Cleared all 31 lint errors: `@typescript-eslint/no-unused-vars` set with `ignoreRestSiblings: true` for the destructure-to-omit idiom (`debugLog.ts:216`, `logger.ts:525`); `no-explicit-any` turned off for `**/*.test.{ts,tsx}` only (DOM/mock casts — tsc still type-checks them); the two production `any` casts given precise types (`harness.ts` → `LLMLogEntry["type"]`, `debugLog.ts` → `as unknown as Record<string, unknown>`). The idb-seal rules are untouched. (2026-06-13)
- [x] Side fix required for green CI: the Projects Index in `plan.md` used bare names; `projects.index.test.ts` (24 failures, pre-existing on `main`) requires markdown links — converted all 22 rows to `[name](projects/name.md)`. (2026-06-13)
- [x] Added `.github/workflows/ci.yml` running `npm ci` → lint → build → test on push to `main` + all PRs (Node 20). Build is green: `dist/` produced incl. PWA `sw.js`/manifest. (2026-06-13)

### L2 — Fix dead auto-close-on-deletion — 🟢 Low · 🔧 (audit #2)

- [x] `src/editor/extensions/ObservationHighlighter.ts` — passed `{ "data-obs-id": obs.id }` as the 4th (`spec`) argument to both `Decoration.inline` calls (primary span + cross-claim conflicting span). The collapse detector reads the id off `spec`, so `hasDeco`/`wasDecoBefore` now resolve correctly and `onObservationCollapsed` fires on deletion. (2026-06-13)
- [x] Added a collapse-path test (`ObservationHighlighter.test.ts`, jsdom): registers an active span observation, deletes the highlighted span, asserts `onObservationCollapsed` fires with the obs id; plus a negative test that an unrelated edit leaving the span intact does **not** fire. (2026-06-13)
- [x] Reconciled the doc claim: `docs/projects/message_generation_workflow.md:138` now annotated as wired-and-previously-dead. The fix makes the "mandatory" claim true in practice. (2026-06-13)

### L3 — Fix the eval-wedge under strong-call failure — ✅ done (audit #3)

> **Re-verified 2026-06-14: the wedge was real on current `main`.** `saveBlockSummary` with the dirty-check `hash` ran at `evaluator.ts:705`, *before* the strong contradiction call (`:805`) and `reconcileObservations` (`:902`), with a terminal `catch` (`:903`) that only `console.error`s. A thrown `router.strong()` skipped reconcile but left the hash saved, so the next eval short-circuited on the hash match (`:615`) — section wedged until its text changed.

- [x] **Fixed via option (b): atomic dirty-check.** Moved the `saveBlockSummary` hash write to *after* `reconcileObservations` (both the main path and the empty-section path). `saveClaimsForBlock` stays before the contradiction call (the ledger read needs it). On a strong-call failure the hash is now never committed, so the next trigger re-runs the whole eval; existing observations are left untouched (reconcile is skipped, not run with partial data). (2026-06-14)
- [x] **Rejected option (a)** (reconcile fast obs on strong-failure): the reconcile orphan pass (`:280–289`) auto-closes any existing observation on the section's blocks not present in the new set, so reconciling a fast-only batch would *falsely auto-close a still-valid contradiction* (absent only because the strong call failed). Documented as an invariant test.
- [x] Added three failure tests (`evaluator.test.ts`, "eval-wedge under strong-call failure (L3)"): (1) strong throws → hash not committed + nothing written (verified to **fail** against pre-fix code — real regression guard); (2) on success the hash is committed *after* the observation write (invocation-order assertion); (3) strong throws → an existing contradiction is not auto-closed. (2026-06-14)
- [x] Updated the mechanic doc (`docs/mechanics/evaluation-triggers.md` → `evaluateSection` steps) to document the commit-hash-last atomicity. (2026-06-14)

### L4 — Fix the block-removal race (zombie claims) — ✅ done (audit #4)

> **Re-verified 2026-06-14: the race was real.** `handleBlockRemoved` cancelled coalesce timers + queued re-runs and orphaned claims/deleted the summary, but never invalidated an **in-flight** `evaluateSection`. A late LLM response then re-inserted `active` claims (`saveClaimsForBlock`) and recreated the summary for the removed block — and `loadActiveClaimsForDocument` has no liveness filter beyond `status`, so those zombies fed every future contradiction check, prefilter, glossary, and doc-level review until Clear Workspace.

- [x] **Eval-generation token.** `orchestrator.ts` keeps `sectionEvalGeneration: Map<sectionId, number>`. `handleBlockRemoved` calls `bumpSectionGeneration(blockId)` (first line, synchronous). `dispatch` captures the generation at start and passes an `isLive: () => generation.get(sectionId) === captured` predicate into `evaluateSection`. (2026-06-14)
- [x] **Liveness checkpoints in `evaluateSection`.** `isLive` is checked at two points that bracket the network waits — after `router.fast` (before `saveClaimsForBlock`) and after `router.strong` (before `reconcileObservations` + the summary/hash write) — plus the empty-section path. If stale → return without writing. New trailing optional param, defaults to always-live (so `evaluateBlock` + existing callers/tests are unaffected). (2026-06-14)
- [x] **Did not cancel the in-flight `fetch`.** Invalidating the *writes* fully fixes the zombie-claim correctness bug; fetch cancellation (threading an `AbortSignal` through the router into `gemini.ts`) is only a quota optimisation and is left as a noted follow-up.
- [x] Added the race tests: `orchestrator.test.ts` (new file — first orchestrator test; proves `block-removed` flips the in-flight section's `isLive` to false, and that an unrelated removal does not) and three `evaluator.test.ts` liveness-guard tests (removed during fast call → no writes; removed during strong call → no reconcile/summary; happy path still writes). All regression-verified by neutralising the fix. (2026-06-14)
- [x] Updated `docs/mechanics/evaluation-triggers.md` (`block-removed` cascade + `evaluateSection`) to document the generation guard.

### L5 — Make `anchorText` load-bearing — 🟡 High · 🧠 (audit #5, #6, #7)

> Shipping as three sequenced PRs: **5a** suppression matching, **5b** highlight re-anchoring, **5c** per-section conflict-identity dedupe. (L6 — the `evaluator.ts` split — follows L5 as a separate pure refactor, by decision 2026-06-14.)

- [x] **5a — Match suppressions by anchor text (offset fallback).** `DismissalSuppression` gained `anchorText` / `conflictingAnchorText` / `conflictPairKey` (DB v8→v9, no-backfill migration). `handleDismissObservation` (`App.tsx`) stores them; `isSpanSuppressed` (`evaluator.ts`) now matches span obs on `(blockId + normalizeText(anchorText))` and conflicts on the exported `conflictPairKey` — both with the offset `spanSignature` as fallback. G1 span-only-vs-category gate preserved byte-for-byte. So a dismissal holds when edits shift offsets, and a dismissed per-section contradiction also suppresses the ledger-sweep's whole-block (`0:9999`) re-emission of the same pair. `conflictPairKey` is now exported (single source). +4 tests, regression-verified. (2026-06-14)
- [x] **5c — Unify per-section conflict identity on `conflictPairKey`.** `reconcileObservations` now dedupes `contradiction`/`strategic_tension` by `conflictPairKey` (a dedicated branch before the `contentSig`/`spanSig` path, which is untouched for non-conflict types). A per-section emission and the ledger sweep's re-emission of the same block pair coalesce into one card; a reworded re-emission keeps the existing record (id + wording frozen, sweep grace state preserved) instead of churning via supersede+insert. Auto-close of an unmatched conflict is unchanged (regression-watch test). +3 tests, the two new-behavior ones regression-verified. (2026-06-14)

**L5 complete (5a + 5b + 5c).** `anchorText` is now load-bearing for suppression matching and highlight re-anchoring, and conflict identity is unified on `conflictPairKey` across the per-section and sweep paths.
- [x] **5b — Re-anchor highlights by `anchorText` on rebuild.** Added a pure `reanchorOffset(blockText, anchorText, storedStart, storedEnd)` helper in `ObservationHighlighter.ts` and wired it into the `setObservations` rebuild for both the primary and conflicting spans. It re-derives offsets from `anchorText` against the block's current flat text (nearest-to-stored on repeats; falls back to stored offsets on no-match/empty-anchor; passes `0:9999` sentinels through untouched). The live-typing `tr.mapping` path is unchanged. So a refresh-driven rebuild no longer redraws a highlight at stale offsets after the user edited earlier in the block. +6 tests (incl. a DOM-level assertion that the highlight lands on the anchor span), regression-verified. (2026-06-14)
- [x] Coordinated with `archive_trust.md` (R3b) on the `anchorText`/`conflictingAnchorText` contract — both read the field; 5a makes it authoritative for matching and never mutates it after creation.

### L6 — Split `evaluator.ts` (enabling refactor) — ✅ done (audit #8, 2026-06-15)

- [x] Extracted the 1,433-line god-module into three focused modules along the seam `docReconcile.ts` already proved:
  - `evaluatorPrompts.ts` — all LLM prompt strings + `parseJSONResponse` + `isDocumentMetaClaim` (pure, no side effects)
  - `evaluatorAnchoring.ts` — anchoring helpers, identity functions (`hashCode`, `conflictPairKey`, `anchorSubstring`, etc.), and `NewObservation` type (pure)
  - `evaluatorReconcile.ts` — the reconciliation functions that interleave DB awaits (`reconcileObservations`, `reconcileDocumentObservations`, `reconcileSweepContradictions`); imports only from the two pure modules above
  - `evaluator.ts` rewritten to import from all three and re-export the full prior public API — zero consumer changes required (App.tsx, orchestrator.ts, test files all unchanged). 
- [x] Dead `closureReason` branch removed: the `"text_removed"` unreachable branch in `reconcileObservations` simplified to `"resolved_by_edit"` (the `existing` array is pre-filtered to `memberBlockIds`).
- [x] No behavior change: 393 tests pass, lint clean, build green.

### L7 — Close the prod prompt-leak — ✅ done (audit #9)

- [x] **Default debug panel off.** Changed `useState(true)` → `useState(false)` for `debugMode` in `SidecarFeed.tsx`. +1 regression test (neutralized and confirmed red). (2026-06-15)
- [x] **DEV-gate the panel UI.** Wrapped the "Enable LLM Debug Mode" settings checkbox and the debug panel render (`className="debug-panel"`) with `import.meta.env.DEV &&` — Vite DCEs both in production so no user can access the prompt log. (2026-06-15)
- [x] **Removed the harness top-level side effect.** `harness.ts` had `llmLogger.setEventSyncHook(...)` at module level, which forced the harness module into the prod bundle even though all call sites were already DEV-gated. Wrapped in `if (import.meta.env.DEV)` — the hook now only wires in development. (2026-06-15)
- [x] **Re-verified harness/call-site gating.** All `harness.emit()` and `harness.archive()` calls in `evaluator.ts`, `db.ts`, `orchestrator.ts`, `App.tsx`, and `Editor.tsx` were confirmed already wrapped in `if (import.meta.env.DEV)` guards. The remaining prod bundle footprint (the static `import { harness }` in each file and the `new Harness()` singleton) is inert — `window.__sidecar__` is never attached in prod, events accumulate in a bounded in-memory ring buffer with no external egress. Full DCE would require switching to dynamic imports across all callers; noted as future work. (2026-06-15)

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
