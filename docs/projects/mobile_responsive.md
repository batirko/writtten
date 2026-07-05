---
status: idea
kind: spec
phases: [6, 7]
summary: The project's never-designed narrow-viewport / touch dimension. Split into a small Phase-6 "courtesy pass" (don't ship a broken layout to phone visitors of the first public release) and a Phase-7 "mobile review companion" (the real touch interaction model — feed-first review, tap-to-locate-span — reframed to fit the product instead of forcing a cramped phone editor).
---

# Mobile & responsive

> **The honest framing.** writtten was designed desktop-native and it was never questioned: the whole interaction language — a two-pane spatial companion, hover-linked span↔card, bubble/slash/table menus, `⌘\` collapse — assumes a wide viewport, a mouse, and hover. `docs/concept.md` deferred a mobile-*native* app ("PWA is enough"), but PWA means *installable*, not *responsive* — the narrow/touch story was simply never drawn. This spec draws it, and splits it by honesty of effort: a cheap courtesy pass so the first public release doesn't render broken on a phone, and a real interaction redesign later, reframed so it fits the product.

## Status

**Idea — Phases 6 (courtesy) & 7 (companion).** Two clearly separated bodies of work:

- **Phase 6 — Mobile courtesy pass (small, in-scope).** The first public release means people *will* open the link on a phone. Today that's a broken, sideways-scrolling squish (see _Ground truth_ below). The courtesy pass makes a narrow viewport *not embarrassing and usably read-only-ish*, and is honest that the tool is built for desktop. A few hours of responsive CSS + graceful degradation of hover-only affordances. **Does not** attempt to make the hero interaction work on touch.
- **Phase 7 — Mobile review companion (big, post-traction).** The real touch interaction model for the span↔card relationship, reframed: on a phone you *review* observations (feed-first, tap-to-locate-span, dismiss/keep), you don't thumb-type a PRD. This is a genuine second interaction surface and gets its own design; don't pre-build it.

Read alongside `docs/projects/accessibility.md` (its keyboard/AT equivalence for the hover-only hero interaction is the sibling of this work — a touch equivalent is the same underlying gap) and `docs/projects/feed_surface.md` (the companion-surface metaphor this must re-express on narrow screens).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | Courtesy pass: kill the horizontal overflow (drop the feed `min-width` floors on narrow), stack the panes vertically, ensure the editor is usable as a bare writing/reading surface, degrade hover-only affordances so nothing is *only* reachable by hover, and add a quiet "best on desktop" acknowledgement.  |
| **7** | The mobile review companion: a feed-first, tap-to-locate touch model for the span↔card relationship (feed as a bottom sheet / tab), the mobile choreography, and a decision on how much authoring (vs. review) mobile should support.                                                                            |

## Ground truth — what exists today (2026-07-05)

Verified against the running layout and `src/styles.css`:

- **Layout is a hard flex row.** `.app { display: flex }` with `.editor-panel { flex: 1 }` beside the `.feed-slot` column (`src/App.tsx`, `src/styles.css`). **There is no layout media query anywhere** — the only `@media` blocks are `print` and `prefers-reduced-motion`.
- **The feed carries hard `min-width` floors** (280px / 210px / 184px on feed internals). On a phone the two columns can't fit, so the page scrolls **sideways** and both columns are crushed.
- **The signature interaction is hover-driven and dies on touch.** The span↔card magic is reverse-hover dwell (~600ms) surfacing a card, the floating `SpanPeek` / `ContradictionPeek`, and the bubble/slash/table menus (mouse-selection + hover). Touch has no hover → the AI-companion value is effectively invisible on a phone.
- **Feed collapse is `⌘\` + a small handle button.** The keyboard shortcut has no touch path, but the `feed-handle` button *does* tap — so a phone user *can* collapse the feed and use the app as a bare text editor.
- **Net today:** it loads, you can type, but it looks broken (horizontal overflow) and the reason-to-exist (the linked feed) is unreachable by touch.

## What's rubber-reshape vs. what needs another look

**Rubber-reshape (cheap responsive CSS — Phase 6):**

- The editor canvas — already a `max-width` reading measure; on narrow it just narrows. Fine.
- Document-context header, `ControlCenter`, export/import buttons — reflow.
- Stacking the two panes vertically and removing the feed `min-width` floors at a breakpoint.

**Needs another look (a real interaction redesign — Phase 7):**

- **The span↔card relationship is the product, and it has no touch model.** On desktop it's a *spatial, simultaneous* companion — text left, live feed in peripheral vision, hover linking them. On a phone there's no room for "simultaneous" and no hover for "linking." It has to become *modal/temporal*: feed as a bottom sheet or a tab; **tap a highlighted span → surface its card; tap a card → scroll+flash its span.** That's a different UX, not a reflow.
- **The menus** (bubble/slash/table) assume mouse-selection + hover; touch selection handles behave differently.
- **The "calm feed in the corner" feel** — a core part of the Phase-6 emotional-register work — doesn't survive translation to a modal sheet without deliberate redesign.

## Phase 6 — Mobile courtesy pass (build-ready)

**Goal:** a phone visitor to the first public release sees a *coherent, honest, not-broken* page — not a sideways-scrolling squish. Scope is deliberately narrow; **do not** build the touch hero interaction here.

**Decision (settled):** graceful **vertical stack + a quiet "best on desktop" note**, *not* a hard interstitial wall. A wall is dishonest about the fact that the editor still basically works; a stack + note lets a curious visitor read/skim and try typing while setting the right expectation.

Anchor file: `src/styles.css` (this is Visual-lane territory — it edits the shared style hub; sequence it so it doesn't collide with other UI work). Minimal, additive JSX only if a stack requires reordering.

### M1 — Kill the overflow & stack (mechanical)

- [ ] Add a narrow breakpoint (`@media (max-width: ~font/px TBD, ~720px)`). Below it: `.app` becomes `flex-direction: column` (or the feed drops below the editor), and the feed `min-width` floors (280/210/184px) are relaxed to `min-width: 0` / `100%` so nothing forces horizontal scroll.
- [ ] Ensure `overflow-x` is contained — no element wider than the viewport. Test at 375px (iPhone) and 360px (common Android).
- [ ] The editor keeps its reading measure but fills the narrow width; padding shrinks to a mobile-appropriate gutter.

### M2 — Feed made reachable-not-broken on narrow (mechanical + one small call)

- [ ] With the feed stacked below (or collapsed by default on narrow), it's *scrollable and readable* even if its interactions are degraded. Cards render, quoted-text subtitles render, dismiss works by tap.
- [ ] **Default the feed collapsed on first load at narrow widths** (so the editor is what a phone visitor sees first), with the tap `feed-handle` to reveal it. Persist as today.

### M3 — Degrade hover-only affordances gracefully (small judgment)

- [ ] Audit every hover-only path (reverse-hover span→card, `SpanPeek`/`ContradictionPeek`, bubble/slash/table menus) and ensure **nothing is *only* reachable by hover** on touch. Courtesy bar: no dead-end — either the affordance has a tap fallback that already exists, or its absence is acceptable for the read-only-ish courtesy scope (document that per affordance; the real touch model is Phase 7, not here).
- [ ] Highlights (the `ObservationHighlighter` decorations) still render statically — the span colouring is not hover-dependent, so the text still *shows* it's been observed even if tapping it does nothing yet.

### M4 — The honesty note (small)

- [ ] A quiet, dismissible one-liner on narrow viewports: writtten is built for focused desktop writing; the review experience is best on a laptop. Calm, non-blocking, matches the visual system (coordinate with `onboarding_first_run` empty-state voice). Not a modal wall.

**Phase-6 verification:** load at 375px and 360px in devtools — no horizontal scroll; editor is usable (type a sentence, it renders at the reading measure); feed is reachable (tap the handle, cards render and scroll, dismiss works); the honesty note appears once and dismisses; no console errors; nothing is *only* reachable by hover.

## Phase 7 — Mobile review companion (design sketch, not build-ready)

**Reframe:** don't build a cramped phone *editor*; build a phone *reviewer*. The persona drafts a PRD on a laptop; the phone is where they skim observations on the train. That fits the product instead of fighting it, and it's a compelling second surface rather than a degraded first one.

Open design questions (this is a sketch to be turned into a build-ready spec when scheduled):

- **Feed placement:** bottom sheet (peek → half → full drag states) vs. a tab/segmented switch between "Write" and "Observations." Bottom sheet keeps the "companion" feel closer than a hard tab.
- **span→card:** tap a highlighted span in the editor → its card rises in the sheet (the touch analogue of reverse-hover).
- **card→span:** tap a card → editor scrolls to and flashes the span (reuse the C2 click-to-locate contract + `bothSpansFit` peek from UX-009; the far-span peek is *more* important on a small screen).
- **How much authoring on mobile?** Decide explicitly: full editing, light edits only, or read + dismiss only. Leaning light-edit + review — thumb-typing a spec is not the job.
- **Menus:** a touch-appropriate formatting affordance (or accept that mobile is review-first and formatting is minimal).
- **Choreography:** the Phase-6 feed motion (`cardEnter`/`cardExit`, "New" marker) re-expressed for a sheet, honoring `prefers-reduced-motion`.

**Dependencies / composition:** the touch model is the same underlying gap as `accessibility.md`'s keyboard/AT equivalence for the hover hero interaction — both give the span↔card link a non-hover driver. Build them aware of each other. Reuses the UX-009 (`ui_interaction_mechanics.md`) click-to-locate + peek machinery.

## Non-goals

- **No mobile-native app.** Consistent with `docs/concept.md` — this is responsive web / PWA, not React Native / a store binary.
- **No new fix-application affordances.** Invariant #1 holds on every surface; a phone "review" surface must not sprout an apply/rewrite button because it's tempting on touch.
- **Phase 6 does not attempt the touch hero interaction.** That's Phase 7 by design; conflating them is how the courtesy pass balloons.
