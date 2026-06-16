---
status: idea
kind: spec
phases: [5]
summary: Build-ready spec for R3b — make the archive trustworthy by persisting each observation's original anchored text ("ghost anchor") and an explicit closure reason, then rendering both on archive cards. Two new persisted fields + a migration + capture at the five archival sites + a card render change.
---

# Archive trust — ghost anchors & closure reasons (R3b)

> **Readiness target:** take the 🟡 "Archive trust: closure context + ghost anchors (R3b)" milestone to 🟢 for a ⚙️ agent. The design intent already exists in `quality_remediation_synthesis.md` (R3) and the closure-reason honesty groundwork in `doc_scope_reconciliation.md` (T1c); this doc turns it into a concrete data-model + wiring + UI change.

## Status

**Idea — Phase 5.** Unblocked by the R3 reconciliation engine (shipped, Phase 4) and the doc-scope closure-reason honesty (`doc_scope_reconciliation.md`, done). This is the presentation layer that makes the archive answer "what was this about, and why did it close?". Read alongside:

- `docs/projects/debug_log.md` — its `ArchiveRecord` already enumerates the five status-transition sites and their `reason`/`actor` values. **Reuse that exact mapping** (this doc and that one must agree).
- `docs/projects/quality_remediation_synthesis.md` (R3 / resolves UX-002, UX-011).
- `docs/projects/doc_scope_reconciliation.md` (T1c — honest doc-scope closure reasons).

## Phased Plan

| Phase | Contributes |
| --- | --- |
| **5** | Persist `anchorText` (+ `conflictingAnchorText` for contradictions) and `closureReason` on `Observation`; capture them at create/archive time; render them on archive cards. |

## The problem (today)

Archive cards (`src/sidecar/SidecarFeed.tsx` ~L648–671) show only: the type tag, the raw `status` string, and `obs.text`. Two gaps:

1. **No ghost anchor.** The span an observation referenced is gone (resolved/edited/deleted), so the user can't recall _what_ it was about. The `Observation` stores `blockId/startOffset/endOffset` but not a snapshot of the referenced text — and the offsets are meaningless once the text changed.
2. **No honest closure reason.** `status` collapses distinct outcomes: `auto_closed` covers both "you edited the text and resolved it" and "the text was deleted", and `superseded` doesn't say by what. The user can't tell a real resolution from a ghost-archive.

## Todo

### R3b-1 — Data model + migration (`src/store/db.ts`)

- [ ] Add to the `Observation` interface:
  ```ts
  /** Snapshot of the referenced span text, captured at creation — the "ghost
   *  anchor" shown in the archive after the live span is gone. */
  anchorText?: string;
  /** For contradictions: snapshot of the conflicting span's text. */
  conflictingAnchorText?: string;
  /** Explicit closure reason, stamped at archival. Finer-grained than `status`. */
  closureReason?:
    | "resolved_by_edit"   // re-eval found the issue gone after a content edit
    | "text_removed"       // the anchored block/span was deleted
    | "superseded"         // replaced by a newer overlapping observation
    | "dismissed"          // user dismissed
    | "resolved_prior";    // model confirmed a prior issue resolved (resolved_prior path)
  ```
- [ ] Bump `DB_VERSION` 7 → 8. Add an `oldVersion < 8` migration block following the existing pattern (L160–171): backfill is **no-op for data** (old archived records simply won't have `anchorText`/`closureReason` — the UI handles their absence gracefully, see R3b-3). The version bump is still required so the schema is coherent; the migration body can be an empty cursor-less block or omitted if no store change is needed. **Confirm**: since no new object store/index is added, a `DB_VERSION` bump with no upgrade body for v8 is acceptable — verify `idb` tolerates a version bump with no matching `oldVersion <` block (it does; the upgrade callback just isn't called for the missing range). If uneasy, add an empty `if (oldVersion < 8) {}` for documentation.

### R3b-2 — Capture the data

**Anchor text at creation.** Observations are created in `src/services/evaluator.ts` (span obs carry `blockId/startOffset/endOffset`; contradictions also carry `conflicting*`). At the point each observation is constructed, slice the referenced text out of the section/block content already in hand and store it as `anchorText` (and `conflictingAnchorText`). The evaluator already has the block text for offset computation — capture the substring there.

- [ ] In `evaluator.ts`, wherever `startOffset`/`endOffset` (and `conflicting*`) are set on a new `Observation`, also set `anchorText = text.slice(startOffset, endOffset)` from the same source string used for the offsets. Keep it short (cap to ~160 chars; the goal is recognition, not full reproduction).

**Closure reason at archival.** `debug_log.md` already mapped the five transition sites — stamp `closureReason` at each, using the same vocabulary as its `ArchiveRecord.reason`:

| Transition | Site | `closureReason` |
| --- | --- | --- |
| user dismissal | `App.tsx` `handleDismissObservation` | `dismissed` |
| user collapse (aggregation) | `App.tsx` `handleObservationCollapsed` | (keeps `auto_closed`; reason `resolved_by_edit` is wrong here — use `dismissed`? **decision below**) |
| reconcile: no counterpart, span still present | `evaluator.ts` reconcile loop | `resolved_by_edit` |
| reconcile: span/block deleted | `evaluator.ts` (block-removed / span gone) | `text_removed` |
| model-confirmed prior resolved | `evaluator.ts` force-close | `resolved_prior` |
| superseded by overlapping new obs | `evaluator.ts` reconcile | `superseded` (also set `supersededBy` is not persisted today — out of scope; the debug log carries it) |

- [ ] Set `closureReason` in `updateObservationStatus` calls, or extend `updateObservationStatus(id, status, closureReason?)` to take and persist the reason (cleanest — one signature change, all sites pass the reason). Prefer extending the function so the field is written atomically with `status`.
- [ ] **Decision — the collapse case:** aggregation-collapse (`handleObservationCollapsed`) isn't a resolution; map it to `closureReason: "dismissed"` (the user folded it into the primary card) — or introduce a sixth value `collapsed`. Recommend reusing `dismissed` to keep the enum tight; the debug log already distinguishes `collapsed` for forensics, the archive card doesn't need that granularity. **Pick `dismissed` unless review says otherwise.**

### R3b-3 — Render on archive cards (`src/sidecar/SidecarFeed.tsx` ~L648–671)

- [ ] Replace the raw `status` string (L666–668) with a human closure reason derived from `obs.closureReason` (fall back to the prettified `status` when absent, for pre-v8 records):
  - `resolved_by_edit` → "resolved by edit"
  - `text_removed` → "text removed"
  - `superseded` → "superseded"
  - `dismissed` → "dismissed"
  - `resolved_prior` → "resolved"
- [ ] Below `obs.text`, when `anchorText` is present, render a quoted ghost-anchor line: a muted, italic `“{anchorText}”` (and for contradictions, show both `anchorText` and `conflictingAnchorText`). Keep it visually quiet (it's archived). Add `data-testid="archive-anchor"` and `data-testid="archive-reason"` for the harness.
- [ ] Gracefully handle absence: pre-v8 archived records (no `anchorText`/`closureReason`) render exactly as today — no empty quotes, no "undefined".

## Notes / non-goals

- `supersededBy` linkage in the UI ("replaced by →") is **out of scope** — it needs the new observation's id persisted on the old record; the debug log already captures it for forensics. Keep this milestone to ghost anchor + reason.
- No change to reconciliation _logic_ — R3 already decides _when_ to archive; this only records _what/why_ and shows it.

## Verification

1. Unit (`evaluator.test.ts` / a new case): create a span observation, assert `anchorText` equals the referenced substring; drive a reconcile that resolves it, assert `closureReason: "resolved_by_edit"`; delete the block, assert `text_removed`.
2. Migration: open an existing v7 DB (seed via harness), bump to v8, confirm old archived records load without error and render in the old style.
3. Preview: type a contradiction, edit one side to resolve it, open the archive — the card shows "resolved by edit" and the quoted ghost anchor of both spans.
