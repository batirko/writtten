# V1 corpus labeling sheet

The durable ground-truth artifact for the **base-rate corpus study** (see
`docs/projects/field_validation.md` § V1). Two flat CSVs, keyed by anonymised
`doc_id` (`P01`…`P20`), hand-labeled independently of writtten. This folder holds
the **templates + parser only** — the *filled* sheets carry quoted PRD text and
therefore stay **local and gitignored** (`.v1-corpus/`), per local-first
invariant #5 and the audit-#5 privacy handling.

Downstream, this sheet is reused by **V3** (recall harness) and the **evaluator
ratchet** (per-type precision-floor recalibration, audit #7) — so the format is
load-bearing.

## The two sheets

### `labels.csv` — tool-blind ground truth (recall)

One row per labeled **conflict pair**, produced *before/without* running the
pipeline so the base rate stays clean. Two buckets, **reported separately**:

- **Bucket 1 — strict contradiction:** a genuine logical incompatibility across
  the doc (A vs not-A, e.g. "ships Q2" vs "ships Q3"). This is the `contradiction`
  hero measure; `totalLabels / docCount` is the **hero base rate**.
- **Bucket 2 — tension / inconsistency:** a softer conflict (a metric that
  doesn't match a stated goal, an unstated trade-off) — the `strategic_tension`
  measure.

| column | meaning |
| --- | --- |
| `doc_id` | anonymised id (`P01`…). Rows whose id starts with `#` are ignored. |
| `bucket` | `1` = strict contradiction, `2` = tension |
| `span_a`, `span_b` | the two conflicting quotes, verbatim (double-quote to embed commas; `""` escapes a quote) |
| `section_a_id`, `section_b_id` | optional section anchors (informational; matching is span-based) |
| `rationale` | one line: why this is a conflict |
| `verified` | `false` = AI first-pass draft (does **not** count) · `true` = human-confirmed |

### `emissions.csv` — per-emission adjudication (wild precision)

Auto-generated per run by the V1 runner (one row per emitted observation, verdict
blank), then adjudicated by hand. Feeds per-type **precision in the wild**.

| column | meaning |
| --- | --- |
| `doc_id` | anonymised id |
| `obs_type` | the observation type |
| `anchored_span` | the span it anchored to (or message, for doc-scoped) |
| `message` | the observation text |
| `verdict` | `tp` (real issue) · `fp` (spurious). Blank until adjudicated (skipped by the scorer). |
| `verified` | `false` = draft · `true` = human-confirmed |

## Workflow

1. Drop 15–20 public PRDs (`*.md`) into the local corpus dir (`V1_CORPUS_DIR`,
   default `./.v1-corpus/`). They get anonymised ids by sorted filename.
2. Hand-label `labels.csv` tool-blind (or generate an AI first-pass draft with
   `verified=false` and verify each row before it counts).
3. Run `EVAL_V1=1 npm run eval:v1` (record mode) — dumps replayable fixtures and
   an `emissions.csv` draft to adjudicate.
4. Re-score offline in mock mode from the dumped fixtures (zero network) to get
   the three numbers: **hero base rate, per-type wild precision, free-vs-paid
   delta**. Record them in the `docs/snapshots/` entry.

The parser is `loadLabels.ts` (`parseLabels`, `parseEmissions`, `labelToExpected`);
the scorers are `scoreCorpusRecall`, `scoreWildPrecision`, `diffTierRuns` in
`src/services/evalScorer.ts`.
