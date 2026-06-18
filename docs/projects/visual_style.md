---
status: idea
kind: spec
phases: [6]
summary: The visual design system — type, colour (OKLCH tokens), spacing, elevation, motion, and per-component language — that makes the tool feel calm, editorial, and opinionated rather than a dev-tool grey box. Light-first; dark deferred. Serif writing canvas, sans observation feed, ink-indigo brand accent on warm paper.
---

# Visual Style

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 6 (design fully written, ready to build).** This is the design-system half of the Phase 6 "product feel" pass. It defines the tokens and component language; the **UI/UX mechanics pass** (interaction contracts), **emotional register** (voice/copy), and **onboarding & first-run** (the blank-canvas moment) consume it. Defining it first is deliberate — everything else references the type, colour, and spacing vocabulary set here.

The four taste decisions that set the identity were made 2026-06-17:

1. **Serif writing canvas, sans observation feed** — the editor body is a refined book serif; the feed/chrome is sans. This visually separates _your voice_ (serif, the prose you own) from _the AI's voice_ (sans, the observations). The strongest "editorial, not dev-tool" signal available.
2. **Warm paper** — keep and refine the existing warm off-white (`#fafaf8`); calm and analog for long sessions.
3. **Ink-indigo brand accent** — a single non-semantic "product voice" colour for focus rings, links, active state, and brand touches, distinct from the amber-problem / teal-opportunity _semantic_ palette so brand never competes with an observation's severity.
4. **Light-first** — light mode is fully specified and buildable; dark mode token values are sketched as a documented future slice (§ Dark mode), not a gate on this milestone.

Read alongside:

- `docs/projects/emotional_register.md` — the felt-tone half; this file owns _look_, that one owns _voice_.
- `docs/projects/quality_remediation_synthesis.md` (R3c feed choreography, R7b scanning affordances) — interaction-level work that lands inside this visual vocabulary.
- `docs/projects/accessibility.md` — the contrast/focus floors here must satisfy the a11y checklist there.
- `src/styles.css` — the current implementation this spec evolves (it is **not** a greenfield; § Migration maps every existing token).

This spec is build-ready against the **Hallmark** editorial-genre discipline (OKLCH tokens, 2-families-plus-mono, 4-pt spacing, restrained motion, the anti-pattern list). The build must run the Hallmark slop test and stamp the produced CSS (§ Build compliance).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | The full light-mode design system — tokens (type, colour, spacing, radius, elevation, motion) + per-component visual language for every existing surface (editor canvas, feed panel, observation card, tags/badges, highlights, archive, settings, empty states). Dark mode is specified at the token level but deferred to a later slice. Lands with the UI/UX mechanics pass, emotional register, and onboarding as the "product feel" pass. |

## Todo

Each item is build-scoped and independently verifiable.

- [ ] **Token foundation** — replace the ad-hoc `:root` block in `src/styles.css` with the full named token system (§ Tokens): paper/ink/border ramps, brand-accent ramp, semantic ramps, type scale, spacing, radius, elevation, motion. Express colour as OKLCH with hex fallback comments.
- [ ] **Font pipeline** — self-host the three families (§ Typography) via `@fontsource` (local-first: no runtime Google Fonts fetch — honours Invariant 5). Wire `--font-serif` / `--font-sans` / `--font-mono`.
- [ ] **Editor canvas** — serif body, reading measure (~66ch), the editorial heading scale, blockquote/code/list treatment (§ Editor canvas). Decouple the editor's max-width and rhythm from the current hard-coded values.
- [ ] **Feed panel + observation card** — re-skin to the token system: card anatomy, the kind×severity left-border matrix, impact dot, type tag, low-confidence `~` qualifier, "also noticed" drawer, dismiss affordance (§ Feed & cards). Preserve all `data-testid` hooks.
- [ ] **Highlights** — re-skin the in-editor span highlights and hover state to the semantic ramps (§ Highlights), keeping contradiction's dual-span treatment.
- [ ] **Archive, settings, stage chip, empty states** — apply the token system; the empty state is the "quiet by design" surface (§ Supporting surfaces) and is co-owned with onboarding.
- [ ] **Contrast + focus audit** — every text/background pair ≥ 4.5:1 (≥ 3:1 for large), focus ring ≥ 3:1, shown instantly (§ Accessibility floor). Cross-check `docs/projects/accessibility.md`.
- [ ] **Dark-mode token slice (deferred)** — fill the dark ramp values in § Dark mode behind `prefers-color-scheme` / a manual toggle. Not required for this milestone's green.
- [ ] **Build compliance** — run the Hallmark slop test; stamp `src/styles.css`; verify reduced-motion and print paths still hold (§ Build compliance).

---

## Design principles

Five rules that resolve every later judgment call. When a component decision is ambiguous, the answer is whichever option serves these.

1. **The page is for reading, not for the tool.** The writing canvas is the hero; every other surface recedes. Chrome is quiet, low-contrast, and small. If a UI element competes with the user's prose for attention, it's wrong.
2. **Two voices, two type families.** Serif is the user's prose; sans is the machine's commentary. Never mix them within a surface. This is the visual spine of "provoke, don't prescribe" — the AI's words are typographically marked as _commentary on_ your text, never _part of_ it.
3. **Colour is meaning, not decoration.** The only saturated colour in the product is _semantic_ (an observation's kind×severity) or _brand_ (focus/links). Paper and ink carry everything else. No gradients-for-vibe, no colour without a job.
4. **Calm over flashy; restraint over expression.** Subtle elevation, hairline borders, one easing language, motion measured in ~120–200ms. The product earns trust by feeling considered and quiet — the opposite of an attention-extracting app.
5. **Silence is a designed surface.** The empty/quiet feed is the philosophy made visible (R3.5). It must read as "respecting your flow," never "loading" or "broken." It gets real design attention, not a centred grey spinner.

---

## Tokens

The complete token set. Colour is authored in **OKLCH** (perceptually uniform, Hallmark discipline) with the current hex as a migration comment. Values are tuned to the existing warm palette; final OKLCH may be nudged ±1–2% at build for contrast.

### Colour — neutrals (warm paper ramp)

| Token                   | OKLCH (target)          | Hex (current / approx) | Role                                               |
| ----------------------- | ----------------------- | ---------------------- | -------------------------------------------------- |
| `--color-paper`         | `oklch(98.4% 0.004 95)` | `#fafaf8`              | App + editor background (warm off-white)           |
| `--color-surface`       | `oklch(100% 0 0)`       | `#ffffff`              | Cards, inputs, raised surfaces                     |
| `--color-sidecar`       | `oklch(97% 0.004 95)`   | `#f5f5f2`              | Feed panel background (one step grayer than paper) |
| `--color-border`        | `oklch(91% 0.004 95)`   | `#e5e5e0`              | Hairline dividers, card borders                    |
| `--color-border-strong` | `oklch(78% 0.005 95)`   | `~#bdbdb8`             | Hover/active card border, input focus              |
| `--color-ink`           | `oklch(22% 0.004 95)`   | `#1a1a18`              | Primary text                                       |
| `--color-ink-2`         | `oklch(40% 0.005 95)`   | `~#4d4d49`             | Card body text (observation messages)              |
| `--color-muted`         | `oklch(62% 0.006 95)`   | `#888880`              | Secondary/label/help text                          |

The faint `95` hue (warm yellow-grey) on every neutral is what keeps the product from reading as a cool dev-tool grey. It is load-bearing — do not flatten to pure greys.

### Colour — brand accent (ink-indigo)

A single non-semantic ramp for focus, links, active state, stage-confirm, and brand marks. Chosen to sit apart from both semantic hues (amber ~70°, teal ~235°) so brand never reads as an observation severity.

| Token                   | OKLCH                 | Hex (approx) | Role                                    |
| ----------------------- | --------------------- | ------------ | --------------------------------------- |
| `--color-accent`        | `oklch(50% 0.12 274)` | `~#5457ac`   | Links, active, brand                    |
| `--color-accent-strong` | `oklch(44% 0.14 274)` | `~#454393`   | Hover/pressed, focus ring               |
| `--color-accent-tint`   | `oklch(95% 0.02 274)` | `~#ececf7`   | Active/selected backgrounds, brand wash |

> **Migration note:** the current focus ring is sky-blue `#0ea5e9`, which **collides** with the `opportunity`/medium semantic. The build replaces the focus-ring colour with `--color-accent-strong`. This is the one colour change users will notice; it's intentional (§ Migration).

### Colour — semantic (observation kind × severity)

Preserves the existing matrix in `src/styles.css` exactly — same intent, expressed as named tokens. **Do not re-tune these in this milestone**; they're calibrated against the taxonomy and the impact-badge work (Phase 4). This spec only _names_ them.

| Token                 | OKLCH                  | Hex (current) | Maps to                                   |
| --------------------- | ---------------------- | ------------- | ----------------------------------------- |
| `--sem-problem-low`   | `oklch(64% 0.006 286)` | `#8e8e93`     | problem · low severity (gray)             |
| `--sem-problem-med`   | `oklch(76% 0.16 70)`   | `#f59e0b`     | problem · medium (amber)                  |
| `--sem-problem-high`  | `oklch(64% 0.22 25)`   | `#ef4444`     | problem · high (red)                      |
| `--sem-opp-low`       | `oklch(80% 0.04 230)`  | `#99c5d0`     | opportunity · low (pale teal)             |
| `--sem-opp-med`       | `oklch(70% 0.13 235)`  | `#0ea5e9`     | opportunity · medium (sky)                |
| `--sem-opp-high`      | `oklch(48% 0.10 240)`  | `#0369a1`     | opportunity · high (deep blue)            |
| `--sem-contradiction` | `oklch(72% 0.17 60)`   | `#ff9500`     | contradiction tag/highlight (warm orange) |
| `--sem-tension`       | `oklch(70% 0.13 235)`  | `#0ea5e9`     | strategic_tension (teal, non-alarm)       |

The semantic tags currently render with `12%`-opacity backgrounds of these hues plus a darker text colour; that pattern is kept (§ Feed & cards → Tags).

### Typography

Three families, in the Hallmark 2-plus-mono spirit but with an intentional dual-voice split (serif content / sans chrome). Self-hosted via `@fontsource` — **no runtime Google Fonts request**, to honour the local-first / no-egress invariant.

| Token          | Family                                             | Role                                                          | Why                                                                                                                                                                                               |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--font-serif` | **Source Serif 4** (variable)                      | Editor canvas body + headings, archived "ghost anchor" quotes | Screen-optimised editorial serif; warm, highly readable at reading sizes; robust at long lengths. _Documented swap:_ Newsreader (more characterful italics) if the canvas wants more personality. |
| `--font-sans`  | **Inter** (variable)                               | Feed, cards, chrome, labels, buttons, settings                | Neutral, exceptional small-size legibility for dense feed text. The serif carries identity, so the sans stays quiet on purpose.                                                                   |
| `--font-mono`  | **JetBrains Mono** (or `--font-mono` system stack) | `code` / `pre` in the editor, debug panel                     | Only inside code spans; never structural.                                                                                                                                                         |

**Type scale** — a ~1.2 modular scale, two ramps (editor reads larger; chrome reads smaller).

| Token            | Size             | Use                                                        |
| ---------------- | ---------------- | ---------------------------------------------------------- |
| `--text-display` | 1.875rem / 30px  | Editor `h1`                                                |
| `--text-h2`      | 1.375rem / 22px  | Editor `h2`                                                |
| `--text-h3`      | 1.125rem / 18px  | Editor `h3`                                                |
| `--text-body`    | 1.125rem / 18px  | **Editor body** (serif, reading size — larger than chrome) |
| `--text-ui`      | 0.875rem / 14px  | Feed card body, settings                                   |
| `--text-ui-sm`   | 0.8125rem / 13px | Card body secondary, help                                  |
| `--text-label`   | 0.6875rem / 11px | Tags, eyebrow labels (uppercase + tracking)                |

**Line-height:** editor body `1.7` (generous, for reading); card body `1.5`; labels `1.2`.
**Measure:** editor canvas caps at **~66ch** (`--editor-measure`), replacing the current fixed `680px` so the measure scales with font size. Feed panel stays at `--sidecar-width: 320px`.
**Weights:** serif 400 body / 600 headings; sans 400 body / 500 emphasis / 600 labels. No weights below 400 (warm paper + thin weight = poor contrast).

### Spacing — 4-pt scale

| Token         | px  | Token         | px  |
| ------------- | --- | ------------- | --- |
| `--space-2xs` | 4   | `--space-lg`  | 24  |
| `--space-xs`  | 8   | `--space-xl`  | 32  |
| `--space-sm`  | 12  | `--space-2xl` | 48  |
| `--space-md`  | 16  | `--space-3xl` | 64  |

Editor panel padding `--space-2xl --space-xl`; feed panel `--space-lg --space-md`; card padding `--space-sm`; card gap `--space-sm`.

### Radius

| Token         | px  | Use                           |
| ------------- | --- | ----------------------------- |
| `--radius-sm` | 4   | Tags, inputs, small buttons   |
| `--radius-md` | 6   | Panels, settings, code blocks |
| `--radius-lg` | 8   | Observation cards             |

### Elevation

Deliberately shallow — calm, paper-like, not "floating glass."

| Token           | Value                             | Use                                  |
| --------------- | --------------------------------- | ------------------------------------ |
| `--elev-rest`   | `0 1px 3px oklch(0% 0 0 / 0.02)`  | Card at rest                         |
| `--elev-hover`  | `0 4px 12px oklch(0% 0 0 / 0.05)` | Card hover / lifted                  |
| `--elev-active` | `0 4px 12px oklch(0% 0 0 / 0.08)` | Card whose span is hovered in-editor |

### Motion

One easing language; durations short. (Reduced-motion already collapses these in `styles.css`; keep it.)

| Token           | Value                            |
| --------------- | -------------------------------- |
| `--dur-fast`    | 120ms                            |
| `--dur-base`    | 200ms                            |
| `--ease-out`    | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` |

Animate **only** `transform` and `opacity`. No bounce/overshoot on UI state. The default browser `ease` is banned (use the named tokens). Feed enter/exit choreography (R3c) is specified in `ui_interaction_mechanics.md` § R3c and must use these tokens.

---

## Component language

How each existing surface looks under the token system. (Interaction _behaviour_ — hover contracts, scroll, gestures — is the **UI/UX mechanics pass**; this section is appearance only.)

### Editor canvas

- Serif body at `--text-body` / `1.7`, ink on paper, centred in a `--editor-measure` (~66ch) column with `--space-2xl` vertical padding.
- Headings in serif, the `display/h2/h3` scale, weight 600, tight bottom margin. The editorial scale (big, confident `h1`) signals "this is a document," not "this is a form."
- Blockquote: hairline `--color-border` left rule (3px), muted serif italic. Lists: standard indent. `code`/`pre`: `--font-mono`, `--color-sidecar` background, `--radius-sm`/`md`.
- Empty-doc placeholder uses `--color-muted` serif italic — the first words on the page should already feel editorial. (Onboarding owns the _copy_.)

### Feed panel

- Background `--color-sidecar` (a half-step grayer than paper, so the feed reads as a distinct "margin" without a hard wall). Left hairline border only.
- Header: an uppercase `--text-label` title in `--color-muted` with letter-spacing — the quiet "the AI speaks here" marker. Settings gear is a muted ghost button.
- Vertical rhythm: `--space-sm` gap between cards.

### Observation card

The product's most-seen component. Anatomy, top to bottom:

1. **Left border** (4px) — the kind×severity matrix from § Semantic colour. This is the at-a-glance impact signal; a high-severity contradiction (red/orange) visibly outranks a low clarity nit (gray).
2. **Header row** — left: the **impact label** (R7a) + the **type tag**. Right: the **dismiss** ghost button (appears/strengthens on hover). See § Impact label (R7a) for the cue's form and tooltip — it **replaces** the old near-invisible 6px impact dot.
3. **Tag** — `--text-label`, uppercase, `--radius-sm`, a 12%-opacity wash of the type's semantic hue with a darker-hue text colour (existing pattern). Low-confidence observations append a hedging `~` (existing `[data-confidence="low"]` rule).
4. **Body** — sans, `--text-ui`, `--color-ink-2`. Terse (the voice guide in `emotional_register.md` governs the words; this governs the type).
5. **"Also noticed" drawer** — hairline top divider, a muted toggle ("N more on this passage"), dashed sub-dividers between collapsed items.

Card surface `--color-surface`, `--radius-lg`, `--elev-rest`, hairline border. Hover: `--elev-hover` + 1px lift (`translateY(-1px)`). The card whose span is being hovered in the editor gets `--elev-active` + `--color-border-strong` border (the bidirectional highlight contract — behaviour owned by mechanics).

#### Impact label (R7a) — settled 2026-06-18

**Why this section exists.** The shipped first-glance impact cue is a 6px `impact-cue` dot at 0.75 opacity (`src/styles.css:322`) with a native `title` tooltip (`SidecarFeed.tsx:114`). Two defects: the dot is **too subtle to be a first layer** of impact (the eye doesn't catch it), and the **native `title` is unreliable** (cursor shows `help` but no tooltip renders in practice). R7a fixes both. Decisions (2026-06-18, interactive):

**The cue → a small text severity label.** Replace the dot with a tiny uppercase severity word — **`HIGH` / `MED` / `LOW`** — set in the same semantic colour the dot used (the `impact-kind-* impact-sev-*` palette in `src/styles.css`), at `--text-label` scale. Rationale:

- **Legible as a first layer** — a word is caught at a glance where a 6px dot is not.
- **Colour-blind safe** — it satisfies the accessibility floor ("semantic colour is never the only signal") _by itself_: severity now reads from text, not only the left-border position.
- **Calm, not loud** — a small uppercase label in `--text-label` is quieter than a filled badge/pill, so it doesn't fight the editorial register. It rides _beside_ the type tag, not as a competing chip.
- **Confidence stays a hedge, not a second label** — low-confidence observations keep the existing `~` qualifier on the tag (`[data-confidence="low"]`); the impact label carries **severity only**, so the header doesn't sprout two metadata words. The full severity-×-confidence sentence lives in the tooltip.
- **Slot-aware copy is unchanged** — the "shown below budget" vs "surfaced in main feed" nuance moves entirely into the tooltip (it was always tooltip-only); the visible label is identical in both slots.

**The tooltip → a real lightweight popover.** Replace the native `title` with a small custom tooltip:

- Hover **and** keyboard-focus triggered (the cue is already in the card's focus path); dismiss on blur/mouseleave/`Escape`.
- `--color-ink`-on-`--color-surface` (or an inverted ink chip), `--radius-sm`, `--elev-hover`, `--text-ui`; positioned above/below the label with simple flip-on-overflow. No animation under `prefers-reduced-motion`.
- Content is the existing `impactTooltip(severity, confidence, slot)` string (`SidecarFeed.tsx:49`) — e.g. _"High severity · medium confidence — surfaced in main feed"_ — now actually rendered reliably.
- Accessibility: the label is focusable with `aria-describedby` pointing at the tooltip; the tooltip is `role="tooltip"`. Keep the `data-testid="impact-badge"` hook on the label element so existing harness selectors don't break.

**Scope note.** This is a card-anatomy change (label form + a tiny tooltip component); the semantic colour tokens are **not** re-tuned (§ Semantic colour says don't). Co-owned with `emotional_register.md` only for the _words_ in the tooltip sentence (which already exist); G-register rules don't change.

### Highlights (in-editor spans)

Re-skin the existing `.obs-highlight-*` rules to the semantic ramps:

- `clarity` → faint `--sem-problem-low` wash + dotted underline.
- `contradiction` → `--sem-contradiction` wash + dashed underline; **both** spans highlight together (hero behaviour, keep).
- `strategic_tension` → `--sem-tension` wash + dashed underline (non-alarm teal).
- Hovered state intensifies the wash and switches underline to solid. Highlights must read as _annotations on_ the prose (translucent, underline-led), never as selection or as edits to the text.

### Supporting surfaces

- **Archive** — collapsible section below the feed; archived cards are visually quieter (reduced contrast, no left-border colour or a desaturated one) to read as "past." The **ghost-anchor quote** (R3b) renders in `--font-serif` italic — the user's _own past words_ quoted back, typographically marked as theirs.
- **Settings panel** — `--color-surface`, `--radius-md`, hairline border, slide-down reveal (existing). Inputs use `--radius-sm`, focus ring `--color-accent-strong`.
- **Stage chip** — the inferred-stage confirm/dismiss chip uses `--color-accent-tint` background with `--color-accent` text — a brand (not semantic) moment, since it's the tool understanding you, not flagging a defect.
- **Empty / quiet state** — see § Design principles #5. A short serif line ("Quiet while you draft — I'll speak up as you revise"), low-contrast, generous space, no spinner. Co-owned with `onboarding`. This is the single most philosophy-bearing visual surface.
- **Provider / status chips, debug panel** — chrome; keep small, muted, sans, out of the way.

---

## Accessibility floor

(Cross-checked against `docs/projects/accessibility.md`.)

- All body text ≥ 4.5:1 against its background; large text/labels ≥ 3:1. The muted/help text on `--color-sidecar` is the tightest pair — verify and darken `--color-muted` if needed.
- Focus ring: `--color-accent-strong`, ≥ 3:1 against adjacent colours, **shown instantly** (never animated in), `:focus-visible` only.
- Semantic colour is never the _only_ signal: severity reads from the **impact label** text (`HIGH`/`MED`/`LOW`, R7a), the type tag's text, and the left-border position — so colour-blind users get kind/severity from text + position without relying on hue.
- `prefers-reduced-motion` collapses all transitions (existing rule — keep).

## Dark mode (deferred slice)

Not required for this milestone's green. When built, drive it from `prefers-color-scheme` with a manual override. Approach: invert the neutral ramp (deep warm-charcoal paper `~oklch(20% 0.005 95)`, ink → warm off-white), **keep the same hues** for brand + semantic but raise their lightness ~8–12% so they hold contrast on dark paper. The serif canvas on warm-charcoal is the target "writing at night" feel. Define the full dark ramp as a sibling token block; do not fork component CSS.

## Migration (from current `src/styles.css`)

This is an evolution, not a rebuild. Mapping:

- **Neutrals** — current hex values become the `--color-*` neutral tokens (same colours, named + OKLCH). No visible change.
- **Type** — the system-font stack is **replaced** by the serif/sans split. This is the biggest visible change and the point of the milestone. Editor body grows to `--text-body` (18px serif).
- **Focus ring** — `#0ea5e9` → `--color-accent-strong` (ink-indigo). The one intentional colour change (de-collides brand from the opportunity semantic).
- **Semantic matrix + tags + highlights** — same colours, re-pointed at named tokens. No re-tuning.
- **`data-testid` hooks, print styles, reduced-motion** — all preserved untouched.

## Build compliance (Hallmark)

The build that implements this spec must:

- Reference colour/font/space **only by token** — no inline OKLCH/hex or `font-family` literals (Hallmark locked-token rule).
- Self-host fonts (no runtime third-party fetch) — local-first invariant.
- Animate transform/opacity only; use the named easings; honour reduced-motion.
- Pass the Hallmark editorial-genre slop test and **stamp** the top of `src/styles.css`:
  `/* Hallmark · macrostructure: Long Document (app shell) · tone: editorial · anchor hue: ink-indigo 274 */`
- Hold every Hard Invariant — nothing here introduces a fix-application affordance, and the dual-voice typography actively reinforces the inversion (the AI's words are never set in the user's type).
