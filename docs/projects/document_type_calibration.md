---
status: idea
kind: quality
phases: [6, 7]
summary: Make the Document Context / Stage field a first-class calibrator of evaluation — recalibrate strictness and which checks apply by document type — so PRD-grade citation/structure expectations don't fire on essays, blog posts, or memos. The mechanism that lets the product's scope widen from "PRDs" to "documents people write for work" without a taxonomy explosion.
---

# Document-type calibration

> Written 2026-07-02 from a live essay-writing session (see `docs/logs/prompt_quality_observations.md` OBS-028 and the pre-existing OBS-023). The product's stated scope broadened the same day from "PRDs" to **documents people write for work, PRD-primary** (`docs/concept.md` § First persona and use case). This doc is the mechanism that makes that breadth safe: it keeps the fixed taxonomy and the lean posture while letting the eval's _strictness_ track the genre.

## Status

**Idea — Phase 6 (calibration floor) / Phase 7 (richer type inference & presets).** The scope decision is made; the design here is the buildable mechanism. Not yet started.

The trigger: the eval applies PRD-grade citation strictness regardless of what the document is. A first-person apprehension in an essay ("I fear my writing skill will atrophy") was flagged as an unsupported factual claim (OBS-028); a public-communication narrative device was flagged the same way despite `Document context: a public communication about a product` being in the prompt (OBS-023). The `Document Context / Stage` field already exists and is already passed to the model — but it is treated as flavour text, not as a calibration input. This doc makes it load-bearing.

Read alongside:

- `docs/concept.md` (§ First persona and use case) — the scope-breadth decision this enables.
- `docs/projects/onboarding_first_run.md` (§ The context chip) — the UI surface for the stage/type field; calibration piggybacks on the same value, so no new control.
- `docs/projects/emotional_register.md` — register/voice is genre-adjacent; type calibrates _what to flag_, register calibrates _how it reads_. Keep them separate levers that compose.
- `docs/projects/section_eval_precision.md` — the section-eval prompt is where the fast-tier carve-outs land; the established-context injection (OBS-027) rides the same prompt.
- `docs/projects/observation_taxonomy_and_priority.md` — the fixed taxonomy this must **not** expand; calibration modulates strictness and applicability, not the type list.
- `docs/logs/prompt_quality_observations.md` — OBS-028, OBS-023 (the motivating false positives), OBS-006 (premature strictness).
- `CLAUDE.md` — invariant #2 (fixed taxonomy) and the lean-scope discipline.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | **Calibration floor.** (a) A tactical carve-out in the fast-tier `unsupported_claim` instructions for first-person hedged opinions/apprehensions (OBS-028 stopgap). (b) Turn the existing `Document Context / Stage` value into an explicit **strictness input** the per-type prompts read: a small set of coarse document classes (see § Document classes) that dial `unsupported_claim` / `missing_topic` / structural expectations up or down. (c) The field is inferred already; ensure the inference emits a class, not just a free-text label. |
| **7** | **Richer inference & presets.** Per-class check-applicability matrices (e.g. `missing_topic`'s expected-section set differs for a PRD vs a blog post vs a memo), per-class jargon/allow-list presets layered on the general PM preset, and corpus-validated strictness floors per class (gated on `field_validation.md` evidence). Don't pre-build; Phase 6 proves the lever works first.                                                                                                                                                            |

## Todo

### Phase 6 — calibration floor

- [ ] **Opinion/apprehension carve-out (OBS-028 stopgap)** — add to the fast-tier `unsupported_claim` instructions: first-person hedged opinions and apprehensions ("I fear…", "I'm concerned that…", "I worry…", "I think…") are not unsupported factual claims. Add a discrimination fixture (essay opinion must NOT flag; unattributed world-fact still must). This is independently shippable ahead of the class mechanism.
- [ ] **Define document classes** (§ Document classes) — a coarse enum the stage/type value maps to. Keep it small (≤ ~5). Store on the document alongside the existing stage text (no schema churn beyond one field).
- [ ] **Thread the class into `EvalContext`** and into the per-type prompts as an explicit "calibration" block — not buried in free-text `Document context`. The section-eval and doc-level prompts read it and adjust strictness (see § What each class dials).
- [ ] **Class-aware strictness for `unsupported_claim` and `missing_topic`** — the two checks that misfire hardest off-genre. On low-formality classes (essay/blog/comms), `unsupported_claim` demands evidence only for hard external-fact assertions; `missing_topic`'s structural expectations (timeline, scope, metrics) are suppressed or softened.
- [ ] **Inference emits a class** — the existing stage-inference step returns one of the classes (plus its free-text label), so calibration works with zero user setup, holding the quiet/no-setup posture.
- [ ] **Fixtures / ratchet** — add off-genre docs to `src/services/eval-fixtures/` so a regression that re-tightens strictness on essays/blogs fails CI. Ties into `evaluator_quality_ratchet.md`.

### Phase 7 (not in this scope)

- [ ] Per-class check-applicability matrix (which observation types even run per class).
- [ ] Per-class jargon/allow-list presets (layered on the general PM preset).
- [ ] Corpus-validated per-class strictness floors (gated on `field_validation.md`).

## Design

### Why calibration, not new types

Broadening from PRDs to "documents people write for work" tempts a genre-specific taxonomy (blog checks, memo checks). That breaks invariant #2 and explodes the surface. The observed failures aren't missing types — the core checks (contradiction, clarity, unsupported claim, missing/underexposed topic) generalise fine. The failures are **strictness applied uniformly**: a citation bar and a section-completeness bar tuned for PRDs, fired on an essay. So the lever is a **calibration input**, not new observation types. The taxonomy stays fixed; each check reads the document class and adjusts how hard it presses.

### Document classes (draft — settle during build)

A small, coarse enum — resist granularity. A working starting set:

- **`prd_spec`** — PRDs, specs, decision docs. The anchor case; full strictness (citation, structure, metrics, scope).
- **`comms_announcement`** — stakeholder comms, announcements, product/feature blog posts, external narrative. Narrative devices and rhetorical framing are expected; `unsupported_claim` only bites hard external-fact assertions; `missing_topic` structural expectations largely off.
- **`memo_email`** — substantial work emails / memos to colleagues. Expect an ask/decision and its rationale; lighter structural expectations than a PRD, heavier than a blog.
- **`essay_personal`** — first-person reflective/opinion writing. Opinions and apprehensions are the content, not claims to cite; contradiction and clarity still apply, `unsupported_claim`/`missing_topic` heavily relaxed.
- **`unknown`** — the conservative default before inference/selection: behave close to today (PRD-ish) but with the OBS-028 opinion carve-out always on.

### What each class dials

Calibration modulates three knobs, not the type list:

1. **`unsupported_claim` strictness** — from "cite any world-fact assertion" (`prd_spec`) to "only hard external-fact assertions, never first-person opinion/narrative" (`essay_personal`).
2. **`missing_topic` / structural expectations** — the expected-section notion (objective, scope, metrics, timeline, risks) is a PRD construct; suppressed or reframed for other classes.
3. **Baseline hedging/register** — off-genre, structural gaps skew further toward soft "opportunities" (composes with `maturity_aware_severity` R2 and `emotional_register`).

Checks that generalise unchanged — **contradiction** (the hero), **clarity**, **undefined_jargon** — stay on across all classes (jargon presets aside).

### Relationship to the stage/context chip

No new control surface. The `Document Context / Stage` value the context chip already exposes (`onboarding_first_run.md` § The context chip) carries the class. Inference sets it; the user can correct it inline. Calibration is a pure consumer of that value — which is exactly why OBS-023 is damning: the value was present and ignored. This doc closes that gap.

### Out of scope

- New observation types (invariant #2). Genre needs are met by calibrating existing checks.
- Per-class UI beyond the existing context chip.
- Binary-format import / rich content types (`canvas_content_types.md`) — orthogonal.
