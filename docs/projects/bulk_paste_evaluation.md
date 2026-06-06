---
status: done
phases: [4]
summary: Evaluate multi-section drafts on bulk paste/import — fast-tier span checks per section plus one ledger-internal contradiction sweep — instead of the dead silence (paste) or N paid-tier-call burst (import) the section-departure model produced.
---

# Bulk-paste evaluation

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`.

**Status: `done`** (2026-06-05). Implemented and verified — unit tests (skip-contradiction + sweep emit/dedupe/dirty-check) plus browser-harness event-stream verification of a real paste (3 sections each fast-evaluated, single bootstrap sweep with one strong call, zero per-section contradiction burst, threshold gating, dirty-check skip). Completes the open `section_as_eval_unit.md` Phase 4 todo "verify paste + import workflow" — which had been ticked on the false premise that bulk paste flowed through the section-departure trigger.

The section-as-eval-unit redesign assumed users paste *section by section, moving the cursor between pastes*, so departure would fire per section. A single **bulk paste** of a whole draft is one selection jump: the cursor lands only in the last section, so every section above it went unevaluated, and the feed stayed silent until the user edited. Symmetrically, the **import** path already dispatched per-section evals *with* the strong-tier contradiction call, firing N paid invocations at once on a multi-section import — the burst the R1/OBS-020 remediation eliminated.

## Phased Plan

| Phase | Contribution |
| ----- | ------------ |
| **Phase 4 — A** | Detect bulk paste; dispatch one **fast-tier** section eval per pasted section (`skipContradiction`). De-burst import onto the same fast-only path. Span observations + ledger now populate on paste/import with zero paid-tier burst. |
| **Phase 4 — B** | Single **ledger-internal contradiction sweep** (`evaluateLedgerContradictions`) run once the pasted sections drain, gated behind the 150-word content threshold. Catches internal contradictions ("§2 vs §7") without N strong calls. |

## Todo

- [x] `skipContradiction` on `EvalContext`; guard step 6 of `evaluateSection`; thread through `orchestrator.dispatch`.
- [x] `handlePaste` + `pastePendingRef` in `Editor.tsx`; bulk-paste branch in `onUpdate` (defer a tick, dispatch all sections fast-only, early-return).
- [x] Import effect dispatches `skipContradiction: true`.
- [x] `evaluateLedgerContradictions` + `CONTRADICTION_SWEEP_SYSTEM_PROMPT`(`_HEDGED`); additive pair-keyed `reconcileSweepContradictions`; separate dirty-check key (`${docId}::sweep`).
- [x] Route the `block-paste` trigger through `handleBootstrapSweep` (drains after sections, RPM-deferred), wired from editor when `wordCount >= 150`.
- [x] Unit tests: `skipContradiction` skips the strong call; sweep emits/dedupes/dirty-checks.
- [x] `clear()` also drops the `${docId}::sweep` dirty-check key (else a re-paste of an identical draft skips the sweep).
- [x] Browser-harness verification (real paste; event-stream assertions).
- [ ] Eval-fixture for the sweep prompt under the quality ratchet. _(Deferred — follow-up; not blocking.)_

## Design

### Trigger detection
`editorProps.handlePaste` sets `pastePendingRef` and returns `false` (ProseMirror inserts normally). The next `onUpdate` sees the flag, defers one tick (so `BlockId`'s `appendTransaction` has assigned ids), resolves **all** sections, and dispatches a `block-settle-pause` per section with `ctx.skipContradiction = true`, then **returns early** so the normal single-section pause path doesn't also fire. Re-dispatching every section is safe: `evaluateSection`'s hash short-circuit no-ops unchanged sections.

### Fast vs strong split
`skipContradiction` rides on `EvalContext` → `evaluateSection` skips its per-section contradiction (step 6) only. Summary, claim extraction, and span checks (`clarity` / `unsupported_claim` / `undefined_jargon`) still run. Contradiction is recovered once, document-wide, by the sweep.

### Bootstrap sweep
`evaluateLedgerContradictions` loads the full active ledger, sorts it deterministically, and (if ≥2 claims and the ledger changed since last sweep) makes **one** `router.strong` call with an all-pairs prompt. Conflicts reference two claim indices; each side anchors to its claim's `sourceBlockId` at **whole-block** granularity (`0..9999`) — claims don't carry span offsets, matching the existing contradiction fallback. `reconcileSweepContradictions` is **additive**: it inserts only conflict-pairs not already present (order-independent `(type, blockId, conflictingBlockId)` key) and respects dismissal suppressions — so it never duplicates a per-section contradiction and is idempotent across re-runs.

### Orchestration
The `block-paste` trigger (previously a no-op stub) routes to `handleBootstrapSweep`, modeled on `handleDocIdle`: it defers until `inFlightSections` drains (the sweep must see the fully-built ledger) and under RPM backpressure. Steady-state typing is unchanged — the incremental per-section contradiction still runs on edits.

### Threshold discipline
The sweep is gated ≥150 words (`CONTENT_THRESHOLD_WORDS`) by the editor, so a short pasted draft lights up span observations but correctly stays silent on cross-document contradiction (Invariant #4 / R3.2). The user's ~102-word PRD is fully handled by Phase A alone.
