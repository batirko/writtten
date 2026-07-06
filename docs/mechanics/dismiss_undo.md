# Dismiss + Undo toast

> **Keep this current.** If you change the dismiss flow, the suppression rollback, the toast timing, or the group-dismiss aggregation, update this file in the same task. Design contract: `docs/projects/ui_interaction_mechanics.md` § C3.

How a user dismisses an observation and how that dismissal is made reversible. Dismiss is **optimistic** and **reversible**: the card animates out immediately, a transient "Dismissed · Undo" toast rides the bottom of the feed, and Undo restores the observation **and** rolls back the suppression written on dismiss — so an accidental dismiss never silently trains the feed quieter (the G1 flattery-resistance concern).

---

## The gesture

- The dismiss control is the quiet `×` in the card header (`[data-testid="obs-dismiss"]`). One click dismisses — **no confirm dialog**.
- A card is a **group**: the primary observation plus any same-span aggregated members (`obsAggregation`). Dismiss operates on the whole group as one unit, and Undo reverses them together.

## Flow (happy path)

1. **Click ×** → `GroupedObsCard.handleDismiss` calls the feed's `onDismiss(group)` (group-level, not per-id).
2. **Optimistic exit** — the feed's `handleDismiss` adds every member id to `exitingIds`, so the card plays the R3c `cardExit` (fade + small `translateY`, 200 ms). `src/sidecar/SidecarFeed.tsx`.
3. **After the 200 ms exit**, the feed writes each dismissal by awaiting `onDismissObservation(id)` per member, collecting `{ obsId, suppressionId }` entries.
   - `App.handleDismissObservation` (`src/App.tsx`): writes a `DismissalSuppression` (`saveDismissalSuppression`, id = `nanoid(10)`), flips the observation to `status: "dismissed"` (`updateObservationStatus`), archives it (dev harness), refreshes, and **returns the suppression id** so the toast can reverse it. Returns `undefined` when nothing was suppressed (obs not found / doc-scope with no span key).
4. **One toast** — `showUndoToast(entries, count)` renders `.undo-toast` (`[data-testid="undo-toast"]`), pinned to the bottom of the feed column (`position: sticky`). Terse copy: **"Dismissed"** + a quiet **"Undo"** text-button (`[data-testid="undo-action"]`). `role="status"`, `aria-live="polite"`.

## Undo (the rollback)

Clicking **Undo** (`handleUndo`) calls `onRestoreDismissed(entries)` and clears the toast. `App.handleRestoreDismissed`, for every entry:

1. `deleteDismissalSuppression(suppressionId)` (`src/store/db.ts`) — deletes **exactly** the suppression the dismiss wrote. This is the load-bearing G1 detail: the feed is not silently trained quieter by an accidental dismiss.
2. `reactivateObservation(obsId, Date.now())` — restores the observation by its original id (status → `active`, `closureReason` cleared, `lastSeenAt` refreshed). Clean restore: same id, no archive churn, no feed flicker.

Then `refreshObservations()` re-renders the feed with the group restored.

**Round-trip invariant:** dismiss → Undo leaves the suppression store exactly as it was before the dismiss (verified live: suppression count 1 → 0, observation `dismissed` → `active`). A dismiss that is **not** undone keeps its suppression, so flattery-resistance (`evaluatorReconcile.isSpanSuppressed`, G1 severity-aware span-vs-category logic) is untouched.

## Timing & lifecycle

- **Auto-dismiss:** the toast fades out after **~5 s** (`toastTimers.current.hide`), then unmounts after the 200 ms exit animation (`.undo-toast--exiting`).
- **One at a time:** a second dismiss calls `showUndoToast` again, which clears the previous timers and replaces the toast — the first dismissal stands (only its toast is superseded).
- **Reduced motion:** the enter/exit animations collapse to ~instant via the global `@media (prefers-reduced-motion: reduce)` rule; no bespoke handling needed.
- **Timers are cleared on unmount** (`useEffect` cleanup → `clearToastTimers`).

## Scope boundaries

- **Welcome card** dismissal is chrome, not an observation — no suppression, no toast (`SidecarFeed` `WelcomeCard`).
- **SpanPeek** (collapsed-feed reverse-hover float) dismisses per-id straight through to `App.handleDismissObservation` — it does **not** raise the feed toast (the feed is folded away when the peek is in use). Long-term recovery for any dismissal still lives in the **archive**.
- The toast never applies a fix to the user's prose — it only reverses a lifecycle+suppression write (Hard Invariant #1).

## Key symbols

| Symbol | File | Role |
| --- | --- | --- |
| `handleDismiss(group)` | `SidecarFeed.tsx` | optimistic exit + per-member dismiss + `showUndoToast` |
| `showUndoToast` / `handleUndo` / `clearToastTimers` | `SidecarFeed.tsx` | toast lifecycle |
| `handleDismissObservation` | `App.tsx` | writes suppression, returns its id |
| `handleRestoreDismissed` | `App.tsx` | deletes suppression + reactivates obs |
| `deleteDismissalSuppression` | `store/db.ts` | the rollback primitive |
| `reactivateObservation` | `store/db.ts` | clean status restore (reused) |
| `.undo-toast` | `styles.css` | the sticky bottom-of-feed strip |
