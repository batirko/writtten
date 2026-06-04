# Product Requirements — The Fidelity Bar

> **What faithfully holding the inversion means.** Read `docs/concept.md` for the _why_, `docs/features.md` for the _what_, `docs/architecture.md` for the _how_, and `docs/plan.md` for sequencing. This file is the canonical requirements source: the line below which the thing stops being this product. Acceptance gates derived from it live in `docs/acceptance-testing/fidelity-criteria.md`.

> **Framing note:** The philosophy _is_ the requirement set here, because the product is defined by what it refuses to do. "Minimum" isn't a stripped-down feature list — it's the line below which the thing stops being this product and quietly becomes a worse version of the tools it's reacting against. The tiers are tiers of **fidelity**, not completeness. Every level is measured by how faithfully it holds the inversion. The most dangerous failures are the ones that look like helpfulness.

---

## 1. The Inversion — Who Holds the Pen

This is binary at the floor, not a gradient.

**Minimum:** The AI is architecturally incapable of writing into the document. No apply button, no autocomplete, no ghost text, no "rewrite this" affordance anywhere — and crucially, no code path that _could_ inject text. If injection exists as a disabled feature or a setting, you've built a back door to your own betrayal. The absence has to be structural, not configured.

**Good enough:** The absence reads as intentional and dignifying rather than as a missing feature. The user never reaches for "just fix it," because the interaction never trained them to expect it. That's a UX-shaping problem — designing so the hands stay on the work without the user feeling deprived.

**Superb:** The user experiences the constraint as the _source_ of value and would decline text injection if offered, because they've felt what doing the writing themselves gives them. The limitation has become a preference.

---

## 2. The Withheld Fix — Register Discipline

This is the subtle axis and the real engineering challenge, because the natural gradient of a helpful model pulls toward the fix.

**Minimum:** Observations never contain a correction, replacement text, or "you could say X." They point; they don't patch.

The hard line lives _inside_ this. There's a difference between locating a problem ("the claim in ¶3 isn't supported by anything in the document") and prescribing the move ("you need a data point here"). Even the prescription tips into doing the thinking. The discipline is to name what's wrong / missing / conflicting and stop exactly there.

**Two failure modes to design against explicitly:**

- **The Socratic-theater trap.** Tools that withhold the answer often substitute leading questions ("Have you considered whether users actually want this?"). That's frequently _more_ patronizing than a fix, and it smuggles the fix in disguised as a question. Naming a real tension is more respectful than rhetorical questioning. Provocations shouldn't be gotchas.
- **Cold withholding.** "Here's what's wrong, figure it out" is emotionally harder to receive than critique-with-a-fix. The tone has to carry the difference between _withholding to respect you_ and _withholding to be difficult._

**Good enough:** Observations land with enough context that the user understands _why_ it's a problem without being told what to do about it.

**Superb:** The phrasing produces the "oh, damn" moment a sharp colleague produces — making you see the problem the way they'd make you see it, without reaching for your keyboard. Terse, non-condescending, assumes competence.

---

## 3. The Temporal Rhythm — When It Speaks

The hardest thing to build well and the most likely to make or break the felt experience, because "settling detection" is a real signal problem with no clean ground truth.

**Minimum:** Never interrupt active typing, never fire mid-sentence, never react on keystroke. A debounce floor. Below this it's a linter, and a linter is hostile to thought.

**Good enough:** Timing correlates with actual cognitive state — quiet during generative bursts, present when the user steps back — using real signals (pause length, paragraph completion, returning to an earlier passage, an explicit "done with this section") rather than a dumb timer.

**Superb:** The timing has taste — the difference between "she's mid-thought, leave her alone" and "she's stuck and would welcome a poke." This likely needs per-user, per-phase rhythm modeling, and it must **default to silence under uncertainty.** A missed observation costs far less than a wrongly-timed one. And the silence itself has to _feel confident_ — a quiet feed during drafting should read as "it's respecting my flow," not "is this thing broken?" The quiet state is a design surface, not an empty one.

> **Honest caveat:** Silence-during-drafting is a _bet_, not a settled truth. Some users genuinely want a sounding board during formation. The rhythm is principled — keep it — but it's a wager on a particular theory of how thinking works, and worth watching whether users fight it.

---

## 4. The Typed Taxonomy — What It's Allowed to Notice

The fixedness is the trust contract.

**Minimum:** Observations are honestly classified — a defect is a defect, not a dressed-up style nit — and there's no free-form "here are my thoughts" escape hatch.

The gravity well to resist: meaning-level critique is hard and unreliable; surface-level critique is easy and reliable. Both model behavior and metrics will pull the system toward catchable trivialities — passive voice, sentence length, "consider rephrasing." The moment it flags grammar, it has become the thing it defines itself against. You may need an explicit **anti-taxonomy** — categories it must never surface — to hold the line, because "be deep" is not a constraint a model reliably self-enforces. The negative list and its enforcement live in `docs/features.md` → _Anti-taxonomy_.

**A note on the three types:** _Opportunities_ is the most philosophically dangerous category. "Something is missing" is one step from telling the user what to add, and it's the one most prone to unfalsifiable vagueness ("this could be stronger" is true of everything). Defects and cross-claim issues are checkable against the text; opportunities lean on the model's judgment of what _should_ exist, which is exactly where it starts doing the thinking. Tighten its criteria hardest.

**Good enough:** High precision per type. Precision dominates recall here — trust is asymmetric. One "contradiction" that isn't one and the user discounts the entire feed. Three real issues beat ten with two pieces of noise.

**Superb:** Cross-claim detection does the thing the user genuinely _cannot_ do alone — holding the whole document in view and catching the tension between page 2 and page 9 that a linear reader missed. That category is the load-bearing justification for the product's existence; defects and opportunities are valuable, but a careful human can self-catch most of them. Contradiction-at-distance is the wow because it's the one capability a human can't replicate unaided.

---

## 5. The Lifecycle — The Feed Is Alive

**Minimum:** Observations resolve on edit, can be dismissed, persist in an archive. Not a one-shot audit.

The hard part hides in "resolve when the user edits the passage." That requires anchoring to _spans of meaning_, not character offsets, and re-evaluating whether the edit addressed the _problem_ versus merely touching the text. Naive resolution lets users dismiss critique by twiddling a word. Requirement: resolution reflects whether the problem is gone, not whether the text changed.

**Good enough:** Dismissals teach — the feed gets quieter and sharper over a session, not noisier, learning per-document and ideally standing preferences.

**The sharpest risk here:** Dismissal-learning can collapse into flattery-learning. If "stop nagging me" trains the system to stop surfacing uncomfortable truths, you've built a tool that learns to flatter — the precise failure mode of the generation tools, arrived at from the opposite direction. The learning must distinguish "this _category of nit_ isn't useful to me" (tunable) from "I don't want to hear that my argument is weak" (the whole point, and it must be resistant to being trained away). The mechanism and its data-model implications live in `docs/features.md` → _Dismissal should teach_ and `docs/architecture.md` → _Persistence_.

**Superb:** The archive becomes a record of the document's intellectual evolution — which tensions you resolved and how — turning the lifecycle into a reflection layer, not just task management.

---

## 6. The Vibes Layer — Emotional Register

This deserves separate treatment because it's the biggest non-technical risk. Critique-without-a-fix is harder to take than critique-with-one; you're asking the user to sit in discomfort. The relationship the feed establishes is everything.

**The wrong personas:** the _linter_ (mechanical, nagging), the _boss_ (judging), the _pedant_ (surface-obsessed), the _therapist_ (soft, validating, useless), the _smartass_ (gotchas).

**The right one:** The trusted senior colleague who reads your draft, doesn't touch your keyboard, and says the one thing that makes you go "...yeah." Respects you enough not to explain the fix.

| Level           | Emotional bar                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Minimum**     | Not insulting, not anxiety-generating, not condescending. Doesn't make the user feel dumb.                                                      |
| **Good enough** | The user trusts it enough to act on it — trust earned through precision and timing — and feels it's on their side even when it's uncomfortable. |
| **Superb**      | Using it makes the user feel _sharper_, and feel that the sharpness is theirs, not borrowed.                                                    |

The terminal vibe is **ownership**: finishing a doc that feels _more_ yours than your unaided drafts, because the tool pushed you deeper into your own thinking instead of outsourcing it. That's the exact emotional inverse of generation tools — those leave you feeling faintly fraudulent; this should leave you feeling more like the author.

> **Design for a discomfort budget.** Too much true-but-hard critique at once is demoralizing regardless of accuracy. Rhythm and precision aren't only noise control — they keep the user in the productive zone of discomfort rather than the demoralized one.

---

## The Load-Bearing Tensions

The places where a reasonable engineering decision quietly betrays the philosophy:

1. **Precision over recall, always** — trust is asymmetric.
2. **The surface-drift gravity well** — the system rots toward easy, catchable trivialities unless actively prevented.
3. **Settling detection has no ground truth** — default to silence.
4. **Dismissal-learning must not become flattery-learning.**
5. **The withheld fix must not become disguised-fix (leading questions) or cold-fix (bad tone).**

Each one looks like helpfulness from the inside. That's the through-line — the threats to this product don't arrive as obvious violations; they arrive as the model trying to be useful in the way every other tool is useful. Holding the inversion means treating that pull as the adversary.

---

## Requirement decomposition

Atomic, individually-checkable requirements, each with a stable ID so acceptance gates (`docs/acceptance-testing/fidelity-criteria.md`) and project todos can cite them. **Nature:** _structural_ (architecturally enforced) · _behavioral_ (observable runtime behavior) · _qualitative_ (felt experience, human-judged).

### R1 — The Inversion (structural)

| ID | Requirement |
| --- | --- |
| R1.1 | No apply / autocomplete / ghost-text / rewrite affordance exists in the UI. |
| R1.2 | No code path is _capable_ of injecting text into the document, even disabled or behind a setting. |
| R1.3 | The absence reads as intentional and dignifying, not as a missing feature (UX/empty-state shaping). |
| R1.4 | The user experiences the constraint as the _source_ of value (would decline injection if offered). |

### R2 — The Withheld Fix / Register Discipline (behavioral + qualitative)

| ID | Requirement |
| --- | --- |
| R2.1 | Observations contain no correction, replacement text, or "you could say X." |
| R2.2 | Observations _locate_ the problem; they do not _prescribe_ the move ("you need a data point here"). |
| R2.3 | No leading / Socratic questions that smuggle a fix in disguised as rhetoric. |
| R2.4 | Tone carries "withholding to respect you," not "withholding to be difficult" (no cold-fix). |
| R2.5 | Observations land with enough context that the user understands _why_ it's a problem. |

### R3 — Temporal Rhythm (behavioral)

| ID | Requirement |
| --- | --- |
| R3.1 | Never fire mid-sentence / on keystroke; a debounce floor on settled blocks. |
| R3.2 | Document-level checks gate behind a content threshold. |
| R3.3 | Timing uses real cognitive signals (pause, paragraph completion, return-to-passage, explicit done) not a dumb timer. |
| R3.4 | Default to silence under uncertainty — a missed observation costs less than a wrongly-timed one. |
| R3.5 | The quiet state _feels_ confident and intentional, not broken (empty-state design). |
| R3.6 | Per-user / per-phase rhythm modeling (superb tier). |

### R4 — Typed Taxonomy (structural + behavioral)

| ID | Requirement |
| --- | --- |
| R4.1 | Observations come from a fixed typed list; no free-form "here are my thoughts" escape hatch. |
| R4.2 | Honest classification — a defect is a defect, not a dressed-up style nit. |
| R4.3 | An explicit **anti-taxonomy** — categories the system must never surface (grammar, spelling, passive voice, sentence length, word choice, "consider rephrasing"). |
| R4.4 | High precision per type; precision dominates recall. |
| R4.5 | Opportunity-nature types carry the tightest criteria (most prone to vagueness / doing-the-thinking). |
| R4.6 | Cross-claim contradiction-at-distance works (the load-bearing wow). |

### R5 — Lifecycle (behavioral)

| ID | Requirement |
| --- | --- |
| R5.1 | Observations resolve on edit, can be dismissed, and persist in a browsable archive. |
| R5.2 | Resolution reflects whether the _problem_ is gone, not merely whether the text changed. |
| R5.3 | Dismissals teach — the feed gets quieter and sharper over a session. |
| R5.4 | Dismissal-learning distinguishes "this _category of nit_ is useless" (tunable) from "I don't want to hear my argument is weak" (must resist being trained away). |
| R5.5 | The archive becomes a record of the document's intellectual evolution (superb tier). |

### R6 — Emotional Register (qualitative)

| ID | Requirement |
| --- | --- |
| R6.1 | Not insulting / anxiety-generating / condescending; doesn't make the user feel dumb. |
| R6.2 | Embodies the trusted-senior-colleague persona; avoids linter / boss / pedant / therapist / smartass. |
| R6.3 | Respects a **discomfort budget** — caps true-but-hard critique per moment (emotional weight, not just count). |
| R6.4 | Using it makes the user feel _sharper_, and that the sharpness is theirs (superb tier). |
