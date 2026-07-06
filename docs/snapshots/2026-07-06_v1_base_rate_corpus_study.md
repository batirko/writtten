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
| Corpus fixture builder (anonymised ids) | `src/services/eval-fixtures/corpus/loadCorpus.ts` |
| Labeling-sheet format + parser + `labelToExpected` | `src/services/eval-fixtures/corpus/labeling/` (`labels.template.csv`, `emissions.template.csv`, `loadLabels.ts`, `README.md`) |
| Per-bucket recall / per-type wild precision / tier diff | `src/services/evalScorer.ts` (`scoreCorpusRecall`, `scoreWildPrecision`, `diffTierRuns`, `unlabeledContradictions`) |
| Record-mode runner (spends RPD once, dumps replayable fixtures) | `src/services/eval-fixtures/runFixture.ts` (`runRecord`) |
| `EVAL_V1`-gated corpus runner + report | `src/services/evalV1Corpus.live.test.ts` · `npm run eval:v1` |

Corpus + filled labeling sheets + dumped recordings live in a **local, gitignored**
`.v1-corpus/` (local-first invariant #5; audit-#5 privacy). Only the templates and
loader are committed.

## How to run it (the follow-up)

1. Drop 15–20 public PRDs (`*.md`) into `./.v1-corpus/` (or set `V1_CORPUS_DIR`).
   They get anonymised ids (`P01`…) by sorted filename.
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

### 1. Hero base rate & recall

_Bucket 1 (strict contradiction) is the hero; Bucket 2 (tension) reported separately._

| Bucket | Labels | Base rate / doc | Recall (paid tier) |
| --- | --- | --- | --- |
| B1 — strict contradiction | TBD | TBD | TBD |
| B2 — tension | TBD | TBD | TBD |

Corpus size: TBD docs · verified labels: TBD.

### 2. Per-type precision in the wild

_TP / (TP+FP) from adjudicated emissions, vs the ratchet's per-type floors._

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
