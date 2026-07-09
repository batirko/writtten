---
status: in-progress
kind: spec
phases: [6, 7]
summary: The project's never-designed narrow-viewport / touch dimension. Split into a small Phase-6 "courtesy pass" (don't ship a broken layout to phone visitors of the first public release) and a Phase-7 "mobile review companion" (the real touch interaction model — feed-first review, tap-to-locate-span — reframed to fit the product instead of forcing a cramped phone editor).
---

# Mobile & responsive

> **The honest framing.** writtten was designed desktop-native and it was never questioned: the whole interaction language — a two-pane spatial companion, hover-linked span↔card, bubble/slash/table menus, `⌘\` collapse — assumes a wide viewport, a mouse, and hover. `docs/concept.md` deferred a mobile-*native* app ("PWA is enough"), but PWA means *installable*, not *responsive* — the narrow/touch story was simply never drawn. This spec draws it, and splits it by honesty of effort: a cheap courtesy pass so the first public release doesn't render broken on a phone, and a real interaction redesign later, reframed so it fits the product.

## Status

**In-progress — Phase 6 courtesy pass shipped (2026-07-07); Phase 7 (companion) still a design sketch.** Two clearly separated bodies of work:

- **Phase 6 — Mobile courtesy pass (small, in-scope). ✅ Shipped 2026-07-07.** The first public release means people *will* open the link on a phone. That was a broken, sideways-scrolling squish (see _Ground truth_ below). The courtesy pass makes a narrow viewport *not embarrassing and usably read-only-ish*, and is honest that the tool is built for desktop: a `@media (max-width: 720px)` stack, feed default-collapsed on narrow, hover-only affordances degraded, and a quiet dismissible "best on desktop" note. **Does not** attempt to make the hero interaction work on touch.
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

**Shipped 2026-07-07** (PR: `feat(mobile): Phase-6 courtesy pass`). One appended `@media (max-width: 720px)` block in `src/styles.css` + a viewport-aware `feedCollapsed` initializer in `src/App.tsx` + a new `src/sidecar/MobileNote.tsx`. No new tokens, no new colours/fonts — the pass is layout + one calm chrome strip on the existing system. Editor.tsx and other lane hubs untouched.

### M1 — Kill the overflow & stack (mechanical) — done

- [x] Added the narrow breakpoint `@media (max-width: 720px)`. Below it `.app` becomes `flex-direction: column` (editor leads, feed stacks full-width below), and the fixed-width / min-width floors that forced overflow are relaxed. _(Correction to the earlier draft: the "280/210/184px feed floors" are actually on `.link-popover` (280) / `.slash-menu` (210) / `.control-process` (184) — `position:absolute` popovers, **not** the feed column. The real overflow driver was `.feed-slot { width: 320px; flex-shrink: 0 }`. Both handled: feed → `width: 100%`; popovers → `min-width: 0` + `max-width: calc(100vw - 2*var(--space-md))`.)_
- [x] `overflow-x: clip` on `html, body` inside the breakpoint. **Verified overflow-free at 320 / 360 / 375px** (`scrollWidth === clientWidth` at each).
- [x] Editor keeps its `66ch` reading measure but fills the narrow width; padding shrinks to `var(--space-lg) var(--space-md)`.

### M2 — Feed made reachable-not-broken on narrow (mechanical + one small call) — done

- [x] Feed stacks below the editor at full width, scrollable/readable; the whole column scrolls as one document (editor + sidecar `overflow-y: visible` on narrow). Card markup and tap-dismiss are unchanged, so they work as-is.
- [x] **Feed defaults _expanded_ on first load (all viewports).** _(Reversed 2026-07-09 — see the follow-up below. Originally the `feedCollapsed` initializer fell back to `matchMedia("(max-width: 720px)").matches` so a phone opened collapsed, editor-first. Real use showed the feed was then too easy to miss — visitors didn't realise the observation companion existed — so the initializer now returns `false` when there is no stored preference, and the feed leads visible on narrow too.)_ A stored preference always wins. The `.feed-handle` remains a **full-width ≥44px tap bar** to collapse/reveal it.

### M3 — Degrade hover-only affordances gracefully (small judgment) — done

- [x] Hover-only audit (courtesy bar = no dead-end for the core read loop):
  - **Feed cards / dismiss** — reachable by tap (handle → scroll → tap dismiss). The observation _content_ is fully reachable without hover.
  - **SpanPeek / ContradictionPeek (reverse-hover)** — don't surface on touch. Accepted: they're a _shortcut_ to content already reachable in the feed; the span↔card **linking** is the Phase-7 gap, not a Phase-6 dead-end. Widths capped so they can't overflow if ever shown.
  - **Bubble / slash menus** — trigger on selection / "/" typing (touch-supported); `min-width` capped so they fit a phone.
  - **Table menu** — hover-gated controls are a known Phase-7 gap (mobile formatting is review-first/minimal by design); no dead-end for the core loop.
- [x] `ObservationHighlighter` decorations still render statically (not hover-dependent), so observed spans still _show_ colour on touch even though tapping them does nothing yet.

### M4 — The honesty note (small) — done

- [x] `MobileNote.tsx`: a quiet, dismissible one-liner shown only on narrow viewports — _"writtten is built for focused desktop writing — the observation feed is best on a laptop."_ Slim non-blocking strip at the top of the editor column (originally a sidecar wash, `--radius-md`, sans `--text-ui-sm` in `--color-ink-2`, muted `×` with a 44px touch target — restyled 2026-07-09 to an accent tint + full-ink `--text-ui`; see follow-up below), **not** a modal wall. Display-gated to ≤720px in CSS (no desktop flash) and dismissal persists to `localStorage` (`writtten_mobile_note_dismissed`).

**Phase-6 verification (done 2026-07-07, chrome-devtools CDP viewport override on the worktree dev server):** 320 / 360 / 375px — no horizontal scroll; editor usable at the reading measure; feed default-collapsed on narrow, reveals on tap-handle, scrolls full-width; honesty note appears once and dismisses (flag persists); **no console errors/warnings**; nothing in the core read loop is _only_ reachable by hover. Desktop (1280px) unregressed — two-pane row, feed expanded at 320px, note hidden.

### Follow-up — pre-first-release mobile polish (2026-07-09)

Small polish pass on the shipped courtesy pass ahead of the first public release (not a new milestone; still bounded Phase-6 scope, no Phase-7 touch-hero work). Four fixes:

- **Feed defaults expanded on narrow** — the M2 default was flipped (see above). The observation feed leads visible on a phone so first-time visitors register that it exists; a stored preference still wins.
- **Handle ↔ activity-center tap collision fixed.** The `position: fixed` control-center (bottom-right, `z 40`) floated over the full-width in-flow `.feed-handle`; on a short collapsed page the handle stranded under the anchor and its right-end taps hit the activity center. Fix: a bottom safe-area on the mobile `.app` (`padding-bottom: calc(var(--space-lg) + 44px + var(--space-md))`) keeps the fixed anchor's footprint clear of the last interactive row — combined with the feed now defaulting expanded, the handle is no longer the stranded last element.
- **Activity center closes on second tap (touch).** The tap toggle in `ControlCenter.tsx` already flipped `tapOpen`, but the reveal rule ORed in `:hover` / `:focus-within`; iOS's sticky `:hover` (set on first tap, cleared only by tapping elsewhere) kept the panel open after the second tap. Fix: `.is-open` is now the unconditional reveal path and the hover / focus-within reveal is gated behind `@media (hover: hover)` (desktop only), so `tapOpen` is authoritative on touch.
- **Honesty note made visible.** The M4 strip was a near-invisible sidecar wash (`--color-sidecar` / hairline / `--text-ui-sm` in `--color-ink-2`). Modest, still-calm lift to `--color-accent-tint` + a stronger accent-mixed border + full-ink text at `--text-ui`. No icon/eyebrow — still a quiet strip, not a callout. Copy, markup, dismiss + `localStorage` persistence unchanged.

The Welcome modal was reviewed at 375px and needed no change (it caps to `max-width: 88vw` via `.modal-card` and its CTAs already stack). Verified at 320 / 360 / 375px + desktop 1280px unregressed; `npm test` / `lint` / `build` green.

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
