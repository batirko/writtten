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
- [x] **Dismiss + Undo toast** — **built.** Dismiss is optimistic (the card animates out via the R3c `cardExit`), then a transient "Dismissed · Undo" toast rides the bottom of the feed column (`.undo-toast`, sticky, ~3s auto-fade). Undo restores the whole group (`reactivateObservation`, same ids, no archive churn) **and** rolls back each dismissal suppression (`deleteDismissalSuppression`, `db.ts`) so an accidental dismiss never silently trains the feed quieter (G1). `handleDismissObservation` now returns the suppression id it wrote so the toast can reverse it; the group dismisses as one unit and Undo reverses them together. See `docs/mechanics/dismiss_undo.md`. (§ C3)
- [ ] **Card anatomy ordering** — confirm the DOM order matches the visual_style card spec (impact dot → tag → dismiss; body; "also noticed"); the quoted-text subtitle is R7b/UX-008, not built here (§ C4).
- [ ] **Two-drawer contract** — distinguish and document the per-card group drawer (`expanded`, "N more on this passage") from the feed-level budget drawer (`showAlsoNoticed`, "also noticed"); consistent toggle affordance, `aria-expanded`/`aria-controls` (already present), token-driven reveal (§ C5).
- [ ] **Document-scope hover** — doc-level observations (no span) show the "whole document" affordance on hover instead of a span highlight (§ C6); verify it's distinct and calm.
- [x] **Highlight density / auto-highlight decision (§ C7)** — **settled 2026-07-06 (option a′, gentle always-on).** Surfaced spans stay tinted at rest but much fainter (~4–6% wash vs. the old 10–15%); the strong lift now lives on interaction (the `.obs-highlight-hovered` 22–30% boosts), a ~4–5× contrast jump on hover. Discoverability survives without the marked-up feel. Pure `styles.css` change — `ObservationHighlighter.ts` logic (`showMark = surfaced || isHovered || isPulsing`) is unchanged, so dual-span contradiction/`strategic_tension` behaviour is preserved verbatim. Options (b) on-interaction and (c) user-toggle were declined (b risks the feed feeling disconnected from the text; c adds a setting to a zero-config product).
- [ ] **Consistency pass** — one hover/transition language across all of the above: only the visual_style `--dur-*`/`--ease-*` tokens, `transform`/`opacity` only, reduced-motion honored (§ Consistency rules).

### Field-discovered refinements (2026-07-07 session)

Three interaction defects surfaced in real use, all against the shipped mechanics (the "UI/UX mechanics pass" milestone is `[x]`, so these are follow-ups). Captured here; scheduled as their own Phase-6 milestones in `docs/plan.md`.

- [ ] **C8 — Span→card reachability / pin-on-click** — dwelling on a span floats its card, but the float is hard to _reach_: it jumps or closes when the pointer travels toward it, so an in-card affordance (notably the folded "N more on this passage" drawer, C5) can't be opened. Fix direction (user steer): **clicking a highlighted span pins its card** as a persistent peek. Decision open (§ C8).
- [ ] **C9 — Overlapping / co-located-highlight targeting** — one root cause, two symptoms: reverse hover resolves a single `data-obs-id` per hovered point, so **(i)** a substring covered by a _different_ (nested) highlight primes only the outer/bigger card, and **(ii)** when _several_ observations cover the **same** span (e.g. one claim in multiple contradictions — screenshot 2026-07-07), hovering primes only **one** of their cards. Hovering should target _all_ observations covering the point (and, for nesting, prefer the most-specific) (§ C9).
- [ ] **Mid-sentence quote: ellipsis prefix, no forced capital (UX-008 refinement)** — the `.card-anchor` quote reads as a standalone capitalized sentence even when it's a mid-sentence excerpt; a mid-sentence quote should lead with `…` and not force a capital first word (§ UX-008 note).
- [ ] **C10 — Drop the redundant canvas focus outline** — the keyboard-first pass left a full-canvas sky-blue focus ring (`.tiptap:focus-visible`) that shows during normal writing; it's redundant with the caret and visually noisy. Remove for the writing case; keep keyboard-into-editor discoverability in mind (§ C10).

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

#### C3 — Dismiss + Undo (the destructive gesture, made safe) — BUILT

**Shipped — in-place placeholder, deferred commit (reworked 2026-07-06).** The first cut used one shared `.undo-toast` at the **bottom** of the feed; field feedback found that spatially disconnected (hard to link to the dismissed card, a mouse trek to reach) and it collapsed a run of dismissals into one affordance. Superseded: dismissing a card now replaces it **in place** with a dashed "ghost slot" (`.observation-card-dismissed`, `[data-testid="undo-placeholder"]`) reading "Dismissed · Undo", so the Undo sits exactly where the card was and **each dismissal gets its own placeholder**. The commit is **deferred** — the observation stays live until the placeholder fades (~3s, `PENDING_MS`); only then does `App.handleDismissObservation` write the (G1) suppression + flip status. **Undo is a pure local cancel** (`handleUndoPending`): nothing was written, so nothing to roll back — which *strengthens* the flattery guard (an undone dismiss never suppresses). The pending map is keyed by span coords (stable across re-rank), not `group.id`. The old `.undo-toast` / `handleRestoreDismissed` / `deleteDismissalSuppression` machinery was removed. `showMark`/highlight path untouched. Behavioural spec: `docs/mechanics/dismiss_undo.md`. The design contract below is otherwise unchanged (only the toast's *placement/commit-timing* changed, not the gesture's intent).

- The dismiss button is a quiet ghost affordance in the card header, strengthening on card hover/focus (visual_style). One click dismisses — **no confirm dialog** (a confirm reads as distrustful and slows the most frequent gesture).
- Dismiss is **optimistic**: the card animates out immediately (R3c exit choreography / motion tokens), and a transient toast appears: **"Dismissed · Undo"** (copy per emotional_register — terse, no praise/apology). Auto-dismisses after ~3s.
- **Undo restores the observation to the feed _and rolls back the suppression record_** written on dismiss. This is the load-bearing detail: dismissing a high-severity defect/contradiction writes a (span-scoped, per G1) suppression; an accidental dismiss must not silently train the feed quieter. Undo is the cheap correction. (Build: the dismiss action must return enough to reverse both the lifecycle state change and the suppression write — coordinate with G1 in `philosophy_guardrails.md`.)
- Only one Undo toast at a time; a second dismiss replaces the first (the first's dismissal stands).
- Long-term recovery still lives in the **archive** (un-dismiss from there); the toast is the _immediate_ correction, the archive is the _record_.

#### C4 — Card anatomy & ordering

> **Restructured by `docs/projects/feed_surface.md` § Card execution (2026-07-05).** The left-border impact stripe is removed; kind×severity is carried by a colour-filled **type-tag** + the `HIGH`/`MED`/`LOW` label. The header becomes: type-tag (colour carrier) + impact label · dismiss. The rest of this contract (ordering discipline, the R7a tooltip reachability, the R7b subtitle slot) is unchanged. The other contracts on this page (C1/C2/C3/C5/C6/C7, R3c, R7b) are **not** affected by that redesign — it reuses them verbatim.

Ordering is fixed by `visual_style § Observation card` **as revised by `feed_surface.md`** (kind×severity = colour-carrying type-tag, no left-border; header = type-tag + impact label + dismiss; body; "also noticed"). This pass only enforces that the DOM matches that order and that the impact label's tooltip (severity/confidence, R7a) is reachable. The **quoted-text subtitle** (show the anchored text on the card, UX-008) is **R7b** — not added here; when added it slots between tag and body.

#### C5 — The two drawers

Two distinct overflow mechanisms, kept visually and behaviourally consistent (same toggle affordance, same reveal motion, both with `aria-expanded`/`aria-controls`):

- **Per-card group drawer** (`expanded`) — collapses _same-span_ aggregated observations ("N more on this passage", obsAggregation). Lives inside one card.
- **Feed-level budget drawer** (`showAlsoNoticed`) — collapses observations below the calm-feed budget ("also noticed"). Lives at the bottom of the feed.

Both use the visual_style reveal (slide+fade, `--dur-base`/`--ease-out`, reduced-motion → instant). The toggle chevron and label style are identical so the user learns one "expand" gesture.

#### C6 — Document-scope hover affordance

Doc-level observations (`missing_topic`, `structure_flow`, `audience_mismatch`, doc-scope `underexposed_topic`) have no span. On hover/focus they show a subtle **"whole document"** affordance (per features.md → Anchoring) rather than a span highlight — e.g. a calm edge indication on the editor column, not an alarm. Distinct from span highlights; never a full-canvas flash.

#### C7 — Highlight density / auto-highlight (SETTLED — a′ gentle always-on, 2026-07-06)

**Resolution: option (a′), a gentler always-on.** After a prototype-to-taste review, the at-rest wash was dropped to ~4–6% (from 10–15%) across the five `.obs-highlight-<type>` rules in `styles.css`, while the `.obs-highlight-hovered` boosts (22–30%) and the pulse animation stay untouched — so the canvas is calm at rest but a hovered/activated span lifts sharply (~4–5×). The `ObservationHighlighter.ts` logic is unchanged (`showMark = surfaced || isHovered || isPulsing`), so surfaced-only highlighting (#53), transient "also noticed" hover marks, and the dual-span contradiction/`strategic_tension` behaviour all carry over verbatim. The historical decision framing is preserved below.

**Today, every active span observation is highlighted _persistently_** — `ObservationHighlighter` decorates all `scope === "span" && status === "active"` observations on every rebuild (`ObservationHighlighter.ts`), and hover only _intensifies_ via `obs-highlight-hovered` (`styles.css`). So C1's "hover highlights" is really "hover boosts an already-on highlight." On a doc with many active observations the canvas can read as **busy/marked-up**, which sits in tension with the calm-editorial canvas (`visual_style`) and the "your text is yours" stance.

The decision (unresolved — settle in this pass):

- **(a) Keep always-on** — every active span tinted by default; hover boosts. Maximally discoverable (the user sees there's something to look at), but can feel like markup on a dense doc.
- **(b) Highlight-on-interaction** — spans are _un_-highlighted at rest; a span lights up only when its card is hovered/focused (and the reverse, R7b/UX-006, when built). Calmest canvas; risk that observations feel "hidden" and the user doesn't realize the feed maps to text.
- **(c) User toggle** — a quiet control ("show highlights: always / on hover") defaulting to one of the above. Honest, but adds a setting to a deliberately zero-config product (cross-ref the R2c smart-feed-vs-manual-control tension).

**Recommendation (for debate, not decided):** default to a _gentler always-on_ (much lower-contrast at-rest wash than today, strong boost on interaction) so discoverability survives without the marked-up feeling; reserve a toggle for later only if dogfooding shows the at-rest wash still distracts. Whatever is chosen, it must honor the contradiction/strategic_tension dual-span behaviour (C1) and the visual_style highlight tokens. → tracked on the **UI/UX mechanics pass** milestone in `docs/plan.md`.

### Field-discovered refinements (2026-07-07) — C8 · C9 · C10

Three defects observed in real use, all sitting on top of the shipped mechanics above (UX-006 reverse hover, the overlapping-decoration highlighter, and the keyboard-first a11y outline). They are refinements, not rebuilds; each is scheduled as its own Phase-6 milestone.

#### C8 — Span → card reachability (pin-on-click)

**The problem.** Reverse hover (UX-006) surfaces the dwelled span's card as a float: `SpanPeek` (`src/sidecar/SpanPeek.tsx`), pinned to the **top of the gutter** so it's always on-screen, with the rest of the feed dimmed. Reaching it is bridged by a **150ms close grace** (`App.tsx:203`) plus the peek's own `onMouseEnter` → `onKeepOpen` (cancels the close). In practice the bridge is too fragile for its geometry: the float sits at the gutter top while the dwelled span can be anywhere in the document, so the pointer must travel a long diagonal to reach it — and on the way it frequently either **(a)** exceeds the 150ms grace (float closes), or **(b)** crosses _another_ highlighted span, which re-arms the dwell for a different id and **swaps the float's content — the "jump."** The concrete cost: a card with a **folded second observation** (the "N more on this passage" group drawer, C5) is nearly impossible to expand, because expanding it requires landing on the float _and_ then clicking inside it, and the hover model keeps yanking it away.

**Fix direction (user steer, 2026-07-07).** Give the span a **stable, non-hover way to open its card**: **clicking a highlighted span pins its card** as a persistent peek — the same `mode: "pinned"` treatment the contradiction peek already uses (`Editor.tsx` — dismiss on Escape / click-away / ×, _not_ on pointer-leave). Once pinned, the pointer can travel freely and the folded drawer becomes trivially openable. This reuses the pinned-peek channel rather than inventing a new surface.

**Settled 2026-07-07 — build (a) click-to-pin; (b)/(c) deferred.**

- **(a) Click-to-pin the span's card** _(chosen)_ — a click on a highlighted span pins its group card as a persistent `mode:"pinned"` peek (dismiss on Escape / click-away / ×), giving a stable target for the folded drawer. Reuses the pinned contradiction-peek machinery; leaves the 600ms dwell→transient-float as the lightweight glance. **Caret-safety rule (build):** pin **on `click` (pointer-up) only when the gesture did not start/extend a selection** (`view.state.selection.empty` and no drag between down/up), and only when the pointer-up target is inside a `.obs-highlight[data-obs-id]`. Ordinary click-to-place-caret and text selection are untouched; a plain click that lands on a highlight both places the caret _and_ pins the card (the two don't conflict). If multiple observations cover the click point, pin the set resolved by C9 (most-specific primary).
- **(b) Anchor the float near the span + widen the grace** _(deferred)_ — would render `SpanPeek` adjacent to the dwelled span so travel is short; sacrifices the "gutter-top → always on-screen when scrolled" property (§ R7b UX-006) and gives no _persistent_ target. Not needed once (a) provides a pinned target; revisit only if the transient dwell-float still feels fiddly after (a) ships.
- **(c) Both** _(deferred)_ — the union of (a)+(b); pin alone is expected to suffice.

**Invariants.** No fix-application affordance. Reuse the existing `hoveredObservationId` / `spanFocusObsId` / pinned-peek state — the two hover directions must stay unified (C1). Keyboard path: ProseMirror inline-decoration spans aren't tab-focusable, so the card→span direction already serves keyboard users; click-to-pin is a mouse enrichment, not the a11y path.

#### C9 — Overlapping / co-located-highlight targeting

**One root cause, two symptoms.** Reverse hover resolves the dwelled span with `closest(".obs-highlight[data-obs-id]")` (`Editor.tsx:936`), which walks up to the **nearest ancestor highlight element** and reads **exactly one** `data-obs-id`. So whenever more than one observation decorates the same text, only one card can prime:

- **(i) Nested / substring.** A highlighted span **contains a substring** that a _different_ observation also highlights (overlapping / nested inline decorations); hovering the overlap primes only the **outer (bigger)** observation's card. The substring's own card can't be reached from the text.
- **(ii) Co-located (multiple cards, same span).** _Several_ observations cover the **same** span, so the feed shows several cards for it — most visibly a claim that participates in **multiple contradictions** (the 2026-07-07 screenshot: "Push notification arrives within 10 seconds…" is one side of three separate contradiction cards, each its own group because grouping keys on `blockId:startOffset:endOffset` and each contradiction's other side differs). Hovering the shared span primes only **one** of the three cards. (Note: truly identical-span observations _do_ aggregate into one group — `groupObservations`, `obsAggregation.ts:44` — so this symptom is specifically observations whose spans _coincide but aren't identical_, e.g. the same text is the `blockId` side of one contradiction and the `conflictingBlockId` side of another.)

**Root-cause hypotheses (confirm at build):**

- **(a) The substring observation is downgraded** ("also noticed", outside the feed budget) → it renders as an **invisible anchor** with no `obs-highlight` class (`showMark = surfaced || isHovered || isPulsing`, `ObservationHighlighter.ts:211`). So `closest(".obs-highlight[data-obs-id]")` **skips it** and lands on the visible outer span. This fits "always only the bigger highlight was primed" if the bigger one is the surfaced/visible one.
- **(b) Decoration overlap DOM/attribute collision** — where two inline decorations overlap, ProseMirror may render a single element for the overlap region; a single `data-obs-id` attribute can't hold two ids, so one wins (likely the outer/earlier).
- **(c) `closest` returns an ancestor, not the most-specific mark** — even with correct nesting, the first `.obs-highlight` ancestor may be the outer wrapper depending on render order.

**Fix direction.** Collect **every** observation whose decoration covers the hovered coordinate (not just the first `closest` ancestor), then:

- **(ii) Co-located:** prime **all** their cards — the reverse-hover focus mode (UX-006) already surfaces one card; extend it to surface/emphasise the whole set covering the point (e.g. resolve a _set_ of ids at the position, drive the highlight + card emphasis for each). A hovered span that is one side of N contradictions should light up all N cards.
- **(i) Nested:** where the covering set nests, **prefer the most-specific** (innermost / smallest span) as the primary while still exposing the others — so hovering the substring reaches _its_ card.

If a target is a downgraded substring (hypothesis a), the surfaced-only reverse-hover invariant (R7b/UX-006) must still allow it to be _targeted_ — e.g. treat a directly-hovered invisible anchor as hoverable, or ensure the substring carries a resolvable id at the hovered coordinate. Preserve cross-claim dual-span behaviour (C1) and the delete-detection anchor spec (`data-obs-id` on `spec`, `ObservationHighlighter.ts:223`).

**Confirmed approach (2026-07-07, build-ready).** Stop reading a single ancestor id off the DOM; resolve the covering set from **model state at the hovered position**:

1. In the dwell handler (`Editor.tsx`), map the pointer to a document position — `view.posAtCoords({left,top})` (fall back to `posAtDOM` on the highlight element). Call it `pos`.
2. Resolve **all** active span observations whose anchored range covers `pos`: for each obs with `scope==="span"`, map its `(blockId,startOffset,endOffset)` (and, for cross-claim, `conflictingBlockId`) to PM positions the same way the highlighter does, and test `from ≤ pos ≤ to`. (Reuse the highlighter's offset→pos mapping so hit-testing and rendering can't disagree.) This inherently includes **downgraded invisible-anchor** substrings — they still carry a resolvable range even with no visible class — fixing hypothesis (a) without making them visible at rest.
3. **Primary = most-specific:** pick the covering obs with the **smallest `(to−from)` range** as the primary (innermost/substring wins); the rest are the co-covering set.
4. Drive the existing channels for the **whole set**: set `hoveredObservationId`/`spanFocusObsId` to the primary, and emphasise every co-covering card (extend the reverse-hover focus mode to accept a _set_ of related ids rather than one). Forward hover (card→span) is unchanged; the two directions still share `hoveredObservationId` (C1 invariant) — the reverse direction just resolves a set and names the primary.

This is a pure hit-testing change on the reverse (span→card) path; no new decorations, no schema change. Preserve the cross-claim dual-span behaviour (a contradiction's two ranges both count as covering their side) and the delete-detection anchor spec. Bumps C9 to build-ready (🟢); the earlier "needs a root-cause confirm" is now specified — the confirm is step 2 (the downgraded-invisible-anchor case, hypothesis a) plus a check that overlapping PM decorations don't collapse the id (hypothesis b), both observable in a two-overlapping-obs fixture.

**Not owned here:** whether two _distinct_ overlapping observations should also both be _visible_ at rest (that's the C7 density call and the surfaced-budget rule) — C9 is only about which card(s) the **pointer targets** when they overlap or coincide.

#### UX-008 note — mid-sentence anchor quote (ellipsis + no forced capital)

**The problem.** The `.card-anchor` quote (UX-008) renders `“{anchorText}”` verbatim (`SidecarFeed.tsx:194`; no CSS `text-transform`). For **span** checks `anchorText` is the exact source substring (`obs.substring`), but for **contradiction / strategic_tension** it's the model-normalized **claim text** (`a.text` / `con.newClaimText`, `evaluator.ts:977`/`:567`) — a standalone, capitalized clause. So a card quoting a fragment of a longer sentence reads as its own capitalized sentence, which looks **redundantly capitalized** and hides that it's an excerpt.

**Fix direction.** When the quoted anchor is a **mid-sentence excerpt**, lead with `…` and don't force a capital first word — i.e. render `“…push notification arrives within 10 seconds…”` rather than `“Push notification arrives within 10 seconds…”`.

**Settled 2026-07-07 — store a verbatim excerpt (option c).** The card should quote the user's **actual words**, not the normalized claim, so a mid-sentence excerpt can be shown faithfully with a leading `…`. Build:

- **Source the verbatim span from the claim's existing anchor offsets.** Contradiction/tension claims already carry optional anchor coordinates (`anchorBlockId` / `anchorEndOffset`, used by the highlighter — see OBS-032). When present, derive the verbatim excerpt by slicing the anchored block's flat text at those offsets and **persist it on the observation** as a dedicated field (e.g. `anchorQuote`) distinct from `anchorText` (which stays the normalized claim used for matching/suppression — don't repurpose it). This **reuses OBS-032's "anchor to the right (body) span" work**, so sequence C-after/with OBS-032.
- **Fallback:** when a claim has no usable anchor offsets (whole-block `0:9999`), keep quoting the normalized `anchorText` (no verbatim available) — degrade to option (a) for that card only.
- **Render:** the card quotes `anchorQuote ?? anchorText`; prefix `…` when the excerpt starts mid-sentence (its start offset isn't at a sentence boundary in the block), don't force-capitalize the lead, and append `…` on truncation. Span checks already have a verbatim `anchorText` (`obs.substring`), so they get the same mid-sentence treatment with no new field.

Scope note: this is **no longer a pure card-render change** — it adds an observation field + an emit-time excerpt derivation (small, offset-slice; no prompt/re-record needed since it reads offsets we already compute). DB field addition (migration). Couples with OBS-032.

#### C10 — Drop the redundant canvas focus outline

**The problem.** The keyboard-first / tabbable a11y pass added `.tiptap:focus-visible { outline: 2px solid #0ea5e9; outline-offset: 8px }` (`styles.css:1827`), which paints a sky-blue ring around the **entire writing canvas** whenever it's focused. For a `contenteditable`, keyboard interaction makes it `:focus-visible` essentially **the whole time the user is writing**, so the ring is almost always on. It's **redundant** (the text caret already signals focus) and reads as chrome against the calm editorial canvas (`visual_style`).

**Fix direction.** Remove the canvas-wide focus ring for the normal writing case — a text editor's caret is the conventional, sufficient focus signal, and `:focus-visible` on a large `contenteditable` is an anti-pattern.

**Settled 2026-07-07 — remove the ring entirely (option a).** Delete the `.tiptap:focus-visible` outline (`styles.css:1827`); rely on the text caret as the focus signal, as most editors do. The considered alternatives — (b) a subtler keyboard-only edge tint, (c) show-on-tab-in-then-fade — were declined: the caret is a sufficient, conventional signal and a large `contenteditable` shouldn't carry a `:focus-visible` ring at all. Accepted a11y trade: a minor WCAG 2.4.7 tab-in-moment regression (the editor no longer flashes a ring when tabbed into) — acceptable because the caret appears and the editor is the dominant surface. Pure `styles.css` change (Visual lane, runs solo). Leaves the global `:focus-visible` rule (`styles.css:1816`) and the discrete-control rings (buttons, cards, handles) intact — this is only about the canvas.

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

**Shipped.** `.card-anchor` renders between the type tag and the body: span cards quote the stored `anchorText` (`--font-serif` italic, `--color-ink-2`, one-line ellipsis, full text on `title` hover). When there is no `anchorText` to quote, the subtitle is simply **absent** — only the message shows (the earlier "Whole document" doc-scope label was dropped 2026-07-05 as redundant chrome; the type tag already signals doc scope). Tested in `src/sidecar/SidecarFeed.test.tsx` (UX-008).

- **What:** a small quote of the referenced span renders on the card as a subtitle, so the user knows what the observation is about **without** hovering and looking at the editor (reduces eye-travel).
- **Source (settled):** the **stored `anchorText` snapshot** already on the Observation (`db.ts:78`) — the same field the archive ghost-anchor uses. No live span re-resolution; consistent with the archive, zero new resolution logic. It can go mildly stale between evals, but reconciliation supersedes/refreshes the card when the span changes, so the snapshot tracks closely enough.
- **Placement & style:** slots **between the type tag and the body** (the C4 anatomy reserves this slot). Render as the user's own words quoted back — `--font-serif` italic, muted (`--color-ink-2`), the same typographic treatment as the archive ghost-anchor quote (`visual_style.md` § Supporting surfaces). Truncate to ~one line (~80–100 chars) with an ellipsis; the full span is reachable by hover/click (C1/C2).
- **Doc-scope cards** (`missing_topic`, `structure_flow`, `audience_mismatch`, doc-scope `underexposed_topic`) have no `anchorText` → **no subtitle at all**; the card shows just its message. (The type tag already carries the doc-scope signal, so a separate "Whole document" label was redundant.)
- **Contradiction cards** show the **primary** span's `anchorText` as the subtitle; the _conflicting_ span is reached via UX-009 below, not a second subtitle.

#### UX-006 — Reverse hover (text → feed "focus mode")

**Shipped** (collapse-aware — extends the spec below, which predated the collapsible feed; the "rise to top" reorder in that spec was **superseded by a float** after field testing — see below). A **dwell guard** gates it: the pointer must rest on a highlighted span for `SPAN_HOVER_DWELL_MS` (≈600ms, `Editor.tsx`) before anything surfaces, so a mouse merely crossing the document fires nothing; a fast sweep across several spans surfaces none. The editor emits the dwelled span's `data-obs-id`; `App` resolves it to the rendered card via `findGroupForObs` (`obsAggregation.ts`) and drives two channels — `hoveredObservationId` (shared with forward hover: lights span + card) and `spanFocusObsId` (span-origin only).

**Highlight = surfaced only.** Only observations inside the feed budget (`surfacedObservationIds`, `feedBudget.ts`) get a visible canvas highlight; downgraded "also noticed" ones render an **invisible anchor** (a decoration carrying the obs id so delete-detection still fires, but no `obs-highlight` class → no mark, not reverse-hoverable). Highlight-presence is the visible differentiator between a surfaced and a downgraded observation — and it guarantees every hoverable span maps to an on-screen-able card.

**One float, both feed states** (revised from the original reorder). On dwell, **every feed card dims in place** (`observation-card-dimmed`, 32%) — no reorder — and the focused group's card is surfaced by the floating `SpanPeek` (`.span-peek`) pinned to the **top of the gutter**, rendered by the same `GroupedObsCard`. Because it's `position: fixed` at the gutter top it's always on-screen even when the feed is scrolled (the "rise to real top → off-screen" problem the reorder had). Collapsed (`width:0`) it's the only thing shown; open, it floats over the dimmed column. A **hover-bridge** (150ms close grace in `App`, cancelled on the peek's `mouseenter`) lets the pointer travel from span onto the float to read/dismiss it.
- **Deferred:** keyboard span-focus equivalence — ProseMirror inline-decoration spans aren't tab-focusable; the forward card→span path already serves keyboard users.

Bidirectional completion of C1: hovering/focusing a highlighted **span in the editor** surfaces its observation(s) in the feed. The behaviour is a transient **focus mode**, not just a card highlight:

- **On hover/focus of a span decoration:** resolve every observation anchored to that span — the aggregated group card, plus (for a `contradiction`/`strategic_tension`) the card whose _conflicting_ span is the hovered one. Then:
  - The **related card(s) rise to the top of the feed** and stay fully opaque / emphasised (the C1 active treatment — `--elev-active` + `--color-border-strong`).
  - **All unrelated cards fade to translucent** (reduced opacity), receding so the related card is the clear focus — a spotlight.
- **On hover/focus end:** everything **restores** — cards return to their document-order positions and full opacity. The whole effect is interaction-scoped and reversible.
- **Channel (C1 invariant):** this **reuses and extends `hoveredObservationId`** — introduce a `focusedSpanKey` (or a derived set of related observation ids) so the two hover directions (card→span and span→card) drive one shared state and can never disagree. The reverse direction sets the same active card(s) the forward direction would.
- **Why a transient reorder is allowed** despite "feed stability is sacred" (`message_generation_workflow.md` §8): stability forbids _persistent_ reshuffling between evals. This reorder is **ephemeral, user-initiated, and fully restores on release** — it's a lens, not a re-rank. Document the distinction so the build doesn't mistake it for a budget/priority change.
- **Reduced motion / a11y:** under `prefers-reduced-motion`, skip the animated rise/reflow — apply the opacity emphasis (related opaque, others translucent) **instantly** without animating position, or omit the reflow entirely and rely on opacity alone. Keyboard focus on a span triggers the same focus mode (hover and focus equivalent). Translucency is never the _only_ signal — the related card also takes the active border/elevation.

#### UX-009 — Distant-contradiction floating peek

**Shipped (#51), and it landed the C2 contract with it** (which was unbuilt: cards were keyboard-only, the handler scrolled the primary span only, no pulse). Now **clicking any card** (guarded so the dismiss X / "N more" toggle keep their own behaviour) scrolls to its span and fires a one-shot pulse (`obs-highlight-pulse` via the highlighter's `setPulseObsId` meta channel + the `obsPulse` keyframe); a `contradiction`/`strategic_tension` **dual-pulses both spans**. Fit is decided by the pure `bothSpansFit(aTop, bTop, viewportH, 0.85)` (`src/editor/spanFit.ts`) over `coordsAtPos` tops. When the two spans **can't** share the viewport, `ContradictionPeek` (`src/editor/ContradictionPeek.tsx`, `.contradiction-peek`) floats a serif-italic quote of the **far** span under the near one (flipping above on viewport overflow via measured `coordsAtPos`, SlashMenu-style), with a bidirectional **Jump** that scrolls to the far span and re-quotes the near one. Dismiss on Escape / wheel / touchmove (user-scroll gesture, not the programmatic `scroll` our own smooth-scroll emits) / the × control. The full **split editor view** stays deferred per spec.

**Also reachable from the text (span-hover glance).** Dwelling (~600ms) on a `contradiction`/`strategic_tension` **span** — not just clicking the card — opens the peek too, so the conflict is comparable from the prose. This is the lighter, `mode: "hover"` variant: it **does not scroll** (you're already on the span), floats a **read-only** quote of the **other** side anchored where the pointer is (hover span A → quote B, and vice-versa; hovered side chosen by `posAtDOM` distance), and is **read-only** — no Jump/× (`.contradiction-peek-hover`, `pointer-events: none`). It fires **alongside** the reverse-hover card float (UX-006) and **both fade on hover-end**. Gated by the same `bothSpansFit` — a nearby cross-claim (both spans on screen) and any non-cross-claim span get the card float only, no peek. The `mode: "pinned"` (card-click) peek above is unchanged — it scrolls and keeps Jump/×.

C2 already scrolls to a card's span and pulses it. The gap is **comparing two distant conflicting spans at once**. Settled v1: a **floating peek of the other span** (not a full split-view).

- **Trigger:** activating a `contradiction` card (click/Enter, C2) whose two spans **cannot both fit in the viewport**. (If both already fit, C2's scroll+dual-pulse suffices — no peek.)
- **Behaviour:** scroll to span A (C2) and render span B's text in a small **floating peek/portal** anchored near span A, so the user reads both without losing place. The peek shows the stored **`conflictingAnchorText`** (no live resolution) plus a quiet **"jump to this passage"** control that scrolls span B into the main view (and would then peek span A).
- **Dismissal:** on `Escape`, blur, or scrolling away. One peek at a time.
- **Positioning:** float near the active span with flip-on-overflow (same rule as the R7a tooltip); never covers span A's own text.
- **Reduced motion:** the peek appears instantly (no slide); the C2 scroll honours reduced-motion (instant).
- **Deferred:** a true side-by-side **split editor view** is explicitly **not** v1 (heaviest build, most intrusive to the single-canvas model) — revisit post-traction if the peek proves insufficient.
