---
status: idea
phases: [4, 5]
summary: Build the three unguarded philosophy guardrails — flattery-resistant dismissal, an explicit anti-taxonomy, and no-disguised-fix register discipline — plus a discomfort-budget ceiling, so the qualitative half of the fidelity bar is enforced in code and CI rather than left to model goodwill.
---

# Philosophy Guardrails

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — scheduled across two phases.** The 2026-06-04 requirements analysis (`docs/snapshots/2026-06-04_requirements-analysis.md`) found that the product meets the _structural_ floor of the fidelity bar but leaves three _qualitative_ guardrails asserted-but-unbuilt: they look like helpfulness from the inside, so nothing in code stops them. This project builds the guards.

- **Phase 4 (current core experience):** G1 flattery-resistant dismissal, G2 anti-taxonomy. These are trust/signal-quality work — they belong with the calm-feed milestones, not in packaging.
- **Phase 5:** G3 no-disguised-fix register polish (the prompt rule lands in Phase 4; the human-tone half rides with `emotional_register`), G4 discomfort-budget ceiling.

Read alongside:

- `docs/product-requirements.md` (the requirements these enforce: R2.2–R2.4, R4.3, R5.4, R6.3).
- `docs/features.md` (_Anti-taxonomy_, _Register discipline_, _Dismissal should teach_ — the product-level homes for G1–G3).
- `docs/architecture.md` (_Persistence_ — suppression data model for G1; _Extension seams_ — prompt-seam enforcement for G2/G3).
- `docs/projects/evaluator_quality_ratchet.md` (the fixture corpus G2/G3 negative-assertion gates extend).
- `docs/projects/observation_taxonomy_and_priority.md` (the feed budget / contradiction floor G4 modifies).
- `docs/projects/emotional_register.md` (sibling — the felt/tone half of register; G3's human side).

## Phased Plan

| Phase | Contributes |
| --- | --- |
| **4** | **G1** kind/severity-aware dismissal suppression (flattery guard) and **G2** explicit anti-taxonomy negative list + ratchet fixture. Both directly serve the Phase 4 exit criterion that the feed is calm _and trustworthy_. |
| **5** | **G3** no-disguised-fix register rule hardened with a message lint/fixture; **G4** discomfort-budget ceiling on the contradiction floor. Land once the core loop is worth living in. |

## Todo

### Phase 4

- [ ] **G1 — Flattery-resistant dismissal (R5.4).**
  - [ ] Make `DismissalSuppression` (`src/store/db.ts`) carry the observation `kind`/`severity` of the dismissed item.
  - [ ] Update `isSpanSuppressed` (`src/services/evaluator.ts:111`) so a high-severity defect/`contradiction` dismissal suppresses only _that span_, never the category on other spans. Low-severity nit dismissals keep the existing category/term-wide suppression.
  - [ ] Decide the gesture: either high-severity dismissal is inherently span-scoped, or it requires a distinct "not a real issue" affordance that doesn't train silence (UI decision — keep it one click).
  - [ ] IndexedDB migration for the new suppression fields (follow the existing migration pattern in `src/store/db.ts`).
  - [ ] Fixture/test: seed two contradictions on different spans, dismiss one, assert the other still fires (the R5.4 gate in `fidelity-criteria.md`).
- [ ] **G2 — Anti-taxonomy (R4.3).**
  - [ ] Add an explicit negative-list instruction to the span-check prompt (`src/services/evaluator.ts` ~L277–291): never flag grammar, spelling, punctuation, passive voice, sentence length, word choice, readability, "consider rephrasing."
  - [ ] Add a ratchet fixture (`src/services/eval-fixtures/`) whose labeled expectation asserts none of these categories appear on a deliberately surface-flawed-but-substantively-clean doc.
  - [ ] Wire the assertion into the Tier-1 deterministic scorer so a prompt regression fails CI.

### Phase 5

- [ ] **G3 — No-disguised-fix register rule (R2.2–R2.4).**
  - [ ] Prompt rule across all observation prompts: messages locate, never prescribe; no leading/Socratic questions; no replacement text. (Partly present — make it explicit and uniform.)
  - [ ] Message lint / fixture: assert no generated message contains an imperative-prescription pattern ("you need…", "add…", "change…") or a `?`-terminated leading clause.
  - [ ] Hand the felt-tone half to `emotional_register.md`.
- [ ] **G4 — Discomfort-budget ceiling (R6.3).**
  - [ ] Decide whether the contradiction floor in `src/sidecar/feedBudget.ts` needs a ceiling so a doc with many hard critiques doesn't surface them all at once.
  - [ ] If yes: cap floored items, overflow into the "also noticed" drawer ordered by priority; unit-test the partition.

## Design

### G1 — Flattery-resistant dismissal

Today suppression is keyed on `(type, spanSignature)` (and `type` alone for doc-level). That is correct for the tunable case ("this clarity nit on this term is noise") but wrong for the load-bearing case: dismissing a true `contradiction` writes a suppression that can silence the _category_, which is exactly the flattery-learning failure mode the product defines itself against. The fix is to make the _scope_ of a suppression a function of the dismissed item's `kind`/`severity`:

- **low/medium-severity opportunity or surface-ish defect** → category/term suppression (current behavior, keep).
- **high-severity defect / `contradiction` / `unsupported_claim` over a commitment** → span-only suppression; never category-wide. The user is saying "not here," not "never."

This is a data-model property (`DismissalSuppression` gains `kind`/`severity`; `isSpanSuppressed` branches on them), which is why it's recorded in `docs/architecture.md` → _Persistence_, not just UI.

### G2 — Anti-taxonomy

Enforced in two layers (see `docs/features.md` → _Anti-taxonomy_): structural (no taxonomy slot) + prompt-seam negative instruction, with a ratchet fixture as the regression gate. The fixture is the important part — "be deep" is not self-enforcing, so the only durable guard is a test that fails when surface nits reappear.

### G3 — No-disguised-fix register

The disguised fix (leading questions) and the cold fix (hostile tone) are the two ways register discipline rots. The prompt rule is cheap; the durable guard is a lint/fixture over generated messages. Tone (the cold-fix half) is qualitative and lives with `emotional_register.md`.

### G4 — Discomfort-budget ceiling

The budget feed caps the _count_ of visible cards, but the `contradiction` floor exempts contradictions from the budget — so a document with six real contradictions surfaces all six, which the requirements doc warns is demoralizing regardless of accuracy (R6.3). The open question is whether the floor needs a ceiling, and if so how overflow is signposted so the user knows more hard items await without being hit by all of them at once.
