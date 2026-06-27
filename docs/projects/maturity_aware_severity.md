---
status: idea
kind: quality
phases: [6]
summary: Make observation severity a function of document maturity (the R2 principle, graduated from quality_remediation_synthesis into its own tracked milestone). Structural gap-types surface as soft, soft-voiced "opportunities" on an early draft and promote to firmer "warnings" — a change in kind, severity, AND message voice — as the document matures, measured by a deterministic structural proxy. Defects (contradiction, unsupported_claim) always surface. Composes with the noisiness budget, the discomfort-budget ceiling, and the reconciler (in-place promotion, no churn).
---

# Maturity-aware severity (R2)

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 6 (design settled 2026-06-27, ready to build).** Graduated from root cause **R2** in `docs/projects/quality_remediation_synthesis.md` into its own milestone — the same move R3b → `archive_trust.md`, R3 → `doc_scope_reconciliation.md`, and R4 → `doc_level_anchoring.md` made. R2 was described in the synthesis as "the principle threaded through 1–7, not a discrete step," but `smart_feed_curation.md` (R2c) leans on it as load-bearing ("maturity-aware curation does most of the work"), so the principle needs a real, tracked, buildable mechanism rather than an ambient intention.

**The insight (from OBS-010):** _"provoke, don't prescribe" feels abrasive primarily because of **when** it fires, not **what** it says._ Blunt structural feedback is fine on a finished draft and hostile on a first paragraph. Timing (Invariant #4) is the pressure valve that lets us hold the register line without users defecting to Grammarly-style hand-holding. R2 operationalises that: make severity — and voice — a function of document maturity.

Read alongside:

- `docs/projects/quality_remediation_synthesis.md` (R2) — the root-cause framing this executes.
- `docs/projects/smart_feed_curation.md` (R2c) — the consumer; R2 is its load-bearing dependency. R2c's single conceded control (the noisiness switch) is **held until R2 ships + V2** validates the premise.
- `docs/projects/observation_taxonomy_and_priority.md` (Milestone E `NOISINESS`; § Priority function) — the kind/severity/budget machinery R2 modulates.
- `docs/projects/emotional_register.md` — owns the opportunity-vs-warning **voice** copy; R2 owns the maturity switch that selects it.
- `docs/projects/philosophy_guardrails.md` (G4) — the discomfort-budget ceiling; a distinct lever that must compose.
- `docs/projects/doc_scope_reconciliation.md` (UX-012) — promotion must update **in place** (keep-by-id), never blanket-supersede (the UX-012 anti-pattern).
- `docs/projects/field_validation.md` (V1·V2) — calibrate the maturity thresholds; V2 tests whether maturity-promotion actually dissolves the OBS-010 abrasiveness.
- `src/services/priority.ts` (`computePriority`, `TYPE_PRIOR`), `src/services/evaluatorPrompts.ts` (`DOC_LEVEL_SYSTEM_PROMPT`), the doc-level observation construction in `src/services/evaluator.ts`.

## Phased Plan

| Phase | Contributes |
| ----- | ----------- |
| **6** | A pure `documentMaturity` proxy; a `maturity` input to `computePriority` that escalates gap-type severity and selects kind (`opportunity`→`problem`) when mature; a maturity-aware voice switch in the doc-level prompt; in-place (no-churn) promotion through the reconciler; composition tests against the noisiness budget and the G4 ceiling; ratchet fixtures for the forming-vs-mature behaviour. Thresholds + voice ship provisional, calibrated by V1/V2. **Unblocks R2c.** |

## Todo

Anchor files: `src/services/priority.ts`, `src/services/evaluator.ts` (doc-level observation construction), `src/services/evaluatorPrompts.ts` (`DOC_LEVEL_SYSTEM_PROMPT`), `src/services/evaluatorReconcile.ts` / `docReconcile.ts` (keep-by-id), `src/services/feedBudget.test.ts`, `src/services/eval-fixtures/`.

- [ ] **`documentMaturity(blocks)` — pure, synchronous proxy.** Returns a level from deterministic structural signals (block count, section/heading count, word count). v1 is a binary `forming | mature` split **above** the existing doc-level content gate (R3.2 already silences doc-level checks below threshold). Provisional thresholds (e.g. `mature` = `sectionCount ≥ 3 && wordCount ≥ ~400`; else `forming`); calibrate via V1/V2. No LLM, no per-keystroke work — computed once per doc-idle eval.
- [ ] **`computePriority` gains a `maturity` input.** For the **gap types only** (see Scope): `mature` → `escalateSeverity` one step and assign kind `problem` (the "warning"); `forming` → base severity + kind `opportunity`. Defect and span types ignore `maturity`. Keep the function pure.
- [ ] **Stamp at doc-level construction.** Compute maturity once per eval; pass it when constructing each doc-level gap observation so `kind`, `severity`, `priority`, and (optionally, for the changed-signal) a stored maturity marker are set consistently.
- [ ] **Voice switch in the doc-level prompt.** Pass maturity into `DOC_LEVEL_SYSTEM_PROMPT`: phrase gaps as **gentle opportunities** when `forming` ("you may later want to examine whether…"), as **located warnings** when `mature` (firm, locate-don't-prescribe). The exact copy guide lives in `emotional_register.md`; R2 supplies the flag and the switch. (Register discipline R2.2/R2.3 still binds both voices — no prescription, no leading questions, in either register.)
- [ ] **In-place promotion — no churn.** When a gap promotes `opportunity`→`warning` across evals, the resolution-aware reconciler must **keep the observation by id** (same anchor) and update kind/severity/text — **never** route it through blanket-supersede (the UX-012 anti-pattern). Test: a persisting gap that matures updates in place; the archive sees no spurious `superseded`.
- [ ] **Compose with the noisiness budget.** `partitionFeed`'s `NOISINESS` filter keys off `kind`, so the maturity-stamped kind is exactly what makes a matured warning visible at "Key issues" while a forming opportunity stays in Balanced+. When the noisiness switch ships (post R2 + V2, per `smart_feed_curation.md`), add `feedBudget.test.ts` cases: a `forming` gap (opportunity) is **hidden** at "Key issues" and shown at "Balanced"; the **same** gap when `mature` (warning) is **shown** at "Key issues."
- [ ] **Compose with G4.** Confirm the discomfort-budget ceiling (contradictions) is untouched by gap-promotion — distinct levers. A crossing test isn't required (different kinds), but assert no regression.
- [ ] **Compose with R3c.** A mid-session promotion is a *changed* observation → it correctly fires the existing R3c "New/changed" marker ("this got more serious as your doc matured"). Reuse; don't suppress.
- [ ] **Ratchet / fixtures.** A `forming`-doc structural gap → `opportunity` kind + soft voice + lower priority; the **same** gap on a `mature` doc → `warning` (problem) kind + escalated severity + firm voice + higher rank. Wire the deterministic parts (kind/severity/priority/maturity-level) into the Tier-1 ratchet; the voice assertion is a Tier-2/register-fixture check.
- [ ] **Calibrate + validate.** Thresholds and voice ship **provisional**; V1 calibrates the maturity cut-offs against real PRDs, V2 tests the OBS-010 hypothesis (does located critique on a *mature* draft land as respect, not coldness — and does softening on an *early* draft remove the abrasiveness). Update the open question in `docs/plan.md` → Strategic open questions when V2 answers it.

## Design

### Why this is its own milestone, not an ambient principle

R2c concedes exactly one manual control (the noisiness switch) on the explicit argument that **maturity-aware curation does most of the work** — users get the warnings-vs-suggestions split they asked for *as a function of where the document is*, without a toggle. If R2 is only "a principle threaded through other steps," that argument rests on a mechanism nobody is building. Promoting R2 to a tracked milestone with a concrete mechanism makes R2c's concession honest: there is a real lever doing the curation, R2c just declines to add ten more.

### The maturity signal — deterministic structural proxy

Maturity is computed by a **pure, synchronous** function over the document's blocks — no LLM call, consistent with `computePriority`'s contract and with Invariant 3 (no per-keystroke scans; this runs at doc-idle). v1 inputs: **block count, section/heading count, word count.**

The proxy is deliberately crude (a long, bad draft can score "mature") because the cost of being wrong is small and graded by everything else: a mis-scored gap is still precision-gated, still subject to the noisiness budget, and still located-not-prescribed. v1 ships a **binary** `forming | mature` split above the existing doc-level content gate; a continuous 0–1 score and a revision-activity signal (returning to earlier passages, edit density — the fidelity bar's "real cognitive signals") are the natural **deferred** refinement once V2 shows whether the binary split is too coarse. Thresholds are provisional and calibrated by V1.

### The promotion mechanic — kind + severity + voice

A structural gap is the *same finding* whether the doc is forming or mature; what changes is how seriously and how firmly we surface it. Promotion therefore moves **three** things together:

1. **Kind** — `forming` → `opportunity`; `mature` → `problem` (the "warning"). This is the lever the noisiness budget reads: `NOISINESS["key"]` is problem-kind only, so a matured warning reaches "Key issues" while a forming opportunity does not.
2. **Severity** — `mature` escalates the gap-type's base severity one step (via `computePriority`), raising its `priority` so it ranks above forming-stage soft suggestions.
3. **Voice** — the generated message text shifts from gentle-opportunity phrasing to located-warning phrasing. This is the user's explicit requirement: the difference is *not only* the label, it's the language. The doc-level prompt receives the maturity flag and phrases accordingly; `emotional_register.md` owns the copy guide.

This is option-2 ("change type/label") extended with the voice and severity dimensions, rather than the pure severity-modulation of option-1 — because a relabel without a voice change would read as cosmetic, and a severity change without a kind change wouldn't compose with the kind-keyed noisiness budget.

### Scope — gaps only; defects always surface

Maturity modulates the **structural gap types only**: `missing_topic`, `underexposed_topic`, `structure_flow`, `audience_mismatch` (all doc-level, opportunity-kind today). **Defects always surface, precision-gated, regardless of maturity:**

- **`contradiction`** is the hero capability — suppressing it on an early draft risks killing the wow at the exact moment it would land. It always surfaces.
- **`unsupported_claim`** also always surfaces. (This was a live fork — one could argue "unsupported" is premature mid-draft since the evidence is still coming — but it was decided to keep defects uniformly always-on; revisit if V2 shows early unsupported-claim flags read as abrasive.)

Span nits (`clarity`, `undefined_jargon`) are out of scope — they're local correctness, not maturity-sensitive structure.

### Composition (the load-bearing interactions)

- **Noisiness budget (R2c / Milestone E):** the maturity-stamped `kind` *is* what the `NOISINESS` filter keys on, so R2 and the noisiness switch compose by construction. The requirement is that `partitionFeed` reads the maturity-derived kind (not a static type→kind map) and that `feedBudget.test.ts` proves a forming opportunity hides at "Key issues" while its matured warning shows. The switch itself ships **after** R2 + V2.
- **Discomfort-budget ceiling (G4):** independent lever (G4 caps *contradictions* by emotional load; R2 modulates *gaps* by maturity). They don't collide; assert no regression.
- **Feed choreography (R3c, done):** a promotion is a content/kind change on an existing card → it naturally trips the "New/changed" marker, which is the *desired* read ("your doc matured, this got more serious"). Reuse it.
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
