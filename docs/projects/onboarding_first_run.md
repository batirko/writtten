---
status: done
kind: spec
phases: [6]
summary: The first-run experience for a brand-new user — a single dismissible welcome moment that frames the inversion, an optional one-click "See it in action" example doc (planted contradiction) so the hero capability is witnessable immediately, the quiet-by-design empty states, and the first-settle micro-moment — all without a tour, a setup form, or a key gate.
---

# Onboarding & First-Run

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Done — Phase 6 (shipped).** The fourth leg of the "product feel" pass, and the most philosophically delicate: the product defines itself by _being quiet_, so onboarding must orient without contradicting that. It also must solve a real tension — the hero (contradiction-at-distance) needs settled text before it can fire, so a blank first session risks feeling like nothing happens (the "time-to-first-wow" problem). All legs shipped: the welcome moment + "See it in action" example incl. keyless/keyed replay (#67/#72/#75), the quiet empty states (#46 + editor placeholder), the first-settle hand-off + no-upfront-setup posture + reset path (#79). See the Todo below for the per-item landing map.

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

- [x] **Welcome moment** — a dismissible welcome card at the top of the feed, shown only when a persisted `hasSeenWelcome` flag (localStorage `writtten_has_seen_welcome`) is unset; dismissing sets it. Copy + styling per § The welcome moment. Reuses the card/dismiss visual language (no new component vocabulary). Shipped in `SidecarFeed.tsx` (`WelcomeCard`) + `App.tsx`.
- [x] **"See it in action" example** — an example-doc fixture (`src/services/exampleDoc.ts`: short PRD, one planted `contradiction` + one `unsupported_claim`) and a one-click affordance (in the welcome card and the empty feed) that loads it into the editor via the existing `importContent` path and lets the live pipeline react. Guard: offered **only on a blank doc** (`blockOrder.length <= 1`) so it never clobbers the user's own text; clearing the workspace returns to blank.
- [x] **Empty states** — editor placeholder + empty-feed copy that frame the silence as intentional (§ Empty states), visually distinct from the "working" state (`sidecar-status`). Co-owned with `visual_style`; this spec owns the copy + intent, `visual_style` owns the look. **Both legs shipped.** _Empty-feed_ (#46): `.sidecar-empty` — calm copy + subtext + the "See it in action" link; distinct from the working chip, which lives on the separate `ControlCenter` `sidecar-status` surface. _Editor placeholder:_ already renders in the editorial treatment the spec asks for — serif (inherits `--font-serif`/Faustina from `.tiptap`, `styles.css`), low-contrast (`--color-muted`), italic, one line (`.tiptap p.is-editor-empty:first-child::before`, `Editor.tsx` `Placeholder`). The copy stays `"Start writing…"` — a deliberate owner call (2026-07-06) to keep it simple over a more editorial line; the surviving spec ideal ("no instructions / reads like prose") is noted as intentionally not pursued.
- [x] **First-settle micro-moment** — the empty→first-card transition is marked by R3c (arriving animation + the quiet `obs-new-badge` "new" pill) and stays calm (no toast/confetti; the batch "+N new" indicator only fires for ≥3). Hand-off verified + guarded by `SidecarFeed.test.tsx` ("first-settle micro-moment").
- [x] **No upfront setup** — verified: first-run shows **no API-key gate** (the key input lives behind the settings gear; free tier + keyless example replay run without it — `App.tsx`/`ControlCenter.tsx`) and **no stage form** (the `DocumentContext` Empty state is a muted "Add context" button; its textarea `autoFocus`es only after the user clicks — never a first-run focused field).
- [x] **Reset path** — a settings affordance ("First-run intro → Show it again", `data-testid="reset-first-run"`) that clears the persisted `hasSeenWelcome` flag and un-collapses the feed so the welcome card returns; on a blank doc the card carries the "See it in action" link, so re-running the example is one click away (not auto-run — witnessing, not forcing). Welcome/example harness testids (`welcome-card`, `welcome-dismiss`, `see-example`) already exist. Shipped in `ControlCenter.tsx` (settings modal) + `App.tsx` (`handleResetFirstRun`).

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
- **Behaviour:** loads the example fixture into the editor via the existing import path, so the pipeline surfaces a real `contradiction` (both spans highlighting on hover via the mechanics contract) — the genuine hero moment, not a canned animation.
  - **Built:** the fixture is `src/services/exampleDoc.ts`; it loads through `App.handleLoadExample` → `importContent`. The contradiction fires **on load** — this depended on fixing the import contradiction-sweep race (the `block-paste` sweep used to run before the section evals populated the ledger; see `docs/mechanics/evaluation-triggers.md` → bootstrap-sweep serialization).
  - **Keyless replay + live-error fallback (built).** The contradiction check is LLM-only, so the demo needs the model to run — and two failure modes would leave a first-run user staring at silence: (1) no API key (the evaluator skips every check), or (2) a key present but the live call fails (free-tier quota 429, network, model down). Both are covered by a **bundled recording of the example's real responses** (`src/services/exampleDocRecording.ts`, captured at weak capability), armed by `handleLoadExample` via `src/services/exampleReplay.ts`:
    - **Keyless** → the whole router goes to `mock` mode (the evaluator already exempts `mock` from the no-key skip): the hero replays with **zero network calls and no key**.
    - **Keyed** → the pipeline runs **live**, but the recording is also armed as a **live-error fallback**: if a live call throws, the router (`model/factory.ts`) serves the recorded response for that request hash instead of failing (`model/mock.ts` fallback map). So the demo runs for real when it can, and still lands the hero when the quota's gone.
    - Torn down on clear/import; a key appearing mid-demo exits keyless `mock` replay. The recording is captured real model output, not a hand-authored/canned response. The fallback matches a **weak-tier** key (the free-tier user who actually hits the daily limit); a strong/paid key builds different prompts → different hashes → no fallback match, but a paid key rarely exhausts quota and degrades to prior live-only behaviour.
- **Fixture:** a short, realistic PRD (~150–250 words so doc-level checks also warm up) containing one unmistakable planted contradiction (a Q3 commitment in one section vs. a Q2 date in another) and one `unsupported_claim`, so the user sees _range_, not just one trick. Kept in a single fixture module.
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

  > **Resolved 2026-06-18 — the always-visible context chip.** "No first-run form" must not mean "permanently hidden." Today the combined **Document Context / Stage** field (it's already _one_ input, not two — `SidecarFeed.tsx:643`) lives only behind the settings gear, and the inferred-context suggestion is a _separate_ transient chip (`stage-suggestion`, `SidecarFeed.tsx:675`). The decision: replace both with **one quiet, persistent context affordance** at the top of the feed panel — never a setup gate, always legible. See § The context chip (stage discoverability) below for the full spec.

- **No API-key gate.** The free tier runs keyless. BYO-key lives in settings; any nudge toward it is quiet and surfaces only _after_ the user has seen value, never as a first-run blocker.

> **Open dependency (not resolved here):** whether the free tier is a _real tier_ or a _demo_ is a strategic open question (`docs/plan.md`; `field_validation.md` V1 measures the free-vs-paid delta). If evidence later shows BYO-key is effectively required to meet the fidelity bar, the first-run posture above (keyless, no nudge) is the thing that changes — the welcome/example/empty-state design holds either way. Flagged so the build doesn't hard-code an assumption that a later decision may overturn.

### The context chip (stage discoverability) — settled 2026-06-18

> **Relocated 2026-07-05 (built): document-attached, not feed-top.** The companion-surface redesign moved this affordance out of the feed to a **quiet metadata line at the top of the writing column** (the `DocumentContext` component in the editor column) — so it survives feed-collapse and reads as _the document's own metadata_ rather than feed chrome. The three states, the accept/dismiss suggestion flow, and all `stage-*` testids below are unchanged; only the **location and skin** changed (it is no longer a feed-panel chip). See `docs/projects/feed_surface.md` § 4.

Resolves the plan's _Document Context / Stage discoverability_ milestone. **One** quiet, persistent affordance ~~at the **top of the feed panel**~~ (now **document-attached**, at the top of the writing column) carries the document's context in every state — replacing both the gear-buried textarea as the _primary_ surface and the separate transient inferred-suggestion chip. It is a **chip, never a form or a gate**; ignoring it costs nothing. Treated as a **brand** moment, not a semantic one (`visual_style.md` § Stage chip: `--color-accent-tint` bg, `--color-accent` text — "the tool understanding you," not flagging a defect).

**The three states it cycles through:**

| State         | When                                                                      | What the chip shows                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Suggested** | Inference has produced a stage and the user hasn't confirmed/dismissed it | `Inferred context: <stage>` with **Use this** / **Edit** / **Dismiss**. (This is today's `stage-suggestion` chip, now living _in_ the persistent slot rather than as a separate transient element.) |
| **Set**       | A stage is active (inferred-accepted **or** typed manually)               | `Context: <stage, truncated>` + a quiet inline **edit** affordance (click/pencil) that expands the existing stage textarea in place.                                                                |
| **Empty**     | No stage set **and** inference is absent or low-confidence                | A calm `Add context` link that expands the field inline. This is the fallback the milestone exists for — the field is now reachable without hunting for the gear.                                   |

**Rules that keep it faithful to the no-upfront-setup posture:**

- **First run shows the _Empty_ state at most** — a single muted `Add context` link, not an expanded field, not a focused input. It reads as optional, because it is. It must not compete with the welcome card / quiet empty state for first attention (co-owned with § Welcome and § Quiet empty states).
- **Inference still drives the happy path** — when content crosses the inference threshold, the chip flips Empty → Suggested on its own; the user never had to go looking.
- **Editing is inline, from the chip** — expanding to edit reuses the existing `stage-input` textarea (same value, same `onStageChange`); no separate editor. The settings-gear field **remains** as a secondary path (power users / parity), but is no longer the _only_ way in.
- **Truncation + full view** — long context truncates in the chip with the full text on hover/expand; the chip stays one line tall at rest so it doesn't bloat the feed header.

**Harness / testids:** preserve `stage-suggestion`, `stage-suggestion-accept`, `stage-suggestion-dismiss` (now rendered inside the chip) so existing selectors hold; add `stage-chip` (the persistent container) and `stage-chip-edit` (the inline-edit trigger). The gear-panel `stage-input` testid is unchanged.

**Scope note.** This is a feed-header affordance + state machine over the _existing_ stage value and inference suggestion — no new stage-inference logic, no schema change. Visual treatment is owned by `visual_style.md` § Stage chip (extend it to the three states above).

### Scope boundaries

| Concern                                                      | Owner                                              |
| ------------------------------------------------------------ | -------------------------------------------------- |
| Empty-state + welcome-card _visuals_ (type, colour, spacing) | `visual_style.md`                                  |
| First-observation arrival animation + "new" badge            | R3c (`quality_remediation_synthesis.md`)           |
| Welcome/example _copy voice_                                 | `emotional_register.md` (product-chrome variant)   |
| Example's feed interactions (hover/highlight/dismiss)        | `ui_interaction_mechanics.md`                      |
| Whether free tier is real/demo (may reshape first-run)       | strategic open question · `field_validation.md` V1 |

Nothing here introduces a fix-application affordance; the example showcases the AI _reacting to_ pre-written text, never authoring it (Hard Invariant 1).
