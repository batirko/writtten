# V1 — Base-rate corpus study

**Date:** 2026-07-06 · **Status:** ⏳ machinery landed, numbers pending the keyed run + verified labels
**Track:** `docs/projects/field_validation.md` § V1 · **Lane:** Validation

> This is the durable home for the three V1 numbers. The **runner + scorers +
> labeling-sheet artifact** shipped in this PR; the **numbers below are TBD** until
> the corpus is assembled, the AI first-pass labels are human-verified, and the
> free+paid double-run is executed (spread across days to respect free-tier RPD).
> Fill each `TBD` in place — do **not** start a new snapshot for the results.

## What shipped (machinery)

| Piece | Where |
| --- | --- |
| Markdown → heading-grouped sections | `src/services/eval-fixtures/corpus/splitSections.ts` |
| Corpus fixture builder — anonymised ids, **`docType` stratification** | `src/services/eval-fixtures/corpus/loadCorpus.ts` |
| Reproducible sourcing script (public URLs only) | `src/services/eval-fixtures/corpus/fetch-corpus.sh` |
| Labeling-sheet format + parser + `labelToExpected` | `src/services/eval-fixtures/corpus/labeling/` (`labels.template.csv`, `emissions.template.csv`, `loadLabels.ts`, `README.md`) |
| Per-bucket recall / wild precision / tier diff + **per-`docType` stratification** | `src/services/evalScorer.ts` (`scoreCorpusRecall`, `scoreWildPrecision`, `diffTierRuns`, `unlabeledContradictions`, `stratifyRecall`, `stratifyWildPrecision`) |
| Record-mode runner (spends RPD once, dumps replayable fixtures) | `src/services/eval-fixtures/runFixture.ts` (`runRecord`) |
| `EVAL_V1`-gated corpus runner + stratified report | `src/services/evalV1Corpus.live.test.ts` · `npm run eval:v1` |

Corpus + filled labeling sheets + dumped recordings live in a **local, gitignored**
`.v1-corpus/` (local-first invariant #5; audit-#5 privacy). Only the templates,
loader, and sourcing script are committed.

## Corpus composition & sourcing (stratified)

The persona writes "PRDs, specs, comms, and decision docs", so the corpus is
**stratified** by `docType` and results are reported both **overall** and **per
type** — to see whether contradiction-at-distance (the hero) holds off its
best-case doc type or collapses. On disk: one subfolder per type
(`.v1-corpus/<docType>/*.md`); the runner tags each doc and the report slices by it.

**Sourced 2026-07-06** via `fetch-corpus.sh` (19 docs, all public + license-clear
markdown; stored locally, referenced by anonymised id `P01`…`P19`):

| `docType` | n | Source | License |
| --- | --- | --- | --- |
| `spec` (PRD proxy) | 10 | Rust RFCs (8), React RFCs (2) | MIT / Apache-2.0 |
| `decision` | 4 | Cosmos SDK ADRs | Apache-2.0 |
| `comms` | 3 | Rust blog announcements | MIT / Apache-2.0 |
| `prd` | 2 | WICG web-platform explainers (PRD-shaped) | CC-BY / W3C |

> **Validity caveat — read before quoting the base rate.** Genuine confidential
> PRDs are almost never public, so the `spec` slice uses **open-source RFCs / design
> docs as a proxy** and `prd` uses PRD-shaped explainers. RFCs are the closest
> abundant public analog to specs (problem / motivation / alternatives / drawbacks),
> and they contain real, un-planted contradictions — but the base rate measured
> here is **"public engineering-spec base rate," not "confidential-PRD base rate."**
> This is the honest limit of public evidence; it still beats n=0 / founder-only.
> The `prd`+`spec` split lets you check whether the number is register-sensitive,
> and the audit-#5 path stays open to drop in confidential PRDs (paid-key only) later.

## How to run it (the follow-up)

0. Assemble the corpus with `bash src/services/eval-fixtures/corpus/fetch-corpus.sh`
   (or drop your own docs in). Layout is **one subfolder per `docType`**:
   `.v1-corpus/{prd,spec,decision,comms}/*.md`. Docs get anonymised ids (`P01`…)
   ordered by (docType, filename); the runner tags each doc's type from its subfolder.
2. Hand-label `./.v1-corpus/labels.csv` **tool-blind** (copy from
   `labels.template.csv`). An AI first-pass draft is allowed but every row stays
   `verified=false` until a human confirms it — the scorer counts **verified rows
   only**, so a draft never masquerades as evidence.
3. Set `VITE_GEMINI_API_KEY` (+ `VITE_GEMINI_PAID_KEY` for the paid tier) and run
   `V1_RECORD=1 npm run eval:v1`. This makes the real free+paid calls, dumps
   replayable fixtures to `.v1-corpus/recordings/`, and writes an
   `emissions.generated.csv` draft to adjudicate.
4. Adjudicate `emissions.generated.csv` (verdict `tp`/`fp`, set `verified=true`),
   rename to `emissions.csv`.
5. Re-score offline any time with `npm run eval:v1` (no `V1_RECORD`) — replays the
   dumped fixtures in mock mode, **zero network**, identical numbers. Batch the
   record runs across days; watch `getApiStats()` for remaining RPD.

## Results

### 1. Hero base rate & recall — overall AND per `docType`

_Bucket 1 (strict contradiction) is the hero; Bucket 2 (tension) reported separately.
The per-type rows are the point of stratification: does the hero hold off `spec`, or collapse?_

| Slice | Bucket | Docs | Labels | Base rate / doc | Recall (paid) |
| --- | --- | --- | --- | --- | --- |
| ALL | B1 strict contradiction | TBD | TBD | TBD | TBD |
| ALL | B2 tension | TBD | TBD | TBD | TBD |
| spec | B1 / B2 | 10 | TBD | TBD | TBD |
| prd | B1 / B2 | 2 | TBD | TBD | TBD |
| decision | B1 / B2 | 4 | TBD | TBD | TBD |
| comms | B1 / B2 | 3 | TBD | TBD | TBD |

### 2. Per-type precision in the wild (overall; also sliced per `docType`)

_TP / (TP+FP) from adjudicated emissions, vs the ratchet's per-type floors. The runner
also prints a per-`docType` breakdown so one register (e.g. `audience_mismatch` on comms)
doesn't masquerade as the whole floor._

| Type | n | Wild precision | Ratchet floor | Meets floor? |
| --- | --- | --- | --- | --- |
| contradiction | TBD | TBD | 95% | TBD |
| unsupported_claim | TBD | TBD | 85% | TBD |
| audience_mismatch | TBD | TBD | 85% | TBD |
| clarity | TBD | TBD | 80% | TBD |
| undefined_jargon | TBD | TBD | 80% | TBD |
| missing_topic / underexposed_topic / structure_flow / strategic_tension | TBD | TBD | 70% | TBD |

### 3. Free-vs-paid delta

- Confident **false** contradictions on the **free** tier (no verified B1 label): **TBD**
- Free-only vs paid-only conflicts (recall lost on the free tier): **TBD**

## Implications (fill after the numbers land)

- **Free-tier: real tier or demo?** (`docs/plan.md` open question; audit #3) — TBD.
- **Per-type ratchet-floor recalibration** (`evaluator_quality_ratchet.md`; audit #7) —
  TBD (replace the provisional `PRECISION_FLOORS` constants with these wild numbers).
- **Is contradiction-at-distance frequent enough to be the hero?** (this is the
  gate the Phase-6 decision-rigor taxonomy waits behind) — TBD.

## Hand-off

- The verified `labels.csv` is the ground truth **V3** (recall harness) reuses.
- The wild-precision numbers recalibrate the ratchet's per-type floors.
