# Features & Workflows

> The _what_. Philosophy is in `docs/concept.md`; implementation mechanics are in `docs/architecture.md`. Phase boundaries (what to build now vs later) are in `docs/plan.md`.

## The two-panel layout

- **Editor (primary, left/center):** a rich text editor where the user writes everything themselves. No AI authoring affordances of any kind.
- **Observation feed (sidecar, right):** a live, scrollable list of AI-generated observation messages about the current document. This is where the AI "speaks."

## Core workflow

1. User opens or starts a document and writes in the editor.
2. While the user is actively generating (typing, incomplete content), the feed stays quiet.
3. As blocks _settle_ and the document crosses a content threshold, the AI begins surfacing observations into the feed.
4. Each observation is typed (from a fixed taxonomy), may be anchored to a span of text, and carries a short human-readable note. **It never includes a rewrite or an apply button** — and it goes further than that: it _locates_ the problem without _prescribing the move_. See _Register discipline_ below.
5. Hovering an observation highlights the span it refers to (if it has one). Document-level observations highlight nothing / indicate "whole document."
6. As the user edits, affected observations are re-evaluated and **auto-close** if resolved.
7. The user can dismiss any observation manually.
8. Closed and dismissed observations move to an **archive**, which remains accessible.
9. When done, the user exports/copies the text to take it elsewhere.

## The observation taxonomy (fixed, typed)

Observations are **not** free-form LLM reactions. They come from a defined list. Each type has its own prompt, its own firing threshold, and its own UI treatment. A fixed taxonomy is what makes the system tunable, evaluable, and trustworthy.

Two classifying axes:

- **Scope:** `span` (anchored to specific text) vs `document` (about the doc as a whole).
- **Nature:** `defect` (something is wrong) vs `opportunity` (something is missing/underdeveloped).

Starting set:

| Type                 | Scope                  | Nature      | What it flags                                                                                                                                      |
| -------------------- | ---------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clarity`            | span                   | defect      | Ambiguous, vague, or hard-to-parse passage.                                                                                                        |
| `contradiction`      | span↔span / span↔stage | defect      | A claim that **logically cannot coexist** with another claim or the stated stage. **Hero feature.**                                                |
| `strategic_tension`  | span↔span              | opportunity | Two claims each desirable but pulling in opposite directions — a deliberate tradeoff, not a logical paradox. Softer register than `contradiction`. |
| `unsupported_claim`  | span                   | defect      | An assertion presented as fact without basis.                                                                                                      |
| `undefined_jargon`   | span                   | defect      | A term likely undefined for the stated audience.                                                                                                   |
| `underexposed_topic` | span / document        | opportunity | A topic mentioned but not developed.                                                                                                               |
| `missing_topic`      | document               | opportunity | A topic this _kind_ of doc usually covers but this one omits. Depends on the stage.                                                                |
| `structure_flow`     | document               | opportunity | Ordering / flow issues across sections.                                                                                                            |
| `audience_mismatch`  | document               | opportunity | Tone/depth misaligned with the stated audience.                                                                                                    |

This list is expected to evolve. Add types by extending the taxonomy and giving each a prompt and threshold — never by loosening into open-ended generation. See `docs/architecture.md` for how a type maps to a check.

### Per-type behavior notes

- **`contradiction`** is the priority. It can reference two spans (highlight both on hover) or a span against the stage definition. Lean on the claim ledger (see architecture). Reserved for genuine logical incompatibility — a conflict in a number, date, commitment, or fact.
- **`strategic_tension`** is the soft sibling of `contradiction`, produced by the same cross-claim check. When two claims compete on goals/priorities rather than facts (e.g. "notify on every fraud block" vs. "minimize friction"), the check routes them here instead of firing a false contradiction. Same dual-span highlight, but `opportunity` kind (teal, non-alarm) and **never floored** — it provokes without crying wolf. Added 2026-06-04 to resolve OBS-004.
- **`missing_topic`** and **`audience_mismatch`** are only as good as the stage definition. They should stay quiet until the stage is known/inferred.
- **`clarity`** is the cheapest, highest-frequency, span-local check — good for the first build.

### Anti-taxonomy (never surface)

The fixed list above is the _positive_ taxonomy. It is paired with a **negative list** the system must never surface, because the gravity well of any critique model is toward easy, catchable trivialities — and the moment it flags grammar, it has become the thing this product defines itself against. (R4.3 in `docs/product-requirements.md`.)

**Never surface:** grammar, spelling, punctuation, passive voice, sentence length, word choice, readability scores, "consider rephrasing," or any other surface/style nit.

This is enforced two ways, because "be deep" is not a constraint a model self-enforces:

1. **Structurally** — the closed taxonomy has no type these would map to, so there is no slot for them.
2. **At the prompt seam** — span-check prompts carry an explicit negative instruction, and the evaluator quality ratchet (`docs/projects/evaluator_quality_ratchet.md`) holds a fixture asserting these categories never appear in generated output.

If a future request asks for a "tone" or "concision" or "grammar" check, it belongs in the anti-taxonomy, not the taxonomy. Owned by `docs/projects/philosophy_guardrails.md` (G2).

### Register discipline (locate, don't prescribe)

A message may name what is wrong, missing, or conflicting — and must stop exactly there. The line is finer than "no apply button":

- ✅ "The claim in ¶3 isn't supported by anything else in the document." (locates)
- ❌ "You need a data point here." / "Add a metric to back this." (prescribes the move — the AI did the thinking)
- ❌ "Have you considered whether users actually want this?" (a **leading question** — smuggles a fix in disguised as rhetoric; often _more_ patronizing than a plain fix)

Two failure modes to design against (R2.2–R2.4): the **disguised fix** (Socratic-theater questions) and the **cold fix** (correct but tonally hostile — "here's what's wrong, figure it out"). Naming a real tension is more respectful than rhetorical questioning. Enforced at the prompt seam + ratchet fixtures; owned by `docs/projects/philosophy_guardrails.md` (G3). Tone itself is the subject of `docs/projects/emotional_register.md`.

## The stage definition

An optional short free-text paragraph where the user states what the document is and any key details ("internal PRD for the payments team about Q3 fraud tooling; audience is eng + design"). This grounds the document-level checks.

**Improvement over a blank optional field:** blank optional fields stay empty, which starves the checks that need them most. Instead, **infer a provisional stage from the content** once enough exists, and show it back for one-click confirmation:

> "Looks like a PRD for an internal engineering audience — right?" [Confirm] [Edit]

The inference itself is a perfect quiet sidecar moment: the AI demonstrating it understands what the user is doing without being briefed. The user can always edit the stage manually.

## Observation message lifecycle

States:

- `active` — currently shown in the feed.
- `auto_closed` — resolved by a user edit; moved to archive automatically.
- `dismissed` — waved off by the user; moved to archive.
- `superseded` — replaced by a newer, more relevant observation about the same span/issue.

All non-`active` states are visible in the **archive**. The archive is browsable and filterable (by type, by state). Auto-closing on edit is essential — it's what makes the feed feel alive and responsive rather than a static lint report.

### Dismissal should teach — but must never flatter

When a user dismisses an observation, suppress that specific observation (and ideally that _kind_ of observation for that _term/span_) for the rest of the document. Re-nagging about something the user explicitly waved off is the fastest way to make the tool feel dumb. Cheap to implement, large effect on perceived intelligence. **Scope, honestly (2026-06-10 audit #10):** suppression today is **per-document** — the app is single-document (`DOC_ID` is a fixed constant in `App.tsx`/`Editor.tsx`). A **per-user** preference is a future option, not a current surface; it arrives with the multi-document work (Phase 6), not before.

**The hard line: dismissal-learning must not collapse into flattery-learning** (R5.4). If "stop nagging me" trains the system to stop surfacing uncomfortable truths, you've built a tool that learns to flatter — the exact failure mode of the generation tools, reached from the opposite direction. The suppression must distinguish two intents:

- **"This _category of nit_ isn't useful to me"** — tunable. Muting a low-severity clarity/jargon flag for a term is fine and should stick.
- **"I don't want to hear that my argument is weak"** — the whole point of the product, and it must be **resistant to being trained away.** Dismissing a high-severity defect or `contradiction` means "I disagree this is a real issue _here_," not "stop checking for this." It must not suppress the same category on _other_ spans.

Concretely: suppression records are **kind/severity-aware**, and high-severity critique either doesn't create a category-wide suppression or requires a distinct "not a real issue" gesture that doesn't silence the class. The data-model implication lives in `docs/architecture.md` → _Persistence_; the work is owned by `docs/projects/philosophy_guardrails.md` (G1).

## Anchoring & highlighting

Observations point at spans; the user edits; spans move. Highlights must **follow their text through edits**, not sit at frozen character offsets. This is a hard requirement that drives the editor choice (ProseMirror decorations + position mapping — see `docs/architecture.md`). If a span is deleted entirely, its observation should auto-close (the thing it referred to is gone).

Hover behavior:

- Hover a span-scoped observation → highlight its span(s) in the editor; scroll into view if off-screen.
- Hover a document-scoped observation → show a subtle "whole document" affordance, no span highlight.

## Quiet / warm-up behavior (UX surface of the philosophy)

- **Span checks** fire only on _settled_ blocks: debounced after typing stops, block ends in terminal punctuation, and meets a minimum length. Never critique mid-sentence.
- **Document checks** start only after the document crosses a content threshold (enough blocks / words for the master summary and claim ledger to be meaningful).
- The empty/early state should communicate the intent: the tool is _deliberately_ quiet while you draft and will speak up as you revise — not "loading," but "letting you think."

## Emotional register

Critique-without-a-fix is harder to take than critique-with-one — you're asking the user to sit in productive discomfort. The relationship the feed establishes is therefore a first-class feature, not polish (R6 in `docs/product-requirements.md`).

**The persona:** the trusted senior colleague who reads your draft, doesn't touch your keyboard, and says the one thing that makes you go "...yeah." Terse, non-condescending, assumes competence.

**The wrong personas** (anti-patterns to design messages against):

- the **linter** — mechanical, nagging;
- the **boss** — judging;
- the **pedant** — surface-obsessed (this is the anti-taxonomy wearing a personality);
- the **therapist** — soft, validating, useless;
- the **smartass** — gotchas and leading questions (this is the disguised fix wearing a personality).

**The discomfort budget.** Too much true-but-hard critique at once is demoralizing _regardless of accuracy_. The budget-based calm feed caps the _count_ of visible items; the discomfort budget is about _emotional weight_ — a document with many real contradictions should not surface them all at once via the contradiction floor (R6.3). Rhythm and precision aren't only noise control; they keep the user in the productive zone of discomfort, not the demoralized one.

The persona spec, the message voice guide, and tone-as-an-eval-dimension are owned by `docs/projects/emotional_register.md`; the discomfort-budget ceiling is `docs/projects/philosophy_guardrails.md` (G4).

## Export & import

Users write here, then take the text elsewhere — so frictionless egress is core, not a footnote.

- **Export:** Markdown (`.md`), PDF (`.pdf`).
- **Copy to clipboard:** rich text _and_ Markdown.
- **Import / round-trip:** keep the editor schema Markdown-friendly so users can paste/import existing drafts and round-trip losslessly. PMs will arrive with text already written.

## Where observations come from (user-facing)

- **Free tier:** cheap/fast models plugged in by default — enough to demonstrate the loop, with two caveats the 2026-06-10 audit (#3) made explicit: the binding constraint is ~20 requests/day per Flash model (and **0** RPD for the pro tier the strong checks are designed around), so a full real-PRD revision can exhaust quota mid-session; and free-tier "strong" checks run on a weak model, which can emit confident false contradictions — the single failure (R4.4) that discounts the entire feed. Whether the free tier is a _real tier_ or a _demo_ is an open decision (`docs/plan.md` → Strategic open questions); `docs/projects/field_validation.md` V1 measures the free-vs-paid delta that should settle it.
- **BYO-key:** users supply their own API key for stronger models and better observations, paying their own inference costs. This is a settings-level choice, surfaced plainly. Mechanics and the router abstraction are in `docs/architecture.md`.
- **Connect your agent (BYOA, shipped 2026-07-20):** an external coding-agent session the user already runs (Claude Code, Codex, …) connects over loopback and submits observations into the same feed. No key, no RPD cost, and no writtten-side egress at all — the strongest privacy claim of the three. First-run offers it as an **equal** path to "add a key" (decision 3), not a power-user afterthought. **The honest cost, accepted at Gate 1:** these observations do **not** sit behind the precision floors or the fixture ratchet that guard our own, and cannot — so the per-card **source chip** is the containment, and the user is expected to learn to discount a bad *source* rather than the feed. Desktop-only (it needs a terminal); Safari can't reach a local bridge. → see `docs/projects/agent_connected_eval.md`, `docs/mechanics/agent-bridge.md`.
