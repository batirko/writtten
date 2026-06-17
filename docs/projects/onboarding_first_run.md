---
status: idea
kind: spec
phases: [6]
summary: The first-run experience for a brand-new user — a single dismissible welcome moment that frames the inversion, an optional one-click "See it in action" example doc (planted contradiction) so the hero capability is witnessable immediately, the quiet-by-design empty states, and the first-settle micro-moment — all without a tour, a setup form, or a key gate.
---

# Onboarding & First-Run

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 6 (design fully written, ready to build).** The fourth leg of the "product feel" pass, and the most philosophically delicate: the product defines itself by _being quiet_, so onboarding must orient without contradicting that. It also must solve a real tension — the hero (contradiction-at-distance) needs settled text before it can fire, so a blank first session risks feeling like nothing happens (the "time-to-first-wow" problem).

Consumes the three prior product-feel specs:

- `docs/projects/visual_style.md` — empty-state visuals and the welcome card are styled to its tokens; the empty/quiet feed is the philosophy-bearing surface it calls out (§ Design principle #5, R3.5/R1.3).
- `docs/projects/emotional_register.md` — the welcome + example copy is calm/editorial. **Note:** welcome copy is _product chrome_, not an observation, so it is **not** bound by the declarative-only / no-`?` observation rules — but it stays terse, non-salesy, and never hypey.
- `docs/projects/ui_interaction_mechanics.md` — the example's feed reactions use the same hover/highlight/dismiss contracts; arrival animation is R3c.

**Two decisions settled 2026-06-17:**

1. **One-time welcome moment** — a single calm, dismissible welcome card in the feed on first open that frames the inversion in 2–3 lines, then gets out of the way. Not a tour, not coachmarks. Shown once (a persisted first-run flag).
2. **Optional "See it in action" example** — a clearly-labeled, one-click sample doc (a short PRD with a planted contradiction) the user can load to _watch_ the feed catch it live, then clear. The sample is pre-written; the user only observes — so it lands the hero without violating the inversion, and it's never forced on anyone.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **6** | The welcome card + first-run persistence, the example-doc fixture + load/clear affordance, the quiet-by-design empty states (editor + feed), the first-settle micro-moment hand-off to R3c, and the "no upfront setup" first-run posture (stage inference, no key gate). |

## Todo

Anchor files: `src/sidecar/SidecarFeed.tsx` (welcome card, empty state, example affordance), `src/App.tsx` (first-run flag, example load/clear), `src/editor/Editor.tsx` (placeholder copy), a new example fixture (e.g. `src/services/exampleDoc.ts`), `src/styles.css` (visual_style tokens).

- [ ] **Welcome moment** — a dismissible welcome card at the top of the feed, shown only when a persisted `hasSeenWelcome` flag (localStorage) is unset; dismissing sets it. Copy + styling per § The welcome moment. Reuses the card/dismiss visual language (no new component vocabulary).
- [ ] **"See it in action" example** — an example-doc fixture (short PRD, one planted `contradiction` + ideally one `unsupported_claim`) and a one-click affordance (in the welcome card and the empty feed) that loads it into the editor and lets the live pipeline react. A "clear" path returns to a blank doc. Guard the replace-current-doc case (§ The example).
- [ ] **Empty states** — editor placeholder + empty-feed copy that frame the silence as intentional (§ Empty states), visually distinct from the "working" state (`sidecar-status`). Co-owned with `visual_style`; this spec owns the copy + intent, `visual_style` owns the look.
- [ ] **First-settle micro-moment** — ensure the very first observation a user ever sees is unmistakable but calm; the arrival animation is **R3c** — this item only guarantees the hand-off and that the empty→first-card transition isn't change-blind (§ First-settle).
- [ ] **No upfront setup** — confirm first-run shows _no_ stage form (inference handles it) and _no_ API-key gate (free tier runs keyless); any BYO-key nudge is quiet and deferred (§ No upfront setup).
- [ ] **Reset path** — a dev/settings affordance to re-show the welcome and re-run the example (for testing and for users who want it again). `data-testid` for the welcome card + example affordance for the harness.

## Design

### Principles

1. **One interruption, maximum.** The welcome card is the single permitted first-run interruption. After it's dismissed, the product is silent until the user's own text earns an observation. No second modal, no nudges, no badges.
2. **Never block the blank page.** Onboarding is additive to an immediately-usable editor. The user can ignore the welcome card and start typing; nothing gates writing.
3. **Quiet is a feature, shown not told.** The empty feed doesn't apologize for being empty or look like it's loading. It states the contract calmly and confidently (R3.5).
4. **Witnessing, not forcing.** The example is offered, never auto-run. The hero proves itself when the user chooses to look.

### The welcome moment

A single card at the top of the feed on first open, styled as a calm variant of the observation card (`visual_style`) but visibly **not** an observation — no severity border, no type tag, no impact dot; brand-accent-tinted (`--color-accent-tint`) so it reads as the product introducing itself, not as a flag.

- **Copy** (product voice — terse, editorial, no hype, ≤ 3 short lines). Intent, not final words:
  - A one-line framing of the inversion: _you_ write; it watches and points, never rewrites.
  - A one-line framing of the rhythm: quiet while you draft, pointed while you revise.
  - The optional affordance: a quiet text link — _"See it in action →"_.
- **Dismiss:** the standard dismiss affordance (mechanics C3) — but **no Undo toast and no suppression write** (it's chrome, not an observation). Dismissing sets the persisted `hasSeenWelcome` flag so it never returns unprompted.
- **Persistence:** localStorage flag (single-document app today; a per-user/multi-doc story arrives with Phase 7 — don't over-build).

### The example ("See it in action")

- **Trigger:** the _"See it in action →"_ link in the welcome card, and a matching quiet affordance in the empty feed (so a user who dismissed the welcome can still find it).
- **Behaviour:** loads the example fixture into the editor; the **real** pipeline evaluates it, so the user watches the actual feed surface a real `contradiction` (both spans highlighting on hover via the mechanics contract) — the genuine hero moment, not a canned animation.
- **Fixture:** a short, realistic PRD (~150–250 words so doc-level checks also warm up) containing one unmistakable planted contradiction (e.g. a Q3 commitment in one section vs. a Q2 date in another) and ideally one `unsupported_claim`, so the user sees _range_, not just one trick. Keep it in a single fixture module; reuse the ratchet's contradiction fixtures as a basis if convenient.
- **Exit:** a clearly-labeled "Clear" returns to a blank doc (reuse the existing `clear-workspace` flow). Loading the example **replaces the current document** — for a brand-new user the doc is blank, so this is safe; if the doc already has user content, route through the existing clear-confirm modal so nothing is silently clobbered.
- **Not** auto-loaded, **not** sticky — once cleared, the user is in their own blank doc with the normal empty state.

### Empty states

Two surfaces, both owned here for **copy + intent**, by `visual_style` for **look**:

- **Editor placeholder** — replaces the current generic placeholder with an editorial, serif, low-contrast line that invites writing (the first words on the page should already feel like a document, not a form). One line; no instructions.
- **Empty feed** — the quiet-by-design surface. States the rhythm ("Quiet while you draft — I'll speak up as you revise") calmly, holds the _"See it in action"_ affordance, and is **visually distinct from the working state** (the `sidecar-status` "working" chip, `aria-live`) so "intentionally quiet" never reads as "stuck loading." Replaces today's `.sidecar-empty` emoji-icon treatment with the visual_style empty-state language.

### First-settle micro-moment

The first observation a user ever sees (in their own doc) is the real first impression of the hero. This spec doesn't animate it — **R3c (feed choreography)** owns enter animation + the transient "new" badge. Onboarding's only requirement: the empty→first-card transition must not be change-blind (the user shouldn't miss that the feed just spoke for the first time), and it must stay calm (no celebratory toast/confetti — that would betray the register). The hand-off to R3c is the deliverable here.

### No upfront setup

First-run asks for nothing:

- **No stage form.** The stage is _inferred_ once enough content exists and shown back for one-click confirm (features.md → stage inference). A blank-field setup step would starve exactly the checks that need it and contradict the calm posture.

  > **Open: discoverability of the stage field (flagged 2026-06-17).** "No first-run form" must not mean "permanently hidden." Today the combined **Document Context / Stage** field (it's already _one_ input, not two — `SidecarFeed.tsx`) lives only behind the settings gear, so a user who wants to set context — or who got a wrong/empty inference — may never find it. The decision (own it here or on the plan's _Document Context / Stage discoverability_ milestone): make the field **reachable and legible without a setup gate** — e.g. surface it when inference is low-confidence/absent, or via a quiet always-available affordance — while preserving the no-upfront-setup posture. The inferred-context chip already handles the happy path; this is the fallback when inference isn't enough.

- **No API-key gate.** The free tier runs keyless. BYO-key lives in settings; any nudge toward it is quiet and surfaces only _after_ the user has seen value, never as a first-run blocker.

> **Open dependency (not resolved here):** whether the free tier is a _real tier_ or a _demo_ is a strategic open question (`docs/plan.md`; `field_validation.md` V1 measures the free-vs-paid delta). If evidence later shows BYO-key is effectively required to meet the fidelity bar, the first-run posture above (keyless, no nudge) is the thing that changes — the welcome/example/empty-state design holds either way. Flagged so the build doesn't hard-code an assumption that a later decision may overturn.

### Scope boundaries

| Concern                                                      | Owner                                              |
| ------------------------------------------------------------ | -------------------------------------------------- |
| Empty-state + welcome-card _visuals_ (type, colour, spacing) | `visual_style.md`                                  |
| First-observation arrival animation + "new" badge            | R3c (`quality_remediation_synthesis.md`)           |
| Welcome/example _copy voice_                                 | `emotional_register.md` (product-chrome variant)   |
| Example's feed interactions (hover/highlight/dismiss)        | `ui_interaction_mechanics.md`                      |
| Whether free tier is real/demo (may reshape first-run)       | strategic open question · `field_validation.md` V1 |

Nothing here introduces a fix-application affordance; the example showcases the AI _reacting to_ pre-written text, never authoring it (Hard Invariant 1).
