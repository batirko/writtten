---
status: in-progress
kind: quality
phases: [6, 7]
summary: Make the Document Context / Stage field a first-class calibrator of evaluation — recalibrate strictness and which checks apply by document type — so PRD-grade citation/structure expectations don't fire on essays, blog posts, or memos. The mechanism that lets the product's scope widen from "PRDs" to "documents people write for work" without a taxonomy explosion.
---

# Document-type calibration

> Written 2026-07-02 from a live essay-writing session (see `docs/logs/prompt_quality_observations.md` OBS-028 and the pre-existing OBS-023). The product's stated scope broadened the same day from "PRDs" to **documents people write for work, PRD-primary** (`docs/concept.md` § First persona and use case). This doc is the mechanism that makes that breadth safe: it keeps the fixed taxonomy and the lean posture while letting the eval's _strictness_ track the genre.

## Status

**In-progress — Phase 6 calibration floor shipped 2026-07-05; Phase 7 (richer type inference & presets) remains.** The Phase-6 floor is complete: the 5-class enum + deterministic classifier, class-gated calibration blocks threaded into the section- and doc-tier prompts, the conservative strictness dial, and off-genre ratchet fixtures — resolving OBS-028 and OBS-023.

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

- [x] **Opinion/apprehension carve-out (OBS-028 stopgap)** — shipped 2026-07-05. Added a bullet to the fast-tier `unsupported_claim` instructions in `MERGED_SYSTEM_PROMPT` (`evaluatorPrompts.ts`): first-person opinions/feelings/apprehensions/preferences ("I fear…", "I'm concerned…", "I worry…", "I think…", "we believe…") are the author's stance, not factual assertions needing citation; rhetorical/narrative framing in a non-PRD document likewise. Discrimination fixture `opinion-apprehension.ts` added to the ratchet corpus — first-person apprehension is **not** flagged, an unattributed present-tense world-fact ("handwriting improves memory retention by 40%") **is**. Verified live: recorded against the real model with the carve-out in place, the apprehension produced zero `unsupported_claim`. (Re-keyed the 14 existing corpus fixtures — responses unchanged, only the section-eval prompt hash shifted; also fixed the OBS-027 `loadBlockSummariesForDocument` mock gap in `record.test.ts`.) Independently shipped ahead of the class mechanism.
- [x] **Define document classes** — shipped 2026-07-05 in `src/services/documentClass.ts` (pure module): the 5-class enum `prd_spec` / `comms_announcement` / `memo_email` / `essay_personal` / `unknown` + a deterministic keyword `classifyDocumentClass(stage)` (prd_spec keywords win first — a "PRD for the launch blog" stays a PRD; unmatched → `unknown`). **No schema/storage change** — the class is derived synchronously from the existing free-text stage value at eval time, so it's a pure consumer (which is exactly why OBS-023 was damning: the value was present and ignored).
- [x] **Thread the class into the per-type prompts as an explicit "calibration" block** — shipped 2026-07-05. `evaluator.ts` derives the class from `stage` and injects `sectionCalibrationBlock(class)` into the section-eval user content and `docCalibrationBlock(class)` into the doc-level user content. **Gated on relaxed classes** (empty string for `prd_spec`/`unknown`) so PRD/unknown request hashes stay stable — only relaxed-genre sections change their hash. (Derived-at-eval rather than threaded through `EvalContext`/`orchestrator.ts` to stay inside the Prompt/signal lane; functionally the explicit labeled block the spec asks for, not free-text.)
- [x] **Class-aware strictness for `unsupported_claim` and `missing_topic`** — shipped 2026-07-05 (conservative dial, per owner decision 2026-07-05). On the three relaxed classes: section-tier `unsupported_claim` fires only for hard checkable external-fact assertions (statistics / claims about the world's current state), never opinions/narrative/rhetoric; doc-tier `missing_topic` + `structure_flow` no longer demand PRD sections (objective/scope/metrics/timeline/risks). `contradiction`, `clarity`, `undefined_jargon` stay fully on for **every** class.
- [x] **Inference works with zero setup** — no inference change was needed: the class is derived from the stage text by the same pure classifier, whether the stage is user-set or model-inferred (`suggested_stage`). So calibration holds the quiet/no-setup posture without the inference step emitting a class explicitly.
- [x] **Fixtures / ratchet** — `opinion-apprehension` (essay_personal, re-recorded with the calibration block: apprehension not flagged, hard 40% stat still flagged) and `comms-narrative` (comms_announcement: rhetorical framing not flagged, unattributed 12% stat still flagged — **resolves OBS-023**) added to the corpus. Both verified live. `documentClass.test.ts` gives CI-safe coverage of the classifier + gating (the calibration blocks only run under `EVAL_LIVE`).

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
