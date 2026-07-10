---
status: done
kind: quality
phases: [4, 6]
summary: Build the three unguarded philosophy guardrails — flattery-resistant dismissal, an explicit anti-taxonomy, and no-disguised-fix register discipline — plus a discomfort-budget ceiling, so the qualitative half of the fidelity bar is enforced in code and CI rather than left to model goodwill.
---

# Philosophy Guardrails

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Done — all four guardrails shipped** (status closed 2026-07-10; the Todo checkmarks below were reconciled against the shipped record in `docs/plan-archive.md`): G1 severity-aware dismissal suppression (high-severity/`contradiction` dismissals are span-only, `isSpanSuppressed`), G2 anti-taxonomy negative-list prompt rule + the `anti-taxonomy` ratchet fixture, G3 no-disguised-fix register rule hardened with a message lint/fixture, G4 contradiction floor+ceiling (`CONTRADICTION_CEILING=3` in `feedBudget.ts`, shipped 2026-06-19). Original scope framing kept below for the record. The 2026-06-04 requirements analysis (`docs/snapshots/2026-06-04_requirements-analysis.md`) found that the product met the _structural_ floor of the fidelity bar but left three _qualitative_ guardrails asserted-but-unbuilt: they look like helpfulness from the inside, so nothing in code stops them. This project built the guards.

- **Phase 4 (current core experience):** G1 flattery-resistant dismissal, G2 anti-taxonomy. These are trust/signal-quality work — they belong with the calm-feed milestones, not in packaging.
- **Phase 6:** G3 no-disguised-fix register polish (the prompt rule lands in Phase 4; the human-tone half rides with `emotional_register`), G4 discomfort-budget ceiling.

Read alongside:

- `docs/product-requirements.md` (the requirements these enforce: R2.2–R2.4, R4.3, R5.4, R6.3).
- `docs/features.md` (_Anti-taxonomy_, _Register discipline_, _Dismissal should teach_ — the product-level homes for G1–G3).
- `docs/architecture.md` (_Persistence_ — suppression data model for G1; _Extension seams_ — prompt-seam enforcement for G2/G3).
- `docs/projects/evaluator_quality_ratchet.md` (the fixture corpus G2/G3 negative-assertion gates extend).
- `docs/projects/observation_taxonomy_and_priority.md` (the feed budget / contradiction floor G4 modifies).
- `docs/projects/emotional_register.md` (sibling — the felt/tone half of register; G3's human side).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4** | **G1** kind/severity-aware dismissal suppression (flattery guard) and **G2** explicit anti-taxonomy negative list + ratchet fixture. Both directly serve the Phase 4 exit criterion that the feed is calm _and trustworthy_. |
| **6** | **G3** no-disguised-fix register rule hardened with a message lint/fixture; **G4** discomfort-budget ceiling on the contradiction floor. Land once the core loop is worth living in.                                         |

## Todo

### Phase 4

- [x] **G1 — Flattery-resistant dismissal (R5.4).**
  - [x] Make `DismissalSuppression` (`src/store/db.ts`) carry the observation `kind`/`severity` of the dismissed item.
  - [x] Update `isSpanSuppressed` (`src/services/evaluator.ts:111`) so a high-severity defect/`contradiction` dismissal suppresses only _that span_, never the category on other spans. Low-severity nit dismissals keep the existing category/term-wide suppression.
  - [x] Decide the gesture: either high-severity dismissal is inherently span-scoped, or it requires a distinct "not a real issue" affordance that doesn't train silence (UI decision — keep it one click).
  - [x] IndexedDB migration for the new suppression fields (follow the existing migration pattern in `src/store/db.ts`).
  - [x] Fixture/test: seed two contradictions on different spans, dismiss one, assert the other still fires (the R5.4 gate in `fidelity-criteria.md`).
- [x] **G2 — Anti-taxonomy (R4.3).**
  - [x] Add an explicit negative-list instruction to the span-check prompt (`src/services/evaluator.ts` ~L277–291): never flag grammar, spelling, punctuation, passive voice, sentence length, word choice, readability, "consider rephrasing."
  - [x] Add a ratchet fixture (`src/services/eval-fixtures/`) whose labeled expectation asserts none of these categories appear on a deliberately surface-flawed-but-substantively-clean doc.
  - [x] Wire the assertion into the Tier-1 deterministic scorer so a prompt regression fails CI.
  - [x] **`clarity` discrimination fixtures** (2026-06-10 due-diligence audit #8). Shipped 2026-06-19: `clarity-wordy-specified.ts` (extreme prose density + full specificity vs. clean-but-vague) and `clarity-conditional-specified.ts` (specified conditional hedging vs. unspecified hedging) added to the Tier-1 corpus. Both strip false-positive sec1 clarity hits from frozen recordings and document them in `knownGaps` for Tier-2 / live tracking. The fixtures guard the G2 boundary at two distinct failure modes; Tier-1 asserts precision=1 && recall=1 at every CI run.

### Phase 6

- [x] **G3 — No-disguised-fix register rule (R2.2–R2.4).**
  - [x] Prompt rule across all observation prompts: messages locate, never prescribe; no leading/Socratic questions; no replacement text. (Partly present — make it explicit and uniform.)
  - [x] Message lint / fixture: assert no generated message contains an imperative-prescription pattern ("you need…", "add…", "change…") or a `?`-terminated leading clause.
  - [x] Hand the felt-tone half to `emotional_register.md`.
- [x] **G4 — Discomfort-budget ceiling (R6.3).** _Decision settled 2026-06-17: **floor + ceiling hybrid** (§ G4). Shipped 2026-06-19: `CONTRADICTION_CEILING=3` in `feedBudget.ts`, floor+ceiling partition logic, "N more contradictions" signpost in `SidecarFeed.tsx`, 3 new unit tests (a/b/c per spec)._

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

**The problem (R6.3).** Too much true-but-hard critique at once is demoralizing _regardless of accuracy_. Contradictions are the highest-weight item, so a document with many real contradictions is exactly the case the requirements doc warns against.

**Drift found 2026-06-17.** The feature docs (`features.md`, and the prior version of this section) describe a `contradiction` _floor_ that **exempts** contradictions from the budget — guaranteeing they always show. But the code diverged: commit `b7b3780` ("implement discomfort-budget ceiling") made `partitionFeed` a **uniform top-N cap** with no contradiction floor _or_ ceiling — every group, contradictions included, competes for the same `DEFAULT_FEED_BUDGET` (7) slots by priority. The `feedBudget.ts` comments still claim a "discomfort-budget ceiling," which is misleading. So neither the floor (guaranteed visibility) nor an explicit ceiling (capped count) actually exists today.

**The tension this exposes.** A pure floor (always show all contradictions) protects the hero capability but reintroduces the wall-of-red R6.3 warns against. A pure cap (current code) avoids the wall but can bury a real contradiction below the budget in the generic "also noticed" — corrosive for a product whose whole pitch is contradiction-at-distance.

**Decision (2026-06-17): floor + ceiling hybrid.** Reconcile both, parameterised by a single constant `CONTRADICTION_CEILING` (default **3**):

- **Floor (hero protection):** the top-priority `contradiction` groups are guaranteed visible up to the ceiling — a lower-priority nit can never displace a contradiction from the visible set.
- **Ceiling (overwhelm protection):** at most `CONTRADICTION_CEILING` contradictions are visible at once. If a document has more, the extras overflow into "also noticed" — _even if_ their priority would otherwise seat them in the budget.
- **Overflow signpost:** overflowing contradictions appear in "also noticed" under an explicit **"N more contradictions"** label, so the user knows hard items await without being hit by all of them at once (this is the R6.3 "rhythm" — surfacing hard truths in waves, not a dump).
- **Remaining budget:** filled by the top non-contradiction groups by priority (unchanged behaviour).
- **Scope:** the floor/ceiling applies only to `type === "contradiction"` (use the existing `hasContradiction` flag). `strategic_tension` is deliberately excluded — it's an `opportunity`, softer register, "never cried wolf" (features.md), so it neither needs the floor nor counts against the ceiling.

This is a small, well-bounded change to the pure `partitionFeed` function plus one labelled drawer section — "High-decision / Low-build," now decided. It interacts with `emotional_register.md` (the _phrasing_ of each contradiction) only at the level of total emotional load: G4 governs _how many_ surface at once; emotional*register governs \_how each reads*.
