---
status: idea
kind: spec
phases: [6]
summary: Make document-scoped (unanchored) observations legible as such in the feed — a card-intrinsic scope marker plus honest affordances (drop the click-to-locate / hover-to-highlight that silently no-ops on a card with no span). Repairs the lost UX-008 "Whole document" treatment; complements (does not reopen) the dropped R4 doc-level anchoring.
---

# Document-scope legibility — signal what has no string to point at

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — direction decided 2026-07-09, marker form pending Hallmark + prototype.** Phase 6 (experience & signal quality). The _what_ is settled interactively (see § Decided direction); the _how it looks_ is an open design task to be run through the Hallmark skill and signed off as a rendered prototype **before** any `src/` visual edit (per the repo's prototype-before-commit gate). No new observation type, no prompt change — this is a pure feed-UX legibility fix.

## The problem

Observations carry a first-class `scope` field — `"span" | "document"` (`src/store/db.ts:66`). Span observations point at a specific string; document observations are about the doc as a whole (`missing_topic`, `structure_flow`, `audience_mismatch`, and `underexposed_topic` when it fires doc-wide). `scope` already drives two things behind the scenes:

- **Editor highlighting** — the highlighter only paints `scope === "span"` (`src/editor/extensions/ObservationHighlighter.ts:141`). Hovering a doc-scoped card highlights **nothing**.
- **Feed positioning** — unanchored doc-scoped notes are pinned to the bottom of their band, with high-priority ones lifted into the "Key issues" band (`src/sidecar/feedBudget.ts`; the band structure is the UX-015 work, `plan.md`).

But **the card itself is scope-blind.** `src/sidecar/SidecarFeed.tsx` never references `scope`: a `missing_topic` card renders the exact same chrome as a `clarity` card, and — this is the crux — it keeps every interactive affordance a span card has (`SidecarFeed.tsx:148–165`):

- `onHover` → tries to highlight a span → **no-op** for doc scope.
- `onClick` → `obs-card-activate` → scroll-to-and-pulse the span → **no-op** for doc scope.

So a document-scoped card **invites the user to "find where this is" and then silently does nothing.** That is worse than a missing label — it is a dead affordance that quietly teaches the user the feed is flaky. The only accidental tell today is the absence of the `card-anchor` quote line (`SidecarFeed.tsx:204`), which is indistinguishable from "this card just has a short body."

### It's also a regression

`docs/plan.md` records UX-008 (shipped #49) as having given doc-scope cards a **"Whole document"** treatment in the anchor slot. That string exists **nowhere in `src/` today** — it was dropped in the #46 companion-surface rebuild. So part of this work is restoring a signal that once existed, done properly this time.

### The dual-scope constraint

`underexposed_topic` is dual-scope (`span / document`). The same _type_ can be anchored or not, so the signal **must key off the `scope` field, not the type**. "Style these three types differently" is wrong; "style `scope === 'document'` differently" is right.

## Decided direction (2026-07-09)

Settled interactively with the owner:

1. **Card-intrinsic marker (not a grouping band).** The scope signal lives _on the card_ — an icon / chip / edge treatment plus a short "whole document" label where a span card shows its `"…quote…"`. Rationale: the marker travels with the card wherever curation places it — critically, it survives the "Key issues" lift that pulls a high-priority `missing_topic` _up_ out of any bottom cluster, so a positional-only signal (a bottom band) would be defeated by our own curation. A labeled grouping band was considered and **declined** for that conflict; a light band may be revisited later as _reinforcement_, never as the primary signal.
2. **Remove the dead locate affordance.** Doc-scoped cards drop click-to-scroll and hover-to-highlight — there is no span to locate, so the interaction should not be offered. This is the correctness half of the fix and resolves the "silent no-op" directly. The dismiss (X) and any "N more" toggle keep their own behaviour.

Both are consistent with the **dropped R4** (`plan.md`, "Doc-level anchoring … dropped 2026-07-05"): R4 declined to _give_ doc-level cards section anchors/highlights. We are not reopening that — we are doing the complement, making the _absence_ of an anchor legible and intentional rather than accidental.

## Open design questions (for Hallmark + prototype)

These are the taste calls to resolve with the Hallmark skill and lock via a rendered prototype before building:

- **Marker form.** Icon vs. text chip vs. a distinct anchor-slot label vs. an edge/background treatment — or a restrained combination. Strawman: reuse the `card-anchor` slot with a non-quote label (e.g. "Across the whole document") preceded by a small scope glyph, visually distinct from a quote (no quotation marks, muted, not italic-serif). Must not read as a second severity signal or add a fix-prescribing verb.
- **Copy.** "Whole document" (prior art) vs. "Across the document" vs. per-nature phrasing. Keep it locating-not-prescribing (invariant: provoke, don't prescribe) and short enough for the narrow feed column.
- **Affordance-removal feel.** With locate gone, does the card need any hover state at all (e.g. a gentle elevation for "this is a live card"), or should it sit fully static? Cursor should be `default` (already the card-wide rule) — verify no lingering pointer/`help` cues imply clickability.
- **Cursor / a11y.** Doc cards should not present as buttons: no `obs-card-activate` wiring, aria describes them as document-level, and the marker isn't hue-only.
- **Mobile (~375px).** The marker must survive the narrow column and touch (no hover-gated reveal for a load-bearing signal).

## Relationship to existing work

- **`feed_surface.md`** (done) — owns the card anatomy this modifies (`GroupedObsCard`, the `card-anchor` slot). This is a targeted refinement of that anatomy, not a re-shape.
- **`ui_interaction_mechanics.md`** (idea, Phase 6) — owns the hover→highlight / click→scroll contracts (C2, R7b). Removing those affordances _for doc scope_ is an amendment to that contract; note it there when built.
- **UX-015 / `feedBudget.ts`** — the priority bands are the reason a positional signal can't be primary. This marker composes with the bands; it does not touch ordering.
- **`doc_scope_reconciliation.md`** (done) — unrelated to display; listed only so a future reader doesn't conflate "scope reconciliation" (lifecycle) with "scope legibility" (this, display).
- **R4 (dropped)** — see § Decided direction; complementary, not a reopen.

## Todo

Phase 6:

- [ ] Confirm the exact set of scope-blind surfaces: card header/anchor slot, hover/click handlers, the "N more" grouped-member rows, and the reverse-hover (UX-006) path for a doc-scoped primary.
- [ ] Hallmark pass on the marker (form + copy + affordance-removal feel).
- [ ] Post a **rendered** prototype of the doc-scoped card (alongside a span card for contrast) in chat; get owner sign-off before touching `src/`.
- [ ] Implement: card-intrinsic marker keyed on `scope === "document"`; label in/replacing the `card-anchor` slot.
- [ ] Implement: suppress `obs-card-activate` + hover-highlight wiring for doc-scoped cards; keep dismiss + group toggle.
- [ ] Verify at 375px + touch; verify the marker survives the "Key issues" lift and the reverse-hover path.
- [ ] Update `feed_surface.md` (card anatomy) and `ui_interaction_mechanics.md` (affordance amendment); reconcile the stale UX-008 "Whole document" claim in `plan.md`.
