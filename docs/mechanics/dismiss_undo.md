# Dismiss + in-place Undo placeholder

> **Keep this current.** If you change the dismiss flow, the deferred-finalize timing, the pending-dismiss keying, or the placeholder rendering, update this file in the same task. Design contract: `docs/projects/ui_interaction_mechanics.md` § C3.

How a user dismisses an observation and how that dismissal is made reversible. Dismissing a card replaces it **in place** with a temporary "Dismissed · Undo" ghost slot — so the Undo affordance sits exactly where the card was (no mouse trek, no lost mental link) and each dismissal gets its own placeholder. The dismissal is **deferred**: the observation stays live until the placeholder fades (~3s), at which point it is finalized. Undo before then is a pure local **cancel** — nothing was written, so there is nothing to roll back. This *strengthens* the G1 flattery-resistance guarantee: an un-committed (undone) dismiss never writes a suppression at all.

---

## The gesture

- The dismiss control is the quiet `×` in the card header (`[data-testid="obs-dismiss"]`). One click dismisses — **no confirm dialog**.
- A card is a **group**: the primary observation plus any same-span aggregated members (`obsAggregation`). Dismiss operates on the whole group as one unit, and Undo reverses them together.

## Flow (deferred, in place)

1. **Click ×** → `GroupedObsCard.handleDismiss` calls the feed's `onDismiss(group)`.
2. **In-place placeholder** — `SidecarFeed.handleDismiss` adds the group to a local `pendingDismiss` map (keyed by span coordinates — see below), capturing its member ids. `renderGroup` then renders a `DismissedPlaceholder` (`[data-testid="undo-placeholder"]`) in that group's slot instead of the card. **No DB write happens.** The observation stays `active`.
3. **A ~3s timer** (`PENDING_MS`) runs per group. When it fires: the placeholder is marked `fading` (plays `cardExit` via `.observation-card-exiting`), and after `FADE_MS` (200 ms) the dismissal is **finalized**: `for (const id of ids) await onDismissObservation(id)`, then the key is removed from `pendingDismiss`.
   - `App.handleDismissObservation` (`src/App.tsx`): writes the G1 kind/severity-aware `DismissalSuppression` (`saveDismissalSuppression`), flips the observation to `status: "dismissed"` (`updateObservationStatus`), archives it (dev harness), and refreshes. After the refresh the observation leaves the active list, so the slot is gone.

## Undo (a local cancel)

Clicking **Undo** (`[data-testid="undo-action"]`) calls `handleUndoPending(key)`, which clears that group's timers and removes it from `pendingDismiss`. The group's observations were never touched, so it re-renders as a normal card in its original slot. **No DB call, no suppression, nothing to roll back.**

**Invariant:** because the suppression is written only at finalize, a dismiss that is undone never trains the feed quieter — the G1 flattery-resistance concern is satisfied by construction. A dismiss that is *not* undone writes its suppression after ~3s; from then on `evaluatorReconcile.isSpanSuppressed` (G1 severity-aware span-vs-category logic) applies as before.

## Keying (why span coords, not group.id)

`pendingDismiss` and the timers map are keyed by **span coordinates**, mirroring `obsAggregation`'s grouping key:

```
group.blockId != null
  ? `${group.blockId}:${group.startOffset ?? ""}:${group.endOffset ?? ""}`
  : `__doc__:${group.primary.id}`
```

`group.id` is the *primary* observation's id, which can swap if a re-eval re-ranks the group during the pending window. The span key is stable across such re-ranks, so the placeholder stays anchored to the same slot.

## Timing & lifecycle

- **Deferred commit:** ~3 s (`PENDING_MS`) live placeholder, then a 200 ms (`FADE_MS`) fade, then the write.
- **Independent per card:** each dismissed group has its own map entry + timers, so a run of dismissals shows a run of in-place placeholders — no shared affordance.
- **Reduced motion:** the enter/fade animations collapse to ~instant via the global `@media (prefers-reduced-motion: reduce)` rule.
- **All pending timers are cleared on unmount** (`useEffect` cleanup).

## Known minor edge (accepted)

If a re-eval fires *within* the pending window (the user dismisses, then types and settles within ~3 s), reconciliation may auto-close/supersede the still-active observation out from under the placeholder — the placeholder then disappears without its fade, and the finalize becomes a near no-op. Low probability; harmless. Not guarded.

Also: reloading the app within the pending window cancels the pending dismiss (the write never happened) — an accepted consequence of the deferred model, analogous to Gmail's "undo send."

## Scope boundaries

- **Welcome modal** dismissal is chrome, not an observation — no placeholder, no suppression (`WelcomeModal`; it just sets the `writtten_has_seen_welcome` flag). Same for the standing **keyless banner** (`SidecarFeed` `KeylessBanner`), which has no dismiss at all — it stands while keyless.
- **SpanPeek** (collapsed-feed reverse-hover float) has no in-place slot, so it dismisses per-id straight through to `App.handleDismissObservation` — immediate, no placeholder. Long-term recovery for any dismissal still lives in the **archive**.
- The placeholder never applies a fix to the user's prose — it only defers/cancels a lifecycle write (Hard Invariant #1).

## Key symbols

| Symbol | File | Role |
| --- | --- | --- |
| `groupKey(group)` | `SidecarFeed.tsx` | stable span-coord key for the pending map |
| `handleDismiss(group)` | `SidecarFeed.tsx` | start pending + timers (defer) |
| `handleUndoPending(key)` | `SidecarFeed.tsx` | local cancel |
| `renderGroup(group)` | `SidecarFeed.tsx` | placeholder-or-card per slot |
| `DismissedPlaceholder` | `SidecarFeed.tsx` | the dashed ghost slot |
| `handleDismissObservation` | `App.tsx` | finalize: write suppression + status |
| `.observation-card-dismissed` | `styles.css` | the in-place ghost slot |
