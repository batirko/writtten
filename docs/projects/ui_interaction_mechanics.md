---
status: idea
kind: spec
phases: [5]
summary: The canonical interaction contracts for the feed↔editor — hover/focus highlight, card activation (click scrolls-to-span), the dismiss gesture with an Undo toast that rolls back suppression, card anatomy & ordering, and the two "also noticed" drawers. Makes the partly-built Phase-4 mechanics intentional and consistent, and draws clean scope lines against R7b, R3c, and the shipped accessibility work.
---

# UI / Interaction Mechanics

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 5 (design fully written, ready to build).** The third leg of the "product feel" pass. The interactions that define how the tool _feels_ — hover a card, see its span light up; click, go there; dismiss, with a way back — are **partly built already** (Phase 4 shipped most of the plumbing). This pass doesn't rebuild them; it makes the contracts **intentional, consistent, and documented**, and it resolves the two product-feel decisions that were left open.

This is appearance-and-behaviour glue that sits on top of:

- `docs/projects/visual_style.md` — the visual vocabulary (motion tokens, elevation, semantic colour) every contract here references. **Read it first.**
- `docs/projects/emotional_register.md` — the dismiss/Undo copy follows its voice guide.
- `docs/projects/accessibility.md` — the keyboard/AT half of these same interactions (**shipped** — `[x]` in the plan; its todo list drifted out of sync with the code, see § Audit).
- `docs/projects/quality_remediation_synthesis.md` — **R7b** owns the _new_ scanning affordances (reverse hover text→card / UX-006, quoted-text subtitle / UX-008, distant-contradiction split-context / UX-009); **R3c** owns feed enter/exit choreography. This pass owns the _contracts_ those builds must satisfy, not the builds themselves (§ Scope boundaries).

**Two decisions settled 2026-06-17:**

1. **Dismiss = optimistic + Undo toast.** No confirm dialog. The card animates out; a brief "Dismissed · Undo" affordance lets the user reverse it, and **Undo rolls back the suppression write** so an accidental dismiss never silently trains the feed (the G1 flattery-resistance concern).
2. **Hover highlights; click scrolls-to-span.** Hover/focus = highlight the span in place (no scroll). Click/Enter = scroll the editor to the span and pulse it once. Clean "preview vs. go there" split.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **5** | Codify the six interaction contracts (§ Contracts) into consistent, token-driven implementations; add the Undo toast + suppression rollback; add click-scroll-to-span + pulse. Leaves the new R7b affordances and R3c choreography to their own milestones, satisfying the contracts defined here. |

## Todo

Anchor files: `src/sidecar/SidecarFeed.tsx` (feed, cards, drawers, dismiss), `src/App.tsx` (`hoveredObservationId` state + dismiss/suppression wiring), `src/editor/extensions/ObservationHighlighter.ts` (decorations), `src/styles.css` (the visual_style tokens).

- [ ] **Hover/focus contract** — verify hover and keyboard-focus drive the _same_ highlight path (already true: `onMouseEnter`/`onFocus`→`onHover(id)`, `onMouseLeave`/`onBlur`→`onHover(null)`); document it and make the active-card treatment use the `--elev-active` / `--color-border-strong` tokens (§ C1).
- [ ] **Click → scroll-to-span + pulse** — `onClick` (and `Enter`/`Space`, partly in the card's `onKeyDown`) scrolls the editor to the span start and plays a one-shot pulse on the highlight. Reuse the highlighter; add a transient `obs-highlight-pulse` class driven by motion tokens (§ C2). Distant-contradiction split-context is delegated to R7b.
- [ ] **Dismiss + Undo toast** — make dismiss optimistic (animate out via R3c tokens), show a transient "Dismissed · Undo" toast (~5s), and make Undo restore the observation **and** roll back the suppression record written on dismiss (§ C3). Touches the G1 suppression write in `src/services/evaluator.ts` / `src/store/db.ts`.
- [ ] **Card anatomy ordering** — confirm the DOM order matches the visual_style card spec (impact dot → tag → dismiss; body; "also noticed"); the quoted-text subtitle is R7b/UX-008, not built here (§ C4).
- [ ] **Two-drawer contract** — distinguish and document the per-card group drawer (`expanded`, "N more on this passage") from the feed-level budget drawer (`showAlsoNoticed`, "also noticed"); consistent toggle affordance, `aria-expanded`/`aria-controls` (already present), token-driven reveal (§ C5).
- [ ] **Document-scope hover** — doc-level observations (no span) show the "whole document" affordance on hover instead of a span highlight (§ C6); verify it's distinct and calm.
- [ ] **Consistency pass** — one hover/transition language across all of the above: only the visual_style `--dur-*`/`--ease-*` tokens, `transform`/`opacity` only, reduced-motion honored (§ Consistency rules).

## Design

### Audit — current state (what to make intentional)

What Phase 4 already shipped (so this pass refines, not rebuilds):

- **Hover/focus → highlight** is wired both ways: card `onMouseEnter`/`onFocus` → `onHover(primary.id)` → `App.setHoveredObservationId` → highlighter decoration; `isActive={hoveredObservationId === group.primary.id}` styles the active card. Cards are `tabIndex={0}` with a `role="listitem"` in a `role="list"`.
- **Dismiss** exists (`handleDismiss`, `data-testid="obs-dismiss"`, `aria-label`) — instant, archive-only recovery today. **No Undo.**
- **Two drawers** exist: per-card group `expanded` ("N more on this passage") and feed-level `showAlsoNoticed`.
- **Accessibility plumbing** is shipped: `aria-live="polite"` status, `aria-expanded`/`aria-controls` on settings, focus-visible rings. (The `accessibility.md` todo still shows these unchecked — that doc drifted; the milestone is `[x]`. Flagged, not fixed here.)

The inconsistencies this pass resolves: dismiss has no recovery path; click does nothing distinct from hover; highlight/active-card styling predates the visual_style tokens; the two drawers use ad-hoc styling rather than one reveal language.

### Contracts

#### C1 — Hover / focus → highlight (preview)

- Hovering a card **or** focusing it via keyboard highlights its span(s) in the editor, in place, **without scrolling**. Leaving/blurring clears it. Mouse and keyboard share one code path (the existing `onHover`).
- The active card gets `--elev-active` + `--color-border-strong` (visual_style); the highlighted span intensifies its wash and switches its underline to solid (visual_style § Highlights).
- `contradiction` / `strategic_tension` highlight **both** spans together (hero behaviour — preserve).
- Reverse direction (hovering/focusing the _text_ surfaces its card) is **R7b/UX-006** — not built here; the contract is: when built, it must reuse this same `hoveredObservationId` channel so the two directions can't disagree.

#### C2 — Click / Enter → scroll-to-span (go there)

- Clicking a card (or `Enter`/`Space` on a focused card) scrolls the editor so the span is comfortably in view and plays a **one-shot pulse** on the highlight (`obs-highlight-pulse`, `--dur-base`/`--ease-out`, opacity/transform only).
- Scroll is `scrollIntoView` with `block: "center"`, honoring `scroll-behavior` (reduced-motion → instant).
- If the span is far from the current viewport (distant contradiction), the richer **split-context / dual-scroll** treatment is **R7b/UX-009**; until that lands, scroll to the primary span and pulse both (for dual-span types) in sequence.
- Doc-scope cards (no span) do nothing on click beyond the C6 affordance.

#### C3 — Dismiss + Undo (the destructive gesture, made safe)

- The dismiss button is a quiet ghost affordance in the card header, strengthening on card hover/focus (visual_style). One click dismisses — **no confirm dialog** (a confirm reads as distrustful and slows the most frequent gesture).
- Dismiss is **optimistic**: the card animates out immediately (R3c exit choreography / motion tokens), and a transient toast appears: **"Dismissed · Undo"** (copy per emotional_register — terse, no praise/apology). Auto-dismisses after ~5s.
- **Undo restores the observation to the feed _and rolls back the suppression record_** written on dismiss. This is the load-bearing detail: dismissing a high-severity defect/contradiction writes a (span-scoped, per G1) suppression; an accidental dismiss must not silently train the feed quieter. Undo is the cheap correction. (Build: the dismiss action must return enough to reverse both the lifecycle state change and the suppression write — coordinate with G1 in `philosophy_guardrails.md`.)
- Only one Undo toast at a time; a second dismiss replaces the first (the first's dismissal stands).
- Long-term recovery still lives in the **archive** (un-dismiss from there); the toast is the _immediate_ correction, the archive is the _record_.

#### C4 — Card anatomy & ordering

Ordering is fixed by `visual_style § Observation card` (left-border impact = kind×severity; header = impact dot + type tag + dismiss; body; "also noticed"). This pass only enforces that the DOM matches that order and that the impact dot's tooltip (severity/confidence) is reachable. The **quoted-text subtitle** (show the anchored text on the card, UX-008) is **R7b** — not added here; when added it slots between tag and body.

#### C5 — The two drawers

Two distinct overflow mechanisms, kept visually and behaviourally consistent (same toggle affordance, same reveal motion, both with `aria-expanded`/`aria-controls`):

- **Per-card group drawer** (`expanded`) — collapses _same-span_ aggregated observations ("N more on this passage", obsAggregation). Lives inside one card.
- **Feed-level budget drawer** (`showAlsoNoticed`) — collapses observations below the calm-feed budget ("also noticed"). Lives at the bottom of the feed.

Both use the visual_style reveal (slide+fade, `--dur-base`/`--ease-out`, reduced-motion → instant). The toggle chevron and label style are identical so the user learns one "expand" gesture.

#### C6 — Document-scope hover affordance

Doc-level observations (`missing_topic`, `structure_flow`, `audience_mismatch`, doc-scope `underexposed_topic`) have no span. On hover/focus they show a subtle **"whole document"** affordance (per features.md → Anchoring) rather than a span highlight — e.g. a calm edge indication on the editor column, not an alarm. Distinct from span highlights; never a full-canvas flash.

### Scope boundaries (what this pass does NOT own)

| Concern                                                    | Owner                                    |
| ---------------------------------------------------------- | ---------------------------------------- |
| Reverse hover (text → card) / UX-006                       | R7b (`quality_remediation_synthesis.md`) |
| Quoted-text subtitle on cards / UX-008                     | R7b                                      |
| Distant-contradiction split-context / auto-scroll / UX-009 | R7b                                      |
| Feed enter/exit animation + "new/updated" badge / UX-007   | R3c                                      |
| Keyboard path, ARIA roles/labels, contrast floors          | `accessibility.md` (shipped)             |
| Visual tokens (colour, motion, elevation, type)            | `visual_style.md`                        |
| Manual filter/sort/"top 5" controls / UX-010               | R2c smart-feed design project            |

This pass is the **contract layer**: it defines how these interactions must behave and reuses one motion/highlight language, so that when R7b and R3c build their pieces they snap into a coherent whole instead of inventing parallel hover/scroll/animation behaviours.

### Consistency rules

- One interaction language: only the visual_style `--dur-fast`/`--dur-base` durations and `--ease-out`/`--ease-in-out` easings; animate `transform`/`opacity` only; the focus ring shows instantly (never animated).
- Every transient (pulse, toast, drawer reveal, card exit) honors `prefers-reduced-motion` — spatial motion collapses to a ≤150ms opacity change or instant.
- Hover and keyboard focus are always equivalent — no interaction is mouse-only (the accessibility invariant).
- No interaction introduces a fix-application affordance, and none lets the AI's commentary act on the user's text (Hard Invariant 1).
