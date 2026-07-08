---
status: in-progress
kind: spec
phases: [6]
summary: The first-run experience for a brand-new user — a one-time blocking welcome modal that frames the inversion AND names the API-key requirement (keyless does nothing on the user's own text), a one-click "See it in action" recorded example (planted contradiction) witnessable with no key, a standing "add your key" banner in any keyless state, and the quiet-by-design empty states reserved for the keyed state.
---

# Onboarding & First-Run

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Done — Phase 6 (shipped).** The fourth leg of the "product feel" pass, and the most philosophically delicate: the product defines itself by _being quiet_, so onboarding must orient without contradicting that. It also must solve a real tension — the hero (contradiction-at-distance) needs settled text before it can fire, so a blank first session risks feeling like nothing happens (the "time-to-first-wow" problem). All legs shipped: the welcome moment + "See it in action" example incl. keyless/keyed replay (#67/#72/#75), the quiet empty states (#46 + editor placeholder), the first-settle hand-off + no-upfront-setup posture + reset path (#79).

**Reopened then re-shipped as _First-run activation_ (§ Revision 2026-07-07).** A field session found the shipped first-run failed its actual job: keyless, the evaluator does nothing on the user's own text, and the quiet empty state masked that hard requirement. The activation rework shipped — a **blocking welcome modal** that names the key requirement, the **standing keyless banner** (any keyless state), the **empty-state split** (quiet copy reserved for keyed), and the **Settings deep-link** (`settingsGate`). See the _First-run activation_ Todo subsection below for the per-item landing map.

Consumes the three prior product-feel specs:

- `docs/projects/visual_style.md` — empty-state visuals and the welcome card are styled to its tokens; the empty/quiet feed is the philosophy-bearing surface it calls out (§ Design principle #5, R3.5/R1.3).
- `docs/projects/emotional_register.md` — the welcome + example copy is calm/editorial. **Note:** welcome copy is _product chrome_, not an observation, so it is **not** bound by the declarative-only / no-`?` observation rules — but it stays terse, non-salesy, and never hypey.
- `docs/projects/ui_interaction_mechanics.md` — the example's feed reactions use the same hover/highlight/dismiss contracts; arrival animation is R3c.

**Two decisions settled 2026-06-17:**

1. **One-time welcome moment** — a single calm, dismissible welcome card in the feed on first open that frames the inversion in 2–3 lines, then gets out of the way. Not a tour, not coachmarks. Shown once (a persisted first-run flag).
2. **Optional "See it in action" example** — a clearly-labeled, one-click sample doc (a short PRD with a planted contradiction) the user can load to _watch_ the feed catch it live, then clear. The sample is pre-written; the user only observes — so it lands the hero without violating the inversion, and it's never forced on anyone.

## Revision (2026-07-07) — First-run activation: the key requirement is now explicit

**Status: reopened.** The first-run above shipped, but a field session found it fails its actual job — activation. This section **supersedes** the "no key gate / never block the blank page / keyless is a real tier" posture; where it conflicts with the decisions and principles below, this wins.

**Why (the diagnosis).** A first-time user has no way to tell that an API key is required. Keyless, the evaluator logs a `console.warn` and **skips every check** (`src/services/evaluator.ts:181`; there is **no bundled/default key**), so the user's own writing produces **nothing** — and the "quiet by design" empty state (§ Empty states) is **visually identical** to that silent skip. The calm design therefore actively **masks a hard requirement**: the user cannot distinguish "working as intended, quietly" from "broken / needs a key." The only keyless value is the hash-matched recorded replay of the "See it in action" example. Confirmed a **launch blocker** — writtten.com is BYOK-only (proxy was NO-GO). Conclusion: keyless is a **demo, not a usable tier**, and the first-run must say so honestly.

**Decisions (owner, 2026-07-07):**

1. **Welcome becomes a blocking modal pop-up** (was: an unintrusive in-feed `WelcomeCard`). On first open, a centered modal (reuse the settings/clear-confirm modal primitive — scrim, focus-trap, `Escape`) frames the inversion **and** makes the key requirement explicit. **Supersedes** Decision #1 (welcome-as-card) and Principle #2 ("never block the blank page") — the block is real, so first-run names it up front.
2. **Preserve "See it in action" (the mock) from inside the modal.** The witnessing path is kept: the user can load the recorded example and watch the feed react **with no key** (the existing keyless `mock` replay). Value-first survives; it's simply no longer disguised as live analysis.
3. **Standing "this is a mock" card + Settings link.** While the demo/mock (keyless) example is showing, a **persistent card sits at the top of the feed** stating the session is a mock running on recorded responses and that analyzing your own writing needs a key — with a link that **opens the Settings modal** directly (deep-link to the BYOK field). _Recommended generalization (flag):_ show this standing keyless banner in **any** keyless state, not only after the example — a user who skips the example and just writes should get the same honest banner instead of silent nothing.
4. **Key entry is one click into the existing BYOK Settings modal.** No new key UI; the modal CTA and the standing card both deep-link to the current settings key field.

**What this resolves / touches.**

- Answers the strategic open question **"free tier: real or demo?"** _for onboarding_ → **demo** (keyless does literally nothing on the user's own text). The separate free-vs-paid **quality** delta — whether a key on the free tier meets the fidelity bar — stays a V1 question (`field_validation.md`).
- Sharpens the launch **"Hosted live demo"** milestone's vague "a calm Settings prompt walks the visitor through pasting a free Gemini key" into this concrete modal + standing card. (`oss_launch_readiness.md`.)
- The **empty-state copy** (§ Empty states) must now be reserved for the **keyed** quiet state; when keyless, the honest "add a key" banner replaces it so quiet-by-design never again masks needs-a-key.

**Still faithful.** The mock example only ever shows the AI _reacting to_ pre-written text (Hard Invariant 1 intact). "One interruption maximum" holds — the welcome modal is the single interruption; the mock-label card is a standing banner, not a nag.

**Sub-decisions settled 2026-07-07 (build-ready):**

- **Closable to "just look around."** The modal **can** be dismissed with no key and no example (an explicit × / "Maybe later"). Autonomy is preserved; the **standing keyless banner** (Decision #3) is what keeps the key requirement visible after dismissal — so a bare close never strands the user in silent-nothing.
- **Copy order: value first, key second.** The modal leads with the inversion framing (what the product is / that it never rewrites you), _then_ names that analyzing your own writing needs a key, _then_ offers the two actions ("See it in action" / "Add your key"). The key ask never opens cold.
- **Re-entry = the standing banner, not a modal re-opener.** The one-time modal is not re-openable (consistent with the removed reset path); the **standing keyless "add your key → Settings" banner** is the persistent re-entry surface for the key ask (always present while keyless). The "See it in action" example stays reachable **from the modal only** (as before) — acceptable, since the banner covers the load-bearing path (getting a key), and the example is a one-time witnessing aid, not a recurring need.

## Revision (2026-07-07) — The example undersells our range: curate for _variety_, not volume

**Status: shipped 2026-07-08.** Field observation (owner): the "See it in action" replay _works_ — it lands the hero contradiction — but it **doesn't expose the full value of the product**. The gap is not volume (the doc is deliberately small and the ~handful of cards is the right count — we don't want a wall). The gap is **variety**: the recorded assessment clusters on a few capabilities and repeats them, so a first-timer sees the tool do the _same kind of thing_ several times instead of witnessing its **range**.

**How it shipped (owner-steered mid-build).** The ambition below was "curate what's there, re-record the real weak-tier output." In practice the recording became a **hybrid** (owner call: "just come up with good cases"): the request **keys** and each response's `summary`/`claims` are captured from a real weak-tier run — so replay hashes match, and the downstream sweep/doc-scan prompts (built from summaries + claims) hash identically — while the **observation arrays are hand-curated** to one clean exemplar per type. Faithful where it counts (the pipeline genuinely runs; observations are output-only and never feed a prompt, so curating them can't shift a request hash) with precise control over the spread. Final roster, each once: `contradiction` · `strategic_tension` · `unsupported_claim` · `undefined_jargon` (BM25) · `clarity` · `missing_topic`. Two build discoveries forced small enablers (in `App.handleLoadExample`, the Editor import effect, and `evaluateDocument`):

> - **The demo never ran the doc-level scan.** The import path calls `setContent(html, false)` — the `false` suppresses the update event, so the 12s doc-idle timer never arms and `evaluateDocument` never fires. Without a fix the example could only ever show section + contradiction cards (`missing_topic` was mechanically unreachable at the witness moment; the old fixture's doc-scan entry was effectively dead). Fix: a `docScan` flag on the example's `importContent` schedules a doc-idle after the sections (it self-defers until they drain), so the doc-level review runs as part of the demo.
> - **The doc-level request hash was nondeterministic.** `evaluateDocument` built its prompt (and dirty-check hash) from the block summaries + claim ledger in raw insertion order, which varies run-to-run — so the same doc produced a different hash every load and couldn't be mocked (observed directly: the doc-scan missed on replay with a fresh hash each time). Fix: sort the summaries + claims by content (mirroring the contradiction sweep, which already sorts "so the prompt + dirty-check hash are deterministic across runs"). A general robustness win — stable dirty-check, replayable/mockable doc-level output — that also lets the `missing_topic` card mock reliably.

**The diagnosis (what the current recording surfaces).** `src/services/exampleDocRecording.ts` replays ~10 observations across only 4–5 distinct types, lopsidedly:

- `contradiction` ×1 — the Q2-vs-Q3 launch-date hero (good).
- `structure_flow` ×2 — **one of which just re-flags the same Q2/Q3 contradiction** (reads as redundant/dumb, not sharp).
- `clarity` ×3 — including surface-ish nits ("Q2 2026 lacks a specific month", "adoption metric lacks a target") that flirt with the anti-taxonomy.
- `tension` ×1, `unsupported_claim` ×1, `missing_topic` ×1, `underexposed_topic` ×1.

Of the **9-type taxonomy** (section: `clarity` · `unsupported_claim` · `undefined_jargon`; document: `missing_topic` · `underexposed_topic` · `audience_mismatch` · `structure_flow`; cross-document: `contradiction` · `tension`), the demo never once shows **`undefined_jargon`** or **`audience_mismatch`**, while spending three cards on clarity and double-flagging the contradiction. Big pile, narrow range.

**The concept (one line).** Re-engineer the small demo doc so its handful of observations each demonstrate a **different** type — one clean exemplar per capability — instead of clustering on clarity and re-flagging the contradiction. Same card count, far wider spread.

**Ambition: curate what's there (owner steer 2026-07-07).** Not a scripted temporal "reveal" (that fights § The example's proud principle that the demo is the _real pipeline on real recorded responses_, not a canned animation). The **doc is the only lever**: plant the signals that elicit the target types, then **re-record** the real model output at weak capability (the documented `record`-mode → `dumpRecordings()` process) and verify the spread landed. Stays honest — we never hand-author cards; we shape the text and record what the model genuinely catches.

**Target roster — 6 distinct types, each appearing once (roster confirmed by owner 2026-07-07):**

| Type                | Disposition | Notes                                                                                                                                                  |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contradiction`     | keep (hero) | The Q2-vs-Q3 date conflict at document distance. Must appear **exactly once** — suppress the `structure_flow` duplicate.                              |
| `tension`           | keep        | The 4-week pipeline vs. 6-week beta-lead tradeoff. Kept **beside** the contradiction deliberately: showing both teaches the discrimination (can't-both-be-true vs. competing-goals) — a flex no grammar tool makes. |
| `unsupported_claim` | keep        | The "nearly a third of every week" stat attributed to vague "internal research".                                                                     |
| `undefined_jargon`  | **add**     | Plant one crisp unexplained term/acronym aimed at the stated audience. Currently never demonstrated.                                                 |
| `clarity`           | keep **one**| Reduce the three clarity nits to a single genuinely-worth-it one; drop the surface-level ones ("lacks a specific month", "lacks a target").          |
| `missing_topic`     | keep        | One expected-but-absent topic.                                                                                                                        |

**Dropped from the target spread:** `audience_mismatch` (owner declined — it would force a stated non-technical audience into doc-context just to elicit it; not worth the added artificiality for the demo), `underexposed_topic` (overlaps `missing_topic` conceptually — one "topic" card is enough), the second/third `clarity` nits, and the `structure_flow` **duplicate** of the contradiction.

**Faithfulness & risks.**

- **Still real pipeline output.** The recording remains captured model output, not authored fixtures (Hard Invariant 1 intact — the AI only reacts to pre-written text). Planting signals to elicit types is exactly what the doc already does for the contradiction + unsupported claim; this extends the plant set.
- **Elicitation is empirical.** Which types a real weak-tier model emits on the engineered text isn't fully controllable — expect a write-doc → record → inspect → adjust loop until the spread is clean (each target type present once, no redundant re-flag, no surface-nit clutter). This is why the milestone is 🧠, not 🔧.
- **Keep the doc small and (optionally) the meta framing.** Owner likes the small size; the self-referential "Sidecar Review" PRD framing is not in scope to replace here (it was flagged but the ambition is curation, not a rewrite of the doc's subject).
- **Re-record both paths.** The recording keys on request hash at **weak** capability (keyless `mock` replay + keyed live-error fallback). After changing the doc text, **every** section/sweep/document-scan hash changes, so the whole `EXAMPLE_DOC_RECORDING` must be regenerated, and `src/services/exampleReplay.test.ts` re-greened.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **6** | The welcome card + first-run persistence, the example-doc fixture + load/clear affordance, the quiet-by-design empty states (editor + feed), the first-settle micro-moment hand-off to R3c, and the "no upfront setup" first-run posture (stage inference, no key gate). |

## Todo

Anchor files: `src/sidecar/SidecarFeed.tsx` (welcome card, empty state, example affordance), `src/App.tsx` (first-run flag, example load/clear), `src/editor/Editor.tsx` (placeholder copy), a new example fixture (e.g. `src/services/exampleDoc.ts`), `src/styles.css` (visual_style tokens).

- [x] **Welcome moment** — a dismissible welcome card at the top of the feed, shown only when a persisted `hasSeenWelcome` flag (localStorage `writtten_has_seen_welcome`) is unset; the flag is set on the explicit × **and** now auto-set once the user is clearly engaged — either (a) they click "See it in action" (`handleLoadExample`) or (b) their first evaluation settles (`handleEvaluationComplete`, wired to the Editor's `onEvaluationComplete`, so it fires even keyless / on skip and only after a real trigger from the user's own text) — added 2026-07-06. Copy + styling per § The welcome moment. Reuses the card/dismiss visual language (no new component vocabulary). Shipped in `SidecarFeed.tsx` (`WelcomeCard`) + `App.tsx`.
- [x] **"See it in action" example** — an example-doc fixture (`src/services/exampleDoc.ts`: short PRD, one planted `contradiction` + one `unsupported_claim`) and a one-click affordance (on the welcome card — the empty-feed duplicate was removed 2026-07-06) that loads it into the editor via the existing `importContent` path and lets the live pipeline react. Guard: offered **only on a blank doc** (`blockOrder.length <= 1`) so it never clobbers the user's own text; clearing the workspace returns to blank.
- [x] **Empty states** — editor placeholder + empty-feed copy that frame the silence as intentional (§ Empty states), visually distinct from the "working" state (`sidecar-status`). Co-owned with `visual_style`; this spec owns the copy + intent, `visual_style` owns the look. **Both legs shipped.** _Empty-feed_ (#46): `.sidecar-empty` — calm copy + subtext (no example link — that lives on the welcome card only, 2026-07-06); distinct from the working chip, which lives on the separate `ControlCenter` `sidecar-status` surface. _Editor placeholder:_ already renders in the editorial treatment the spec asks for — serif (inherits `--font-serif`/Faustina from `.tiptap`, `styles.css`), low-contrast (`--color-muted`), italic, one line (`.tiptap p.is-editor-empty:first-child::before`, `Editor.tsx` `Placeholder`). The copy stays `"Start writing…"` — a deliberate owner call (2026-07-06) to keep it simple over a more editorial line; the surviving spec ideal ("no instructions / reads like prose") is noted as intentionally not pursued.
- [x] **First-settle micro-moment** — the empty→first-card transition is marked by R3c (arriving animation + the quiet `obs-new-badge` "new" pill) and stays calm (no toast/confetti; the batch "+N new" indicator only fires for ≥3). Hand-off verified + guarded by `SidecarFeed.test.tsx` ("first-settle micro-moment").
- [x] **No upfront setup** — verified: first-run shows **no API-key gate** (the key input lives behind the settings gear; free tier + keyless example replay run without it — `App.tsx`/`ControlCenter.tsx`) and **no stage form** (the `DocumentContext` Empty state is a muted "Add context" button; its textarea `autoFocus`es only after the user clicks — never a first-run focused field).
- [x] **Reset path** — ~~a settings affordance ("First-run intro → Show it again", `data-testid="reset-first-run"`) that clears the persisted `hasSeenWelcome` flag and un-collapses the feed so the welcome card returns~~ **Removed 2026-07-06** (owner call). The welcome is now a genuinely one-time moment: the settings reactivation control (and `handleResetFirstRun`) are gone. Accepted consequence — once the welcome is dismissed (explicitly, via "See it in action", or on first-eval settle), the welcome card and its "See it in action" example are no longer reachable from the UI. (Clearing localStorage `writtten_has_seen_welcome` still re-shows it — dev/manual only.)

### First-run activation (§ Revision 2026-07-07) — shipped

- [x] **Blocking welcome modal** — the in-feed `WelcomeCard` is replaced by a centered, closable `WelcomeModal` (`src/sidecar/WelcomeModal.tsx`) reusing the shared `.modal-scrim` / `.modal-card` primitive, with a focus-trap + `Escape`. Value-first copy: headline "You write. I notice." → the inversion → the rhythm → a brand-tint key-ask block → two actions. **"Add your key"** is the accent, activation-first primary (owner call 2026-07-07); **"See it in action"** is the outline secondary (disabled off a blank doc). Dismiss (× / "Maybe later" / Escape / See-it / first-eval settle) sets `writtten_has_seen_welcome`; not re-openable. Rendered from `App.tsx` at the app root.
- [x] **Standing keyless banner** — a brand-tint (not severity) `KeylessBanner` at the top of the feed in **any keyless state** (during the demo _and_ when a keyless user just writes — the recommended any-keyless generalization, owner-confirmed). Its "Add your key in Settings →" link deep-links into the BYOK Settings modal. Copy tunes on `demoActive` (recorded-demo vs. general keyless). `SidecarFeed.tsx` (`KeylessBanner`).
- [x] **Empty-state split** — the quiet-by-design `.sidecar-empty` copy is now reserved for the **keyed** state; keyless, the banner replaces it so quiet-by-design never masks needs-a-key. Gated on `hasKey` in `SidecarFeed.tsx`.
- [x] **Settings deep-link (no new key UI)** — a typed `openSettings()` / `subscribeOpenSettings()` seam (`src/sidecar/settingsGate.ts`, a `window` CustomEvent) lets the modal + banner open the ControlCenter-owned Settings modal without owning its state. ControlCenter subscribes in one `useEffect`. Both the modal's "Add your key" and the banner link route here.

## Design

### Principles

1. **One interruption, maximum.** The welcome card is the single permitted first-run interruption. After it's dismissed, the product is silent until the user's own text earns an observation. No second modal, no nudges, no badges.
2. **Never block the blank page.** Onboarding is additive to an immediately-usable editor. The user can ignore the welcome card and start typing; nothing gates writing. **⚠ Superseded 2026-07-07 (§ Revision):** writing is not gated, but the value _is_ (keyless = zero analysis), and hiding that was the failure — first-run now leads with a blocking welcome modal that names the key requirement.
3. **Quiet is a feature, shown not told.** The empty feed doesn't apologize for being empty or look like it's loading. It states the contract calmly and confidently (R3.5).
4. **Witnessing, not forcing.** The example is offered, never auto-run. The hero proves itself when the user chooses to look.

### The welcome moment

A single card at the top of the feed on first open, styled as a calm variant of the observation card (`visual_style`) but visibly **not** an observation — no severity border, no type tag, no impact dot; brand-accent-tinted (`--color-accent-tint`) so it reads as the product introducing itself, not as a flag.

- **Copy** (product voice — terse, editorial, no hype, ≤ 3 short lines). Intent, not final words:
  - A one-line framing of the inversion: _you_ write; it watches and points, never rewrites.
  - A one-line framing of the rhythm: quiet while you draft, pointed while you revise.
  - The optional affordance: a quiet text link — _"See it in action →"_.
- **Dismiss:** the standard dismiss affordance (mechanics C3) — but **no Undo toast and no suppression write** (it's chrome, not an observation). Dismissing sets the persisted `hasSeenWelcome` flag so it never returns unprompted. The flag also auto-sets on two engagement signals (2026-07-06), so the card retires itself without a manual ×: clicking "See it in action", and the user's **first evaluation settling** (they've drafted enough of their own text for the pipeline to run). These only make the single first-run interruption exit _sooner_ — never a second one.
- **Persistence:** localStorage flag (single-document app today; a per-user/multi-doc story arrives with Phase 7 — don't over-build).

### The example ("See it in action")

- **Trigger:** the _"See it in action →"_ link in the welcome card — **and only there** (decided 2026-07-06). The empty feed no longer carries a duplicate. Since the reset path was removed (2026-07-06, § Reset path), the example is reachable only during the one-time welcome; clicking the link also retires the welcome. A user who wants it again must clear the `writtten_has_seen_welcome` localStorage flag (dev/manual only).
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
- **Empty feed** — the quiet-by-design surface. States the rhythm ("Quiet while you draft — I'll speak up as you revise") calmly, and is **visually distinct from the working state** (the `sidecar-status` "working" chip, `aria-live`) so "intentionally quiet" never reads as "stuck loading." Replaces today's `.sidecar-empty` emoji-icon treatment with the visual_style empty-state language. (It carries **no** _"See it in action"_ link — that affordance lives on the welcome card only; decided 2026-07-06.)

### First-settle micro-moment

The first observation a user ever sees (in their own doc) is the real first impression of the hero. This spec doesn't animate it — **R3c (feed choreography)** owns enter animation + the transient "new" badge. Onboarding's only requirement: the empty→first-card transition must not be change-blind (the user shouldn't miss that the feed just spoke for the first time), and it must stay calm (no celebratory toast/confetti — that would betray the register). The hand-off to R3c is the deliverable here.

### No upfront setup

First-run asks for nothing:

- **No stage form.** The stage is _inferred_ once enough content exists and shown back for one-click confirm (features.md → stage inference). A blank-field setup step would starve exactly the checks that need it and contradict the calm posture.

  > **Resolved 2026-06-18 — the always-visible context chip.** "No first-run form" must not mean "permanently hidden." Today the combined **Document Context / Stage** field (it's already _one_ input, not two — `SidecarFeed.tsx:643`) lives only behind the settings gear, and the inferred-context suggestion is a _separate_ transient chip (`stage-suggestion`, `SidecarFeed.tsx:675`). The decision: replace both with **one quiet, persistent context affordance** at the top of the feed panel — never a setup gate, always legible. See § The context chip (stage discoverability) below for the full spec.

- **No API-key gate.** The free tier runs keyless. BYO-key lives in settings; any nudge toward it is quiet and surfaces only _after_ the user has seen value, never as a first-run blocker. **⚠ Superseded 2026-07-07 (§ Revision):** "free tier runs keyless" is false in practice — keyless the evaluator skips every check (no bundled key), so the user's own writing produces nothing. First-run now surfaces the key requirement up front (blocking welcome modal) and persistently (a standing "this is a mock — add your key" card). Keyless is a **demo**.

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
