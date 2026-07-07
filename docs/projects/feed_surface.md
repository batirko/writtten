---
status: done
kind: spec
phases: [6]
summary: Reframe the observation feed from a bordered side panel into a summonable "companion surface" — a reflowing column of borderless floating cards, a unified bottom-right control center (actions ← / process ↑), a floating settings modal, an icon-only activity+model indicator, a document-attached context affordance, and an elegant archive. Modernizes the visual and structural execution while preserving the kind×severity information architecture. Consumes the visual_style tokens; reframes the panel/chrome those specs assumed.
---

# Feed Surface — the companion surface

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Done — shipped & merged via #46 (2026-07-05).** Built to this spec, browser-verified across surfaces, and merged to `main`; all § Todo items are `[x]`. This is a **structural** redesign of the observation feed, sitting one layer above `visual_style.md`. Where `visual_style.md` re-skins the _existing_ panel to the token system, this project changes the panel's fundamental shape: the feed stops being a bordered "sidecar" and becomes a **companion surface** — a space of floating elements the document can cede space to or reclaim. It is the direct response to the observation that the feed, even after the token re-skin, still "functions like a dev tool and looks vibecoded."

Decided interactively 2026-07-05 (this session):

1. **Cards float in a shared column** — no panel background, no wall. Each observation is its own borderless surface with shallow elevation; they share an invisible column + consistent gutter so they read as an intentional set.
2. **The column reflows the canvas; it never overlays it.** Summoning the feed makes the canvas cede the gutter; collapsing it returns full editorial measure to the canvas. Both states are first-class — the user writes with observations beside them, or in pure focus, and switches cheaply. (Ambient-collapsible, not slide-over.)
3. **One unified control center, bottom-right, two-axis expansion.** The anchor _is_ the activity/model indicator (meaningful colour; a gentle pulse while working). It expands **← left into actions** (export / import / configure / clear) and **↑ up into process detail** (model, tier, idle/working, session stats). Replaces the row of header icon-buttons and the two status chips.
4. **Settings leave the feed for a floating modal.** Configuration (API key, tier, dev debug) opens a centered floating modal, not an inline panel that pushes the feed around.
5. **Card severity is re-expressed as a coloured type-tag, not a left-border stripe.** The kind×severity signal is preserved in full (it is core product UX — the R7a impact-legibility work); its _execution_ moves from the border stripe (the recognizable "an LLM built this" tell) into a filled/tinted type-tag + adjacent `HIGH`/`MED`/`LOW` label. Card body stays clean paper.
6. **Archive is elegant, not an afterthought** — past-tense, quiet, and legible, matching the floating language.
7. **The design system reserves a seam for future message-filter controls** (all / severe / …) so that curation UI can drop into the control center later without a frankenstein retrofit. No filter UX is built here.

**Direction validated 2026-07-05.** A static taste mock (warm paper serif canvas · sans cards · tag-carries-colour severity · control center docked under the feed column) was reviewed and approved as the direction to build to the fullest. The one correction from that review — the control center must dock _under_ the card column within `--gutter-width`, not form its own rightmost column — is folded into § 2.

**Single-owner consolidation (2026-07-05).** All UI/UX work is now owned as one program under this spec — both what the two in-flight visual-style branches built and what is defined here. `visual_style.md` remains the **token/type/colour/highlight foundation** this integrates; `ui_interaction_mechanics.md` remains the **interaction-contract layer**; this spec is the **integrating build**. The prior parallel-session split is retired: the branch decision below is _decided_, not flagged, and the build proceeds as one sequence (§ Build sequence & branch consolidation).

Read alongside:

- `docs/projects/visual_style.md` — **the token foundation this reuses** (type, colour, spacing, radius, elevation, motion). This project _consumes_ those tokens and _revises_ that file's container/panel component-language and the left-border impact execution (see § Reconciliation). Two visual-style branches (`visual-style/tokens-fonts-editor`, `visual-style/feed-cards-highlights`) land the token/skin layer; this project is the structural layer above them.
- `docs/projects/ui_interaction_mechanics.md` — **the interaction contracts this must honour** (C1 hover→highlight, C2 click→scroll, C3 dismiss+Undo, C5 the two drawers, R3c choreography, R7b focus-mode/peek). Card _anatomy_ (C4) changes here; the hover/scroll/dismiss/animation contracts are unchanged and reused.
- `docs/projects/onboarding_first_run.md` — the empty/quiet state and the context chip. This project **relocates** the context affordance from the feed to the document (see § The context affordance) — a revision to that file's § The context chip.
- `docs/projects/smart_feed_curation.md` — R2c, the future noisiness switch. This project is where its eventual home (the control center) is reserved.

Build-ready against the **Hallmark** editorial genre with modern-minimal structural moves (floating surfaces, an expanding control cluster). Every surface here gets a **static visual prototype validated before implementation** (§ Working norm).

## Phased Plan

| Phase | Contributes |
| ----- | ----------- |
| **6** | The full companion-surface redesign: reflow-column layout + collapse/expand; borderless floating card treatment; the tag-carries-colour severity execution; the unified two-axis control center (folding in the activity/model indicator, export/import/config/clear, and process detail); the floating settings modal; the relocated document context affordance; the elegant archive; and the reserved filter seam. Reuses the visual_style tokens and the ui_interaction_mechanics contracts. Dark-mode values ride on visual_style's deferred dark slice. |

## Todo

Each item is build-scoped and independently verifiable. Anchor files: `src/sidecar/SidecarFeed.tsx` + `src/sidecar/ControlCenter.tsx` + `src/sidecar/DocumentContext.tsx` (feed markup), `src/App.tsx` (layout column + collapse state), `src/styles.css` (tokens + surface CSS). **Lane: Visual (solo)** — rewrites feed markup + styles wholesale; sequence against no other UI lane.

> **Shipped 2026-07-05** on branch `ui/companion-surface-redesign` (built + browser-verified; not yet merged). All items below are done. Canvas serif resolved to **Faustina** (soft-contrast humanist, self-hosted) after the interim sans-only detour; control center **lifted out of the feed** (fixed, always-visible, hover-reveal) after dogfooding; context **document-attached**.

- [x] **Reflow-column layout** — feed slot animates `--gutter-width`→0; canvas reflows to full `--editor-measure` when collapsed. No overlay. Collapse persisted (`App.tsx`).
- [x] **Collapse/expand affordance** — slim edge handle + `⌘\` shortcut; state survives reload; reduced-motion honoured.
- [x] **Borderless floating cards** — panel background retired; cards `--color-surface` on `--color-paper` with token elevation. testids + C1/C2/C3 preserved.
- [x] **Tag-carries-colour severity** — left-border removed; filled/tinted type-tag (HIGH solid / MED tint / LOW outline; contradiction orange, tension teal) + `HIGH/MED/LOW` label. `impact-badge` + R7a popover kept.
- [x] **Unified control center** — fixed bottom-right, always visible; dot anchor, ← actions, ↑ process. Header chips + button row retired. testids preserved. **Reveal:** hover / `:focus-within` on desktop; **tap-to-open on touch** (2026-07-07) — the anchor (`data-testid="control-anchor"`, a 44px target on mobile) toggles `is-open`, tap-outside closes. Added because a phone has no hover, which left Settings (and the BYOK panel behind it) unreachable on iOS.
- [x] **Activity/model indicator** — dot state colour + working pulse (static under reduced-motion); process panel is the hover detail (redundant dot tooltip removed).
- [x] **Floating settings modal** — key / tier / (dev) debug in a shared scrim/modal primitive. testids kept.
- [x] **Context affordance relocation** — moved to the document-attached `DocumentContext` (top of the writing column); onboarding_first_run § The context chip reconciled.
- [x] **Elegant archive** — quiet past-tense cards, desaturated tag, serif ghost-anchor quote; `archive-*` testids kept.
- [x] **Reserved filter seam** — documented un-wired slot in the control-center process axis (`ControlCenter.tsx`); no filter UI shipped.
- [x] **New tokens** — surface tokens added to `:root`; `--color-sidecar` retired.
- [x] **Slop test + prototype sign-off** — every surface prototyped/approved before build; `styles.css` stamped; reduced-motion + print paths hold; dead CSS pruned.

---

## The reframe: sidecar → companion surface

The old model is a **panel**: a fixed-width, background-filled column welded to the right edge, with a header bar of icon-buttons, an inline settings drawer, and cards wearing a coloured left-border stripe. Every one of those is a legible "generic web app" cue.

The new model is a **companion surface**: the document is the interface in its totality; the feed is a set of floating elements the document _makes room for_ when summoned. Nothing is welded; nothing has a wall. The design principles from `visual_style.md` still govern (**the page is for reading**; **two voices, two type families**; **colour is meaning**; **calm over flashy**; **silence is designed**) — this project applies them to the container itself, which the earlier spec left as a panel.

**The one hard rule that shapes everything: the feed reflows the canvas, it never covers it.** A writing tool must never occlude the user's words. So "floating" here means _borderless discrete card surfaces with shallow elevation on the paper gutter_ — **not** a `position:fixed` overlay. Summon = the layout gives the gutter to the feed and re-centers the canvas; collapse = the canvas reclaims the gutter and returns to full measure. The transition animates (transform/opacity, visual_style motion tokens); the end states are both fully usable.

---

## Layout model

Two collapsible regions in one flex row:

- **Canvas** — the hero. When the feed is collapsed, the canvas occupies the full width and centers its prose at `--editor-measure` (~66ch). When the feed is present, the canvas cedes `--gutter-width` on the right and re-centers its column in the remaining space (the measure is preserved; only the surrounding whitespace changes — the prose never squishes below its reading measure).
- **Gutter (the feed)** — `--gutter-width` wide, background `--color-paper` (no panel fill). Holds the floating card column, the archive below it, and nothing else. The control center and context affordance are **not** in this column (see their sections).

**Collapse/expand:** a slim, low-contrast handle sits at the canvas↔gutter boundary (a hairline with a small chevron on hover), plus a keyboard shortcut. Collapse state persists locally per document. Default state is a fork (§ Open forks) — leaning **ambient (feed present) by default**, matching the user's "ambient, collapsible" choice, with collapse a deliberate focus gesture.

**Why not overlay-summon (Stage Manager literal):** Stage Manager floats windows _over_ a desktop because occluding the desktop is fine. Occluding prose is not. The reflow model keeps the "summonable space of floating elements" feel (borderless cards, cheap show/hide) without ever hiding a sentence behind a card.

---

## The four surfaces

### 1. The floating card column

The most-seen component, re-executed. Card anatomy (top → bottom) — a revision of `visual_style.md` § Observation card and `ui_interaction_mechanics.md` C4:

1. **Header row** — left: the **type-tag** (now the colour carrier) + the **impact label** (`HIGH`/`MED`/`LOW`); right: the **dismiss** ghost button (quiet, strengthens on hover — unchanged).
2. **Quoted-span subtitle** (R7b/UX-008, when built) — serif italic, muted; the user's own words quoted back. Slots between header and body.
3. **Body** — sans, `--text-ui`, `--color-ink-2`. Terse (voice governed by emotional_register).
4. **"Also noticed" drawer** (per-card group) — unchanged behaviour (C5), restyled to the floating language.

**Card surface:** `--color-surface`, `--radius-lg`, `--elev-rest`, hairline border, on the paper gutter. Hover: `--elev-hover` + 1px lift. The card whose span is hovered in-editor: `--elev-active` + `--color-border-strong` (the bidirectional contract, C1 — behaviour unchanged). **No left-border colour stripe.**

Enter/exit choreography and the "New" marker are **R3c** (unchanged, reused). The focus-mode reorder and floating peek are **R7b** (unchanged, reused). This project changes only the card's _skin and severity execution_, not its interaction contracts.

### 2. The control center (bottom-right, two-axis)

One anchor, **docked to the bottom of the feed gutter — under the card column, not in a separate rightmost column.** Its footprint stays within `--gutter-width`: at rest it is _just the dot_; the two expansion axes open _inside_ the gutter band (actions fan left across the column's width, process stacks up above the dot), so the control center never widens the layout or claims horizontal space beyond the messages it sits under. (This corrects the first taste mock, where the cluster read as its own column — 2026-07-05.) When the feed is **collapsed**, the dot persists at the bottom-right corner as the minimal, always-available re-summon anchor (export/config/clear must stay reachable in focus mode). Replaces: the header status chip, the provider chip, and the entire header icon-button row (clear / export-menu / import / settings).

- **Anchor = the activity/model dot** (see § 5). Always visible; small; meaningful colour; gentle pulse while working. At rest, the control center _is_ this dot — nothing else shows until hover/focus.
- **← Actions axis** (expands left on hover/click/focus, as a horizontal stack or shallow arc):
  - **Export** — up-and-out icon (leaving the tray). Opens the export/copy menu (Download Markdown · Print/Save PDF · Copy Markdown · Copy Rich Text). _Icon fix:_ the current export/import glyphs are near-identical and read backwards; export is unambiguously the **out** arrow, import the **in** arrow, and both carry text labels on expand.
  - **Import** — down-and-in icon (entering the tray). File picker (.md/.txt), unchanged.
  - **Configure** — gear. Opens the **floating settings modal** (§ 3), not an inline drawer.
  - **Clear** — trash. Opens the existing confirm modal (unchanged safety).
- **↑ Process axis** (expands up on hover/focus of the anchor): a small stack of read-only detail — active **model** + **tier** (paid badge), **idle / evaluating (N pending) / still working…** state, and **session stats** (fast/strong calls, avg latency) in dev. This is "details about the process," surfaced on demand instead of as always-on header chips. In dev, the **debug-log** entry point lives here (opening the log as a floating panel/modal, not an inline feed section).

Expansion is quiet (fade + small translate, visual_style tokens; reduced-motion → instant). Collapsed, the control center is _just the dot_ — minimal chrome, maximal document.

### 3. The floating settings modal

Configuration moves out of the feed. A centered floating modal (reusing the clear-confirm modal primitive, elevated to a proper reusable component with `--color-scrim` backdrop, `--radius-md`, `--elev-float`, focus-trap, `Escape`-to-close). Contents unchanged: Gemini API key, the "capable model (paid tier)" toggle, and — in dev only — the LLM debug-mode toggle. Rationale: settings are an occasional, modal task; hosting them inline made the feed jump and blurred "the AI's observations" with "the app's plumbing." A modal cleanly separates chrome from commentary.

### 4. The document context affordance

The Document Context / Stage field currently lives as a chip at the top of the feed panel (`ContextChip`). Two problems in the new model: (a) if it lives in the feed, it vanishes when the feed is collapsed — yet context **calibrates evaluation** (`document_type_calibration.md`, OBS-028) and should stay reachable; (b) its current three-state inline-textarea execution "reads old."

**Decided 2026-07-05 (prototype-reviewed): document-attached.** Relocate context to a **document-attached metadata affordance** — a quiet line near the document top that reads as the doc's own metadata (e.g. _"PRD · payments team · audience: eng + design"_), editable in place, present regardless of feed state. It reads as _describing the document_, not _configuring the tool_. Keeps the Suggested / Set / Empty states and the inferred-suggestion accept/dismiss (testids preserved), restyled. Chosen over feed-column-top (vanishes on collapse; reads as chrome) and control-center (too hidden for something that calibrates eval). This **revises** `onboarding_first_run.md` § The context chip (feed-panel-top → document-attached); reconcile there when built.

### 5. The activity / model indicator

Folded into the control-center anchor (§ 2) — a single dot, icon-only at first surface:

- **Colour = state:** idle (calm neutral / faint brand), evaluating (amber), stalled (red), with a paid-tier accent when a capable BYO key is active. Colour choices come from visual_style semantic/brand ramps; the amber "working" state must **not** collide with the amber problem-severity semantic — use the brand ramp for process state, keeping semantic amber for observations (the same de-collision discipline visual_style applied to the focus ring).
- **Motion:** a gentle opacity pulse while `pending > 0` (`--dur-pulse`, ease-in-out). Under `prefers-reduced-motion`, no pulse — a static distinct state (e.g. a ring) conveys "working."
- **Detail on demand:** hover/focus shows a small tooltip — model name, tier, and status (idle / N pending / still working) — the content the old `provider-chip` + `sidecar-status` chips carried, now quiet until asked. Keep `data-testid="sidecar-status"` and `provider-chip` on the tooltip/anchor so harness selectors survive.

---

## Card execution — kind×severity without the stripe

The severity **information** is unchanged and load-bearing; only its **rendering** changes. The signal moves entirely into the header:

- **The type-tag is the colour carrier.** The tag (`contradiction`, `clarity`, `strategic_tension`, …) renders as a filled/tinted chip whose colour is the semantic **kind×severity** value from the existing matrix (visual_style § Semantic colour — _not re-tuned_). Weight tracks severity: **HIGH** → a solid/strong fill, **MED** → a soft tint, **LOW** → an outline/muted chip. So a high-severity contradiction's tag is visibly hotter than a low clarity nit's — the exact at-a-glance ranking the left-border gave, now carried by the label the eye already reads.
- **The `HIGH`/`MED`/`LOW` impact label stays** beside the tag (R7a), in the matching semantic colour. Retaining it satisfies the accessibility floor (**severity is never colour-only** — it's also a word) and preserves `data-testid="impact-badge"` + the popover.
- **Confidence stays a hedge** — the low-confidence `~` qualifier on the tag (`[data-confidence="low"]`), unchanged.
- **Card body is clean paper** — no tint, no stripe, no wash. Colour lives only in the header chips, so a column of cards reads as a calm document with small coloured markers, not a barcode of stripes.

This is a pure re-execution: same tokens, same matrix, same `kind`/`severity`/`confidence` data attributes, same testids — a different, considered surface.

> The two card options not taken (whole-card tonal wash; severity glyph on a mono card) are recorded in § Open forks as fallbacks to revisit if the tag-carries-colour prototype reads too subtle at a glance.

---

## Archive — the elegant past

The archive stays a collapsible section below the card column, restyled to read as **past tense**:

- Quiet cards: reduced contrast, **no colour tag fill** (a desaturated / outline tag instead), so archived items visibly recede from the active set. No severity heat — a closed item isn't ranking for attention.
- The **closure reason** (resolved by edit / superseded / text removed / dismissed) and the **ghost-anchor quote** (R3b — the user's own past words, serif italic) render as the card's substance. The archive's job is _trust_ (why did this close?), not urgency.
- Same floating language (surface cards on paper, shallow elevation) so it belongs to the same world, just dimmer.

---

## Reserved seams (design-open, un-built)

The user flagged that message-filter controls (show all / severe only / …) are coming and must not require a retrofit. The design system reserves their home **now** without building them:

- **Where:** the control center's **↑ process axis** is the natural host — a future segment/filter control sits alongside the process detail (it's a "how am I curating what you see" concern, not an action). The R2c noisiness switch (Key issues / Balanced / Everything) drops in here.
- **What's reserved:** (a) the control center's up-axis is designed as an extensible stack, not a fixed two-item list; (b) the card column already partitions into visible / "also noticed" (feedBudget) — a filter changes _membership_, which the existing partition consumes without structural change; (c) no per-type filter chips are introduced (they'd re-create the settings-dashboard the zero-config ethos refuses — smart_feed_curation.md).
- **What's built now:** nothing. This section exists so the build leaves the seam clean. → see `docs/projects/smart_feed_curation.md` (R2c).

---

## New tokens

Appended to the visual_style `:root` block (Hallmark locked-token rule — no inline literals):

| Token | Role |
| ----- | ---- |
| `--gutter-width` | The feed column width (replaces `--sidecar-width`; ~320px). |
| `--color-scrim` | Modal backdrop wash (e.g. `oklch(0% 0 0 / 0.35)`). |
| `--elev-float` | Control-center + modal elevation (one step above `--elev-hover`; still shallow). |
| `--dur-pulse` | The activity dot's working-state pulse period (slow, calm). |
| `--control-anchor-size` | The activity/control anchor diameter. |

`--color-sidecar` (the panel background) is **retired** — the gutter is `--color-paper`. Everything else reuses existing visual_style tokens.

---

## Reconciliation (what this revises in sibling specs)

This project post-dates and revises parts of two specs. When built, update them in the same change:

- **`visual_style.md` § Feed panel / § Observation card / § Supporting surfaces** — the panel-background model and the **left-border-as-impact execution** are superseded here (borderless floating cards; tag-carries-colour). The token foundation (§ Tokens), typography (dual-voice), highlights, and the R7a impact _label_ are all **kept and reused**. Add a pointer from those sections to this file.
- **`ui_interaction_mechanics.md` C4 (card anatomy)** — the DOM order changes (no left-border element; tag becomes colour carrier). C1/C2/C3/C5/C6/C7, R3c, and R7b are **unchanged** — this project reuses them verbatim. Add a pointer from C4 to § Card execution here.
- **`onboarding_first_run.md` § The context chip** — the feed-panel-top location is revised to document-attached (§ The context affordance). Reconcile the empty/quiet-state co-ownership.

No Hard Invariant is touched: no fix-application affordance is introduced; the dual-voice typography and the "reflow, never occlude" rule actively reinforce "the document is yours; the AI only comments beside it."

---

## Scope boundary — canvas, fonts, highlights (owned by `visual_style`, not here)

The taste mock reads as one cohesive product, which blurs an ownership line worth stating plainly: the **look of the writing canvas is `visual_style.md`'s**, not this project's. `feed_surface` is the structural/chrome layer and _reuses_ that look.

- **Warm paper background** — `--color-paper` (`visual_style` § Tokens); it already ~exists in the app (`#fafaf8`). `feed_surface`'s _only_ background change is **retiring the feed panel fill** (`--color-sidecar`) so paper shows through the gutter. It does not define the paper colour.
- **Serif canvas / sans feed fonts** — `visual_style` § Typography (the dual-voice split). The single most visible change in the mock, and it is owned there — in flight on `visual-style/tokens-fonts-editor`. `feed_surface` consumes `--font-serif` / `--font-sans`; it does not introduce them.
- **In-editor string highlights** — `visual_style` § Highlights + `ObservationHighlighter`; in flight on `visual-style/feed-cards-highlights`. `feed_surface` reuses them **unchanged** (the highlight-density C7 decision stays with the UI/UX mechanics pass).

**The one canvas thing `feed_surface` _does_ own: the reflow-column layout.** The canvas cedes `--gutter-width` when the feed is present and reclaims full `--editor-measure` when the feed is collapsed (touches `App.tsx` layout + decouples the editor max-width from the hard `680px`). `visual_style` sets the measure _value_ and the canvas typography; `feed_surface` makes the canvas _reflow_ around the collapsible gutter. They meet at `App.tsx`.

**Dependency / sequencing.** `feed_surface` must land **after or together with** the `visual_style` token/font/highlight layer. On today's `main` alone it would render in system fonts with the old highlight styling and look half-finished. Same lane (Visual, solo), so they sequence regardless.

**Branch consolidation — DECIDED (2026-07-05).** The parallel session that owns the two visual-style branches is retired; this session owns all of it. The branches are treated as **salvage sources for built code, not as PRs to merge as-is**:

- **`visual-style/tokens-fonts-editor` → adopt as the foundation.** Its changes are clean prerequisites and barely touch the feed: the OKLCH token block, the `@fontsource` self-hosted serif/sans/mono pipeline (`package.json` + `main.tsx` imports + `vite-env.d.ts`), and the editor-canvas CSS (serif body, measure, heading scale). Bring these across wholesale.
- **`visual-style/feed-cards-highlights` → salvage the highlight CSS only; supersede the rest.** Its in-editor `.obs-highlight-*` rules (the semantic-ramp span highlights) are keepers and port directly. Its **feed-card / panel / header / settings re-skin** — and the corresponding `SidecarFeed.tsx` rewrite — implement the _old panel model_ this project replaces, so they are **not merged**; the feed markup + CSS are re-derived from this spec instead. (Do not merge this branch as a PR; cherry-pick the highlight block.)

Net: the build starts from the token/font/editor-canvas foundation + the highlight rules, then builds the companion surface (§ Build sequence) fresh on top. No feed code is inherited from the old panel re-skin.

## Build sequence & branch consolidation

The one integrated build, in dependency order (owned by this session; see § Todo for the checklist and the task list for tracked items). Each surface is prototype-gated (§ Working norm) — its static mock is approved before its code.

1. **Foundation** — bring across the token block + `@fontsource` fonts + editor-canvas CSS from `visual-style/tokens-fonts-editor`; port the `.obs-highlight-*` rules from `visual-style/feed-cards-highlights`. Verify paper/serif/sans/highlights render on `main` before touching the feed.
2. **Surface tokens** — add `--gutter-width`, `--color-scrim`, `--elev-float`, `--dur-pulse`, `--control-anchor-size`; retire `--color-sidecar` (§ New tokens).
3. **Reflow-column layout** — `App.tsx` two-region flex; canvas cedes/reclaims the gutter; collapse/expand state + edge handle + shortcut, persisted (§ Layout model).
4. **Floating card re-execution** — borderless cards on paper; tag-carries-colour severity replacing the left-border; `HIGH/MED/LOW` label + R7a popover; preserve testids + C1/C2/C3 contracts (§ Card execution).
5. **Unified control center** — docked under the feed column; activity/model dot (state colour, pulse, tooltip) + ← actions (export/import with fixed icons+labels, config, clear) + ↑ process detail; retire the header chips + icon-button row (§ 2, § 5).
6. **Floating settings modal** — move key/tier/(dev)debug into a shared modal primitive (§ 3).
7. **Elegant archive** re-skin (§ Archive).
8. **Context affordance relocation** — after the placement fork is resolved by prototype; reconcile `onboarding_first_run.md` (§ 4, § Open forks).
9. **Reserved filter seam** — structural only, no UI (§ Reserved seams).
10. **Compliance** — Hallmark slop test, reduced-motion, print; update `docs/mechanics/` if a documented mechanic changes; reconcile the three sibling specs' revision notes.

## Working norm — prototype before commit

Per the user's standing preference (2026-07-05): **every surface in this project gets a static visual prototype the user tastes and signs off _before_ implementation.** These are non-functional mockups (HTML/CSS or the visualize widget) whose only job is to validate look-and-feel cheaply. Order of prototypes: (1) a floating card + the column; (2) the control center expanded on both axes; (3) the activity dot states; (4) the settings modal; (5) the relocated context affordance; (6) the archive. Implementation of a surface does not start until its prototype is approved. This norm generalizes beyond this project — it's how visual work on writtten is validated.

---

## Resolved forks

1. **Default feed state — RESOLVED: ambient, collapsible** (2026-07-05). Feed present by default; collapse is the deliberate focus gesture. (The "quiet while drafting" instinct is served by the empty/quiet state inside the present feed, not by hiding the feed.)
2. **Context affordance placement — RESOLVED: document-attached** (2026-07-05, prototype-reviewed). See § 4.
3. **Card severity execution — RESOLVED: tag-carries-colour** (2026-07-05, prototype-approved). Fallbacks (whole-card tonal wash; severity glyph on mono card) recorded only if the built version reads too subtle in practice.

## Minor, settle at build

- **Collapse handle form** — edge hairline+chevron vs. a dedicated control-center toggle vs. both. Cosmetic; settle when building the layout (task).
- **Control-center at-rest vs. expanded states** — direction approved (at-rest = dot only; ← actions / ↑ process on interaction); exact expansion motion/arc settled at build.
