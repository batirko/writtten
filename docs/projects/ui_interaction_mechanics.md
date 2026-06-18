---
status: idea
kind: spec
phases: [6]
summary: The canonical interaction contracts for the feed↔editor — hover/focus highlight, card activation (click scrolls-to-span), the dismiss gesture with an Undo toast that rolls back suppression, card anatomy & ordering, and the two "also noticed" drawers. Makes the partly-built Phase-4 mechanics intentional and consistent, and draws clean scope lines against R7b, R3c, and the shipped accessibility work.
---

# UI / Interaction Mechanics

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 6 (design fully written, ready to build).** The third leg of the "product feel" pass. The interactions that define how the tool _feels_ — hover a card, see its span light up; click, go there; dismiss, with a way back — are **partly built already** (Phase 4 shipped most of the plumbing). This pass doesn't rebuild them; it makes the contracts **intentional, consistent, and documented**, and it resolves the two product-feel decisions that were left open.

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
| **6** | Codify the six interaction contracts (§ Contracts) into consistent, token-driven implementations; add the Undo toast + suppression rollback; add click-scroll-to-span + pulse. Leaves the new R7b affordances and R3c choreography to their own milestones, satisfying the contracts defined here. |

## Todo

Anchor files: `src/sidecar/SidecarFeed.tsx` (feed, cards, drawers, dismiss), `src/App.tsx` (`hoveredObservationId` state + dismiss/suppression wiring), `src/editor/extensions/ObservationHighlighter.ts` (decorations), `src/styles.css` (the visual_style tokens).

- [ ] **Hover/focus contract** — verify hover and keyboard-focus drive the _same_ highlight path (already true: `onMouseEnter`/`onFocus`→`onHover(id)`, `onMouseLeave`/`onBlur`→`onHover(null)`); document it and make the active-card treatment use the `--elev-active` / `--color-border-strong` tokens (§ C1).
- [ ] **Click → scroll-to-span + pulse** — `onClick` (and `Enter`/`Space`, partly in the card's `onKeyDown`) scrolls the editor to the span start and plays a one-shot pulse on the highlight. Reuse the highlighter; add a transient `obs-highlight-pulse` class driven by motion tokens (§ C2). Distant-contradiction split-context is delegated to R7b.
- [ ] **Dismiss + Undo toast** — make dismiss optimistic (animate out via R3c tokens), show a transient "Dismissed · Undo" toast (~5s), and make Undo restore the observation **and** roll back the suppression record written on dismiss (§ C3). Touches the G1 suppression write in `src/services/evaluator.ts` / `src/store/db.ts`.
- [ ] **Card anatomy ordering** — confirm the DOM order matches the visual_style card spec (impact dot → tag → dismiss; body; "also noticed"); the quoted-text subtitle is R7b/UX-008, not built here (§ C4).
- [ ] **Two-drawer contract** — distinguish and document the per-card group drawer (`expanded`, "N more on this passage") from the feed-level budget drawer (`showAlsoNoticed`, "also noticed"); consistent toggle affordance, `aria-expanded`/`aria-controls` (already present), token-driven reveal (§ C5).
- [ ] **Document-scope hover** — doc-level observations (no span) show the "whole document" affordance on hover instead of a span highlight (§ C6); verify it's distinct and calm.
- [ ] **Highlight density / auto-highlight decision (§ C7)** — resolve always-on vs on-interaction vs user-toggle for span highlights (today: all active spans highlighted persistently, hover only boosts). Implement the chosen default with visual_style highlight tokens; preserve dual-span contradiction behaviour.
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

Ordering is fixed by `visual_style § Observation card` (left-border impact = kind×severity; header = impact label + type tag + dismiss; body; "also noticed"). This pass only enforces that the DOM matches that order and that the impact label's tooltip (severity/confidence, R7a) is reachable. The **quoted-text subtitle** (show the anchored text on the card, UX-008) is **R7b** — not added here; when added it slots between tag and body.

#### C5 — The two drawers

Two distinct overflow mechanisms, kept visually and behaviourally consistent (same toggle affordance, same reveal motion, both with `aria-expanded`/`aria-controls`):

- **Per-card group drawer** (`expanded`) — collapses _same-span_ aggregated observations ("N more on this passage", obsAggregation). Lives inside one card.
- **Feed-level budget drawer** (`showAlsoNoticed`) — collapses observations below the calm-feed budget ("also noticed"). Lives at the bottom of the feed.

Both use the visual_style reveal (slide+fade, `--dur-base`/`--ease-out`, reduced-motion → instant). The toggle chevron and label style are identical so the user learns one "expand" gesture.

#### C6 — Document-scope hover affordance

Doc-level observations (`missing_topic`, `structure_flow`, `audience_mismatch`, doc-scope `underexposed_topic`) have no span. On hover/focus they show a subtle **"whole document"** affordance (per features.md → Anchoring) rather than a span highlight — e.g. a calm edge indication on the editor column, not an alarm. Distinct from span highlights; never a full-canvas flash.

#### C7 — Highlight density / auto-highlight (OPEN DECISION)

**Today, every active span observation is highlighted _persistently_** — `ObservationHighlighter` decorates all `scope === "span" && status === "active"` observations on every rebuild (`ObservationHighlighter.ts`), and hover only _intensifies_ via `obs-highlight-hovered` (`styles.css`). So C1's "hover highlights" is really "hover boosts an already-on highlight." On a doc with many active observations the canvas can read as **busy/marked-up**, which sits in tension with the calm-editorial canvas (`visual_style`) and the "your text is yours" stance.

The decision (unresolved — settle in this pass):

- **(a) Keep always-on** — every active span tinted by default; hover boosts. Maximally discoverable (the user sees there's something to look at), but can feel like markup on a dense doc.
- **(b) Highlight-on-interaction** — spans are _un_-highlighted at rest; a span lights up only when its card is hovered/focused (and the reverse, R7b/UX-006, when built). Calmest canvas; risk that observations feel "hidden" and the user doesn't realize the feed maps to text.
- **(c) User toggle** — a quiet control ("show highlights: always / on hover") defaulting to one of the above. Honest, but adds a setting to a deliberately zero-config product (cross-ref the R2c smart-feed-vs-manual-control tension).

**Recommendation (for debate, not decided):** default to a _gentler always-on_ (much lower-contrast at-rest wash than today, strong boost on interaction) so discoverability survives without the marked-up feeling; reserve a toggle for later only if dogfooding shows the at-rest wash still distracts. Whatever is chosen, it must honor the contradiction/strategic_tension dual-span behaviour (C1) and the visual_style highlight tokens. → tracked on the **UI/UX mechanics pass** milestone in `docs/plan.md`.

### Scope boundaries (what this pass does NOT own)

| Concern                                                    | Owner                         |
| ---------------------------------------------------------- | ----------------------------- |
| Reverse hover (text → card) / UX-006                       | R7b (§ R7b, this doc)         |
| Quoted-text subtitle on cards / UX-008                     | R7b (§ R7b, this doc)         |
| Distant-contradiction split-context / auto-scroll / UX-009 | R7b (§ R7b, this doc)         |
| Feed enter/exit animation + "new/updated" badge / UX-007   | R3c                           |
| Keyboard path, ARIA roles/labels, contrast floors          | `accessibility.md` (shipped)  |
| Visual tokens (colour, motion, elevation, type)            | `visual_style.md`             |
| Manual filter/sort/"top 5" controls / UX-010               | R2c smart-feed design project |

This pass is the **contract layer**: it defines how these interactions must behave and reuses one motion/highlight language, so that when R7b and R3c build their pieces they snap into a coherent whole instead of inventing parallel hover/scroll/animation behaviours.

### Consistency rules

- One interaction language: only the visual_style `--dur-fast`/`--dur-base` durations and `--ease-out`/`--ease-in-out` easings; animate `transform`/`opacity` only; the focus ring shows instantly (never animated).
- Every transient (pulse, toast, drawer reveal, card exit) honors `prefers-reduced-motion` — spatial motion collapses to a ≤150ms opacity change or instant.
- Hover and keyboard focus are always equivalent — no interaction is mouse-only (the accessibility invariant).
- No interaction introduces a fix-application affordance, and none lets the AI's commentary act on the user's text (Hard Invariant 1).

### R3c — Feed enter/exit choreography (spec, settled 2026-06-18)

Owns UX-007 (feed change-blindness). Build-ready spec; lands as its own milestone, satisfying the contracts above. Depends on R3 reconciliation being stable (it is — `docs/plan.md` Phase 4, done). This is the home `visual_style.md` § Motion points to for R3c.

**The problem.** After an eval the feed updates instantly. The user can't tell what is new, what was archived, or what changed — and **pure motion doesn't fix it**, because the animation has finished by the time the user looks back. So the signal must _linger_.

**Design decisions (2026-06-18, interactive):**

1. **Motion + a lingering "New" marker, cleared on acknowledgement.** Not motion-alone (misses a user who glanced away), not an auto-fade timer (same gap). The marker persists until acknowledged.
2. **One marker for new-_or_-changed.** A card that is brand-new and a card whose observation text/severity was refined by re-eval both carry the same quiet **"New"** marker — no separate "Updated" state. (Simpler; the reconciliation diff R3 already computes tells us _whether_ a card is new-or-changed; we don't need to fork the label.)

**Enter (new-or-changed cards):**

- A new card animates in with the standard reveal — fade + small `translateY` — using `--dur-base`/`--ease-out`, `transform`/`opacity` only. The existing batched-arrival path (`SidecarFeed.tsx:238`, "+N new" when ≥3 land at once) is **kept and generalised**: single/few arrivals get the same per-card enter, not just batches of 3+.
- The card carries a quiet **"New" marker** (a small `--text-label` tag or a brand-accent dot — `visual_style.md` brand, not semantic, since it's meta not a defect) that **persists until acknowledged**. Acknowledged = the card is hovered/focused **or** scrolled into view **or** a subsequent eval runs (whichever first). On acknowledgement the marker fades out (`--dur-fast`, opacity).
- "Changed" cards (persisted across the eval but text/severity refined) get the same enter-less in-place treatment: they do **not** re-animate position, but they **do** gain the "New" marker so the eye is drawn to re-read them.

**Exit (archived / resolved / removed cards):**

- A card leaving the active feed (reconciliation marked it resolved/superseded/removed, or the user dismissed it — C3) animates out via **collapse + fade** (`--dur-base`/`--ease-in-out`, height/opacity) rather than vanishing, so the user perceives the removal. C3's dismiss already calls for this; R3c provides the shared exit so eval-driven removals and user dismissals look identical.
- Exit completes before the layout below settles (no instantaneous reflow jump).

**Movement (deliberately minimal).** The feed renders in **document order, not priority order** (`feedBudget.ts` — display order is stable; priority governs only membership). So a card does **not** re-rank mid-session from a priority change — it only moves if the _document_ reorders. UX-007's "moved due to priority" is therefore largely a non-event by design; we do **not** add FLIP move-animation in v1. If a card does shift because the doc changed, the standard enter/exit covers the add/remove; genuine positional reflow is left to a later refinement (don't pre-build).

**Reduced motion + a11y:** every enter/exit collapses to a ≤150ms opacity change or instant under `prefers-reduced-motion` (Consistency rules). The "New" marker is **not** motion-dependent — it's a static visible tag — so reduced-motion users still get the change signal (it just doesn't animate in/out). The marker is conveyed by text/shape, not colour alone.

**Testids:** keep `arrival-indicator` (the "+N new" batch element); add `obs-new-marker` on the per-card marker so acceptance tests can assert it appears on new-or-changed cards and clears on acknowledgement.

### R7b — Scanning & interaction affordances (spec, settled 2026-06-18)

Owns UX-008 (quoted-text subtitle), UX-006 (reverse hover text→card), UX-009 (distant-contradiction split-context). Build-ready spec; lands as its own milestone on the contracts above. The basic auto-scroll for UX-009 is already the **C2** contract; R7b adds the _new_ affordances. Decisions settled 2026-06-18 (interactive).

#### UX-008 — Quoted-text subtitle on cards

- **What:** a small quote of the referenced span renders on the card as a subtitle, so the user knows what the observation is about **without** hovering and looking at the editor (reduces eye-travel).
- **Source (settled):** the **stored `anchorText` snapshot** already on the Observation (`db.ts:78`) — the same field the archive ghost-anchor uses. No live span re-resolution; consistent with the archive, zero new resolution logic. It can go mildly stale between evals, but reconciliation supersedes/refreshes the card when the span changes, so the snapshot tracks closely enough.
- **Placement & style:** slots **between the type tag and the body** (the C4 anatomy reserves this slot). Render as the user's own words quoted back — `--font-serif` italic, muted (`--color-ink-2`), the same typographic treatment as the archive ghost-anchor quote (`visual_style.md` § Supporting surfaces). Truncate to ~one line (~80–100 chars) with an ellipsis; the full span is reachable by hover/click (C1/C2).
- **Doc-scope cards** (`missing_topic`, `structure_flow`, `audience_mismatch`, doc-scope `underexposed_topic`) have no `anchorText` → **no quote**; show the quiet **"Whole document"** label instead (consistent with the C6 doc-scope affordance).
- **Contradiction cards** show the **primary** span's `anchorText` as the subtitle; the _conflicting_ span is reached via UX-009 below, not a second subtitle.

#### UX-006 — Reverse hover (text → feed "focus mode")

Bidirectional completion of C1: hovering/focusing a highlighted **span in the editor** surfaces its observation(s) in the feed. The behaviour is a transient **focus mode**, not just a card highlight:

- **On hover/focus of a span decoration:** resolve every observation anchored to that span — the aggregated group card, plus (for a `contradiction`/`strategic_tension`) the card whose _conflicting_ span is the hovered one. Then:
  - The **related card(s) rise to the top of the feed** and stay fully opaque / emphasised (the C1 active treatment — `--elev-active` + `--color-border-strong`).
  - **All unrelated cards fade to translucent** (reduced opacity), receding so the related card is the clear focus — a spotlight.
- **On hover/focus end:** everything **restores** — cards return to their document-order positions and full opacity. The whole effect is interaction-scoped and reversible.
- **Channel (C1 invariant):** this **reuses and extends `hoveredObservationId`** — introduce a `focusedSpanKey` (or a derived set of related observation ids) so the two hover directions (card→span and span→card) drive one shared state and can never disagree. The reverse direction sets the same active card(s) the forward direction would.
- **Why a transient reorder is allowed** despite "feed stability is sacred" (`message_generation_workflow.md` §8): stability forbids _persistent_ reshuffling between evals. This reorder is **ephemeral, user-initiated, and fully restores on release** — it's a lens, not a re-rank. Document the distinction so the build doesn't mistake it for a budget/priority change.
- **Reduced motion / a11y:** under `prefers-reduced-motion`, skip the animated rise/reflow — apply the opacity emphasis (related opaque, others translucent) **instantly** without animating position, or omit the reflow entirely and rely on opacity alone. Keyboard focus on a span triggers the same focus mode (hover and focus equivalent). Translucency is never the _only_ signal — the related card also takes the active border/elevation.

#### UX-009 — Distant-contradiction floating peek

C2 already scrolls to a card's span and pulses it. The gap is **comparing two distant conflicting spans at once**. Settled v1: a **floating peek of the other span** (not a full split-view).

- **Trigger:** activating a `contradiction` card (click/Enter, C2) whose two spans **cannot both fit in the viewport**. (If both already fit, C2's scroll+dual-pulse suffices — no peek.)
- **Behaviour:** scroll to span A (C2) and render span B's text in a small **floating peek/portal** anchored near span A, so the user reads both without losing place. The peek shows the stored **`conflictingAnchorText`** (no live resolution) plus a quiet **"jump to this passage"** control that scrolls span B into the main view (and would then peek span A).
- **Dismissal:** on `Escape`, blur, or scrolling away. One peek at a time.
- **Positioning:** float near the active span with flip-on-overflow (same rule as the R7a tooltip); never covers span A's own text.
- **Reduced motion:** the peek appears instantly (no slide); the C2 scroll honours reduced-motion (instant).
- **Deferred:** a true side-by-side **split editor view** is explicitly **not** v1 (heaviest build, most intrusive to the single-canvas model) — revisit post-traction if the peek proves insufficient.
