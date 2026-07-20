---
status: done
kind: quality
phases: [6]
summary: Make observation severity a function of document maturity (the R2 principle, graduated from quality_remediation_synthesis into its own tracked milestone). Structural gap-types surface as soft, soft-voiced "opportunities" on an early draft and promote to firmer "warnings" — a change in kind, severity, AND message voice — as the document matures, measured by a deterministic structural proxy. Defects (contradiction, unsupported_claim) always surface. Composes with the noisiness budget, the discomfort-budget ceiling, and the reconciler (in-place promotion, no churn).
---

# Maturity-aware severity (R2)

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Done — Phase 6 (shipped 2026-07-06).** Graduated from root cause **R2** in `docs/projects/quality_remediation_synthesis.md` into its own milestone — the same move R3b → `archive_trust.md`, R3 → `doc_scope_reconciliation.md`, and R4 → `doc_level_anchoring.md` made. R2 was described in the synthesis as "the principle threaded through 1–7, not a discrete step," but `smart_feed_curation.md` (R2c) leans on it as load-bearing ("maturity-aware curation does most of the work"), so the principle needs a real, tracked, buildable mechanism rather than an ambient intention.

**The insight (from OBS-010):** _"provoke, don't prescribe" feels abrasive primarily because of **when** it fires, not **what** it says._ Blunt structural feedback is fine on a finished draft and hostile on a first paragraph. Timing (Invariant #4) is the pressure valve that lets us hold the register line without users defecting to Grammarly-style hand-holding. R2 operationalises that: make severity — and voice — a function of document maturity.

Read alongside:

- `docs/projects/quality_remediation_synthesis.md` (R2) — the root-cause framing this executes.
- `docs/projects/smart_feed_curation.md` (R2c) — the consumer; R2 is its load-bearing dependency. R2c's single conceded control (the noisiness switch) is **held until R2 ships + V2** validates the premise.
- `docs/projects/observation_taxonomy_and_priority.md` (Milestone E `NOISINESS`; § Priority function) — the kind/severity/budget machinery R2 modulates.
- `docs/projects/emotional_register.md` — owns the opportunity-vs-warning **voice** copy; R2 owns the maturity switch that selects it.
- `docs/projects/philosophy_guardrails.md` (G4) — the discomfort-budget ceiling; a distinct lever that must compose.
- `docs/projects/doc_scope_reconciliation.md` (UX-012) — promotion must update **in place** (keep-by-id), never blanket-supersede (the UX-012 anti-pattern).
- `docs/projects/field_validation.md` (V1·V2) — calibrate the maturity thresholds; V2 tests whether maturity-promotion actually dissolves the OBS-010 abrasiveness.
- `src/services/documentMaturity.ts` (the proxy, as-built), `src/services/priority.ts` (`computePriority`, `docGapKind`, `TYPE_PRIOR`), the doc-level observation construction + maturity-voice injection in `src/services/evaluator.ts` (`evaluateDocument`), and `src/services/evaluatorReconcile.ts` (`reconcileDocumentObservations` in-place restamp).

> **Two spec drifts corrected during build (2026-07-06):**
>
> 1. The **150-word `doc-idle` gate lives in `src/editor/Editor.tsx`** (`CONTENT_THRESHOLD_WORDS` + `getWordCount`), _not_ inside the evaluator (whose only gate is `meaningful.length ≥ 2` block summaries). So UX-013 replaced the arm gate in `Editor.tsx`, and the maturity proxy is fed word + block counts from the live editor there — not derived from block summaries inside `evaluateDocument`.
> 2. Only **`missing_topic` + `underexposed_topic` are `opportunity`-kind today**; `audience_mismatch` + `structure_flow` are already `problem`. So the `opportunity`→`problem` kind-promotion applies to the two topic gaps; all four escalate **severity** when mature.
> 3. The **voice switch is injected into the doc-level _user content_** (`parts` in `evaluateDocument`, gated on `maturity !== undefined`), not into the static `DOC_LEVEL_SYSTEM_PROMPT` — this keeps the legacy path hash-stable and mirrors how `docCalibrationBlock` is injected.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | A pure `documentMaturity` proxy; a `maturity` input to `computePriority` that escalates gap-type severity and selects kind (`opportunity`→`problem`) when mature; a maturity-aware voice switch in the doc-level prompt; in-place (no-churn) promotion through the reconciler; composition tests against the noisiness budget and the G4 ceiling; ratchet fixtures for the forming-vs-mature behaviour. Thresholds + voice ship provisional, calibrated by V1/V2. **Unblocks R2c.** |

## Todo

Anchor files: `src/services/priority.ts`, `src/services/evaluator.ts` (doc-level observation construction), `src/services/evaluatorPrompts.ts` (`DOC_LEVEL_SYSTEM_PROMPT`), `src/services/evaluatorReconcile.ts` / `docReconcile.ts` (keep-by-id), `src/services/feedBudget.test.ts`, `src/services/eval-fixtures/`.

- [x] **`documentMaturity(signals)` — pure, synchronous proxy.** Shipped as `src/services/documentMaturity.ts`: a **three-band** `unformed | forming | mature` split over `{ wordCount, blockCount }` (the two cheap signals the live editor exposes). Provisional named-constant thresholds — `mature` = `wordCount ≥ 400 && blockCount ≥ 6`; `forming` = `wordCount ≥ 150 || (blockCount ≥ 4 && wordCount ≥ 80)`; else `unformed`. Pure, no LLM. (The third `unformed` band is what UX-013 needed — it's the "not armed yet" state below `forming`.) `documentMaturity.test.ts` covers the band boundaries.
- [x] **Maturity gates doc-level readiness, not a raw word count (UX-013).** `Editor.tsx` now arms `doc-idle` when `getMaturity(editor) !== "unformed"` (both the `onUpdate` and the seed/`loadDoc` paths), replacing `wordCount ≥ CONTENT_THRESHOLD_WORDS`. A structurally-complete short draft (≥ 4 blocks, ≥ 80 words) arms; a half-formed one stays `unformed`/quiet. `CONTENT_THRESHOLD_WORDS` (150) now gates only the bulk-paste contradiction sweep (left as-is — contradiction economics, out of R2 scope). → `docs/logs/ux_quality_observations.md` (UX-013).
- [x] **`computePriority` gains a `maturity` input.** For the four gap types only, `mature` → `escalateSeverity` one step. Kind selection moved to a sibling pure helper `docGapKind(type, maturity)` (topic gaps `opportunity`→`problem` when mature; audience/structure stay `problem`). Defect and span types ignore `maturity`. Both stay pure; `priority.test.ts` extended.
- [x] **Stamp at doc-level construction.** `maturity` is computed once in `Editor.tsx`, threaded via `EvalContext.maturity` → `evaluateDocument` → `addDocObs`, which now derives `kind` from `docGapKind` and `severity/priority` from `computePriority({ type, maturity })`. No maturity marker stored on the observation (no DB migration; the changed-signal rides the existing in-place field diff).
- [x] **Voice switch in the doc-level prompt.** Implemented as a maturity-conditioned line pushed into the **doc-level user content** (`parts` in `evaluateDocument`), gated on `maturity !== undefined` so the legacy path stays hash-stable. `forming` → gentle-opportunity phrasing; `mature` → firm located-warning. Register discipline still binds both; exact copy is provisional (owned by `emotional_register.md`).
- [x] **In-place promotion — no churn.** `reconcileDocumentObservations` accepts `maturity` in `opts` and, on **both** keep paths (paid `persistIds` + free lexical `dedupes`), restamps the kept observation's `kind/severity/priority` by id — wording + anchor frozen (D5), never supersede. Undefined maturity = legacy freeze. Tested: a persisting gap promotes in place (same id, no `superseded`) on both tiers; legacy path unchanged.
- [x] **Compose with the priority band (today's feed).** `partitionFeed` has **no kind-keyed `NOISINESS` filter yet** (that ships with R2c) — so R2 composes via the existing **priority band**: a matured gap's escalated priority clears `KEY_BAND_MIN_PRIORITY` (1.0) and rises into "Key issues" (e.g. `structure_flow` 0.75 → 1.5). `priority.test.ts` asserts the crossing. The kind-keyed `feedBudget.test.ts` composition cases are deferred to the R2c noisiness-switch build (post R2 + V2), as planned.
- [x] **Compose with G4.** The discomfort-budget ceiling caps _contradictions_; R2 only touches _gap_ kinds/severities — distinct levers, no crossing. Full suite green confirms no regression.
- [x] **Compose with R3c.** A promotion updates an existing card's fields by id (frozen text) — the feed's R3c "New/changed" marker keys off that change. Reused, not suppressed. (No feed-code change; verify in the live check.)
- [~] **Ratchet / fixtures — deferred.** The deterministic axes (kind/severity/priority per forming/mature) are covered by `priority.test.ts` + the reconcile in-place tests. A **doc-level** ratchet fixture is deferred: the Tier-1 runner (`eval-fixtures/runFixture.ts`) drives only `evaluateSection`, not `evaluateDocument`, so exercising the maturity path needs runner support **and** a live recording of the doc-level strong call (quota) — same deferral shape as OBS-027's behavioural fixtures. The voice assertion remains a Tier-2/register check.
- [ ] **Calibrate + validate (open — V1/V2).** Thresholds and voice ship **provisional**; V1 calibrates the cut-offs against real PRDs, V2 tests the OBS-010 hypothesis. Update the open question in `docs/plan.md` → Strategic open questions when V2 answers it. (Left open — it's the validation follow-up, not part of the build.)

## Design

### Why this is its own milestone, not an ambient principle

R2c concedes exactly one manual control (the noisiness switch) on the explicit argument that **maturity-aware curation does most of the work** — users get the warnings-vs-suggestions split they asked for _as a function of where the document is_, without a toggle. If R2 is only "a principle threaded through other steps," that argument rests on a mechanism nobody is building. Promoting R2 to a tracked milestone with a concrete mechanism makes R2c's concession honest: there is a real lever doing the curation, R2c just declines to add ten more.

### The maturity signal — deterministic structural proxy

Maturity is computed by a **pure, synchronous** function over the document's blocks — no LLM call, consistent with `computePriority`'s contract and with Invariant 3 (no per-keystroke scans; this runs at doc-idle). v1 inputs: **block count, section/heading count, word count.**

The proxy is deliberately crude (a long, bad draft can score "mature") because the cost of being wrong is small and graded by everything else: a mis-scored gap is still precision-gated, still subject to the noisiness budget, and still located-not-prescribed. v1 ships a **binary** `forming | mature` split above the existing doc-level content gate; a continuous 0–1 score and a revision-activity signal (returning to earlier passages, edit density — the fidelity bar's "real cognitive signals") are the natural **deferred** refinement once V2 shows whether the binary split is too coarse. Thresholds are provisional and calibrated by V1.

### The promotion mechanic — kind + severity + voice

A structural gap is the _same finding_ whether the doc is forming or mature; what changes is how seriously and how firmly we surface it. Promotion therefore moves **three** things together:

1. **Kind** — `forming` → `opportunity`; `mature` → `problem` (the "warning"). This is the lever the noisiness budget reads: `NOISINESS["key"]` is problem-kind only, so a matured warning reaches "Key issues" while a forming opportunity does not.
2. **Severity** — `mature` escalates the gap-type's base severity one step (via `computePriority`), raising its `priority` so it ranks above forming-stage soft suggestions.
3. **Voice** — the generated message text shifts from gentle-opportunity phrasing to located-warning phrasing. This is the user's explicit requirement: the difference is _not only_ the label, it's the language. The doc-level prompt receives the maturity flag and phrases accordingly; `emotional_register.md` owns the copy guide.

This is option-2 ("change type/label") extended with the voice and severity dimensions, rather than the pure severity-modulation of option-1 — because a relabel without a voice change would read as cosmetic, and a severity change without a kind change wouldn't compose with the kind-keyed noisiness budget.

### Scope — gaps only; defects always surface

Maturity modulates the **structural gap types only**: `missing_topic`, `underexposed_topic`, `structure_flow`, `audience_mismatch` (all doc-level, opportunity-kind today). **Defects always surface, precision-gated, regardless of maturity:**

- **`contradiction`** is the hero capability — suppressing it on an early draft risks killing the wow at the exact moment it would land. It always surfaces.
- **`unsupported_claim`** also always surfaces. (This was a live fork — one could argue "unsupported" is premature mid-draft since the evidence is still coming — but it was decided to keep defects uniformly always-on; revisit if V2 shows early unsupported-claim flags read as abrasive.)

Span nits (`clarity`, `undefined_jargon`) are out of scope — they're local correctness, not maturity-sensitive structure.

### Composition (the load-bearing interactions)

- **Noisiness budget (R2c / Milestone E):** the maturity-stamped `kind` _is_ what the `NOISINESS` filter keys on, so R2 and the noisiness switch compose by construction. The requirement is that `partitionFeed` reads the maturity-derived kind (not a static type→kind map) and that `feedBudget.test.ts` proves a forming opportunity hides at "Key issues" while its matured warning shows. The switch itself ships **after** R2 + V2.
- **Discomfort-budget ceiling (G4):** independent lever (G4 caps _contradictions_ by emotional load; R2 modulates _gaps_ by maturity). They don't collide; assert no regression.
- **Feed choreography (R3c, done):** a promotion is a content/kind change on an existing card → it naturally trips the "New/changed" marker, which is the _desired_ read ("your doc matured, this got more serious"). Reuse it.
- **Reconciliation (UX-012 / doc_scope_reconciliation):** promotion is an **in-place, keep-by-id update**, never supersede+regenerate. Routing it through blanket-supersede would reproduce exactly the churn UX-012 is fixing.

### Scope boundaries

- Touches only the **doc-level gap-type** path: the maturity proxy, `computePriority`'s gap-type branch, the doc-level observation constructor, the doc-level prompt's voice switch, and the reconciler's keep-by-id for promotions.
- **No DB migration** beyond Milestone A's existing `kind`/`severity`/`confidence`/`priority` fields; the maturity level is computed per-eval (optionally stored for the changed-signal, additive if so).
- **Voice copy** is owned by `emotional_register.md`; R2 provides the maturity flag and the prompt switch, not the wording.
- Free tier: the proxy is model-independent; the doc-level call is weaker on free tier (lower phrasing quality) but the mechanic applies on both tiers.

### Deferred (not the v1 floor)

- A **continuous** maturity score and a **revision-activity** signal (return-to-passage, edit density, time-in-doc) layered onto the structural proxy.
- Per-type maturity curves (different gap types maturing at different thresholds).
- Reconsidering `unsupported_claim` as maturity-modulated, pending V2 evidence.
