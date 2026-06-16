---
status: idea
kind: spec
phases: [5]
summary: A concrete, itemized accessibility & keyboard-first checklist for the feed and the hover/highlight interactions — enumerated to the point where a mechanical agent can execute item by item, with the few judgment-dependent items flagged for the product-feel pass.
---

# Accessibility & keyboard-first polish

> **Readiness target:** turn the 🟡 "Accessibility and keyboard-first polish" milestone into a 🟢 checklist a ⚙️ agent can work through. Most items are mechanical (ARIA roles, labels, focus styles); the few that need interaction-design judgment are marked **[design]** and deferred to the UX-mechanics pass (🧠).

## Status

**Idea — Phase 5.** Hardening leg of the phase. The product's primary interaction — hover a card → highlight its span — is mouse-only today; the load-bearing a11y work is giving that a keyboard/AT equivalent. Read alongside `docs/projects/quality_remediation_synthesis.md` (R7b scanning affordances — overlaps the reverse-hover/scroll items) and the UX-mechanics pass in `docs/plan.md` (Phase 5).

## Phased Plan

| Phase | Contributes |
| --- | --- |
| **5** | Semantic roles/labels on the feed, a keyboard path for card↔span focus and highlight, focus-visible styling, and a reduced-motion guard for the Phase-5 feed choreography. |

## Todo

Anchor file for nearly all of this is `src/sidecar/SidecarFeed.tsx` (feed, cards, archive, settings) and `src/editor/extensions/ObservationHighlighter.ts` (the decoration that highlights spans).

### A1 — Semantics & labels (mechanical)

- [ ] Give the sidecar landmark a role/label: `<aside className="sidecar-panel" aria-label="Observations">` (already an `<aside>` at L270 — add the label).
- [ ] The observations list (`.observations-list`) → `role="list"`; each `obs-card` → `role="listitem"`. The "also noticed" and "archive" toggles are already `<button>` — add `aria-expanded={showAlsoNoticed}` / `aria-expanded={showArchive}` and `aria-controls` pointing at the drawer/list ids.
- [ ] Icon-only buttons need accessible names: the dismiss button (`obs-dismiss`, L98), import/clear/settings/export buttons (`settings-toggle-btn`) — add `aria-label` (e.g. `aria-label="Dismiss observation"`). They have `title` in some cases; add `aria-label` to be explicit.
- [ ] The status chip (`sidecar-status`) → `role="status"` `aria-live="polite"` so AT announces idle/working transitions.
- [ ] Settings form controls already have `<label htmlFor>` — verify each input id matches and the key-tier checkbox has an associated label (it wraps the input at L445, good).

### A2 — Keyboard path for the hero interaction (mechanical + one [design] call)

Today highlight is driven by `onMouseEnter`/`onMouseLeave` → `onHoverObservation(id)` (SidecarFeed) → `setHoveredObservationId` (App) → highlighter decoration (Editor). Give it a keyboard/focus equivalent:

- [ ] Make each `obs-card` focusable (`tabIndex={0}`) and fire the same highlight on `onFocus`/`onBlur` that `onMouseEnter`/`onMouseLeave` fire on hover. This reuses the existing `onHoverObservation` plumbing — no new state. Result: tabbing through cards highlights each one's span.
- [ ] `Enter`/`Space` on a focused card scrolls the editor to the highlighted span (depends on the scroll-into-view affordance — coordinate with R7b/UX-009 in `quality_remediation_synthesis.md`; if that isn't built yet, at minimum move editor selection to the span start).
- [ ] **[design]** Reverse direction (focus text in editor → indicate its card) is UX-006/R7b — defer to the UX-mechanics pass; note the dependency here, don't build speculatively.

### A3 — Focus-visible styling (mechanical)

- [ ] Add `:focus-visible` outlines for cards, buttons, the drawer/archive toggles, and editor — a clear, calm focus ring (not the browser default suppressed). Put in `src/styles.css`. Ensure the ring is visible against the card background.
- [ ] Verify tab order is logical: header buttons → settings (when open) → stage-suggestion chip → cards → also-noticed → archive. Reorder DOM only if needed (it currently follows this order).

### A4 — Contrast & reduced motion (mechanical)

- [ ] Audit text/badge contrast against WCAG AA (the muted greys `#9ca3af`/`#6b7280` on `#f9fafb` archive cards are borderline — bump if under 4.5:1 for body text). This is a pass over `src/styles.css` and the inline styles in `SidecarFeed.tsx`.
- [ ] Add `@media (prefers-reduced-motion: reduce)` that disables the Phase-5 feed choreography animations (R3c) and any transitions. (Coordinate: if R3c isn't built yet, leave a one-line note in `quality_remediation_synthesis.md` R3c that the animation must honor this guard.)

### A5 — Editor a11y (mechanical, light)

- [ ] Confirm the TipTap editor surface has an accessible name (`aria-label="Document"` on the editor container or a visually-hidden `<label>`), and that the `Placeholder` text isn't the only cue.

## Notes

- No new dependencies. Everything is ARIA attributes, CSS, and reuse of existing hover plumbing.
- Items marked **[design]** are the only ones needing 🧠 — they're flagged so a ⚙️ agent does A1/A3/A4/A5 and the keyboard half of A2 cleanly, and leaves the reverse-direction interaction to the UX pass.

## Verification

1. Keyboard-only pass: unplug the mouse — Tab through the feed; every card highlights its span on focus; Enter scrolls/selects; all buttons reachable and operable.
2. Screen-reader smoke (VoiceOver): the sidecar announces as "Observations", cards read as a list, status changes announce politely, icon buttons read their labels.
3. `prefers-reduced-motion` on (OS setting) → no feed animation.
4. Contrast: spot-check with devtools contrast checker on body text and badges; all AA.
