# Fidelity Criteria — Acceptance Gates for the Product Requirements

> **Why this file exists.** `docs/product-requirements.md` defines the fidelity bar (six axes × Minimum/Good-enough/Superb) and decomposes it into atomic requirements R1.1–R6.4. That doc is timeless prose; it can't fail CI. This file is the **derived, gate-shaped** companion: each requirement becomes a concrete pass/fail check, tagged `[automated]` (a test or harness assertion can decide it) or `[human]` (a person must judge the felt experience), with a live **status** column (✅ met · 🟡 partial · ❌ gap) reflecting the 2026-06-04 assessment.
>
> **How to use.** When a guardrail ships (see `docs/projects/philosophy_guardrails.md`, `docs/projects/emotional_register.md`), flip its status and wire the `[automated]` gates into the eval ratchet or a doc test. The Superb-tier rows (R1.4, R3.6, R5.5, R6.4) are aspirational north stars — tracked, not gated.
>
> **Tooling.** Same harness as the phase files (`window.__sidecar__`, dev-only) — see `CLAUDE.md` § Browser testing.

---

## 1 — The Inversion (R1)

| R-ID | Gate | Kind | Status |
| --- | --- | --- | --- |
| R1.1 | No apply / autocomplete / ghost-text / rewrite control renders anywhere in the editor or feed. Grep the component tree; snapshot the feed card — no action button mutates the document. | [automated] | ✅ |
| R1.2 | No code path writes LLM output into the ProseMirror doc. The evaluator's output type cannot reach `editor.commands`; assert by type + a test that observations never produce a transaction. | [automated] | ✅ |
| R1.3 | First-run / empty state communicates deliberate quiet, not a missing feature. | [human] | 🟡 (empty-state polish → Phase 5) |
| R1.4 | _Superb:_ users describe the constraint as the source of value. | [human] | — (north star) |

## 2 — The Withheld Fix / Register (R2)

| R-ID | Gate | Kind | Status |
| --- | --- | --- | --- |
| R2.1 | No observation message contains replacement text or "you could say / change this to." Ratchet fixture asserts forbidden phrasings never appear in generated messages. | [automated] | 🟡 (prompts comply; no fixture guards it → `philosophy_guardrails` G3) |
| R2.2 | No observation _prescribes the move_ ("you need a data point", "add X"). Lint generated messages against an imperative-prescription pattern. | [automated] | ❌ (unguarded → G3) |
| R2.3 | No observation message is a leading/Socratic question (no message whose primary clause is a `?`-terminated rhetorical prompt). | [automated] | ❌ (unguarded → G3) |
| R2.4 | Tone reads as "withholding to respect you," not cold or difficult. | [human] | 🟡 (→ `emotional_register`) |
| R2.5 | Each message carries enough context to understand _why_ it's a problem (names the conflicting span/claim/stage). | [human] | ✅ |

## 3 — Temporal Rhythm (R3)

| R-ID | Gate | Kind | Status |
| --- | --- | --- | --- |
| R3.1 | No evaluation fires on an unsettled block. Harness event stream shows no `request` without a preceding `settle` (terminal punctuation + min length). | [automated] | ✅ |
| R3.2 | Doc-level checks do not fire below the content threshold (150 words). | [automated] | ✅ |
| R3.3 | Timing reacts to real signals (pause, blur, paragraph completion). Return-to-passage and explicit "done with section" remain unimplemented. | [automated] | 🟡 |
| R3.4 | Under uncertainty / budget pressure the system defers rather than fires (doc-idle deferral observed in event stream). | [automated] | ✅ |
| R3.5 | The quiet/drafting state _feels_ intentional, not broken. | [human] | 🟡 (→ Phase 5 empty states) |
| R3.6 | _Superb:_ per-user / per-phase rhythm modeling. | [human] | — (north star) |

## 4 — Typed Taxonomy (R4)

| R-ID | Gate | Kind | Status |
| --- | --- | --- | --- |
| R4.1 | Every observation has a type ∈ the fixed 9-type list; no free-form output reaches the feed. | [automated] | ✅ |
| R4.2 | Classification is honest — `strategic_tension` vs `contradiction` routing keeps tradeoffs out of the defect bucket. | [automated] | ✅ |
| R4.3 | **No observation belongs to the anti-taxonomy** (grammar, spelling, passive voice, sentence length, word choice, "consider rephrasing"). Ratchet fixture asserts these categories never appear. | [automated] | ❌ (no negative-list fixture → G2) |
| R4.4 | Precision ≥ floor on the labeled corpus (Tier-1 replay = 1.0; Tier-2 live floor). | [automated] | ✅ |
| R4.5 | Opportunity-nature types carry visibly tighter criteria than defect types. | [human] | 🟡 |
| R4.6 | A planted contradiction-at-distance is caught referencing both spans. | [automated] | ✅ |

## 5 — Lifecycle (R5)

| R-ID | Gate | Kind | Status |
| --- | --- | --- | --- |
| R5.1 | Observations auto-close on resolving edit, dismiss on demand, and appear in the archive with the right status. | [automated] | ✅ |
| R5.2 | Resolution reflects the _problem_ being gone: re-evaluation, not a cosmetic edit, closes the card. | [automated] | 🟡 (re-evaluates; cosmetic span-drop can still close) |
| R5.3 | A dismissed span/type is not re-surfaced for the rest of the doc. | [automated] | ✅ |
| R5.4 | **Dismissing a high-severity defect/contradiction does not suppress that category on _other_ spans** — flattery guard. Seed two contradictions, dismiss one, assert the other still fires. | [automated] | ❌ (suppression not kind/severity-aware → G1) |
| R5.5 | _Superb:_ archive reads as a record of intellectual evolution. | [human] | — (north star) |

## 6 — Emotional Register (R6)

| R-ID | Gate | Kind | Status |
| --- | --- | --- | --- |
| R6.1 | No message is insulting / anxiety-generating / condescending. | [human] | 🟡 (→ `emotional_register`) |
| R6.2 | Messages embody the trusted-colleague persona; none read as linter/boss/pedant/therapist/smartass. Human-labeled tone pass over a sample. | [human] | ❌ (no persona spec drives prompts → `emotional_register`) |
| R6.3 | The feed respects a discomfort budget — a doc with many hard critiques doesn't surface them all at once via the contradiction floor. | [automated] | ❌ (floor has no ceiling → G4) |
| R6.4 | _Superb:_ using it makes the user feel sharper. | [human] | — (north star) |

---

## Coverage note

Every R-ID in `docs/product-requirements.md` appears above. Gaps (❌) and partials (🟡) that are scheduled work map to milestones G1–G4 in `docs/projects/philosophy_guardrails.md` and the persona/tone work in `docs/projects/emotional_register.md`. Superb-tier rows are intentionally ungated north stars.
