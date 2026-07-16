# V1 — Base-rate corpus study

**Date:** 2026-07-06 (machinery) · updated **2026-07-16** (Run 1) · **Status:** ✅ first keyed run done — cost-bounded 9-doc subset; full-corpus run still pending
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

**Sourced 2026-07-06** via `fetch-corpus.sh` (21 docs, all public + license-clear
markdown; stored locally, referenced by anonymised id `P01`…`P21`):

| `docType` | n | Source | License |
| --- | --- | --- | --- |
| `prd` | 4 | 2 WICG web-platform explainers (PRD-shaped) + 2 genuinely-hunted PRDs: 1 **genuine** company PRD (paziresh24) + 1 **illustrative** example PRD (ugur10 template) | CC-BY/W3C · public · MIT |
| `spec` (PRD proxy) | 10 | Rust RFCs (8), React RFCs (2) | MIT / Apache-2.0 |
| `decision` | 4 | Cosmos SDK ADRs | Apache-2.0 |
| `comms` | 3 | Rust blog announcements | MIT / Apache-2.0 |

> **Validity caveat — read before quoting the base rate.** Genuine confidential
> PRDs are almost never public, so the `spec` slice uses **open-source RFCs / design
> docs as a proxy** and `prd` uses PRD-shaped explainers. RFCs are the closest
> abundant public analog to specs (problem / motivation / alternatives / drawbacks),
> and they contain real, un-planted contradictions — but the base rate measured
> here is **"public engineering-spec base rate," not "confidential-PRD base rate."**
> This is the honest limit of public evidence; it still beats n=0 / founder-only.
> The `prd`+`spec` split lets you check whether the number is register-sensitive,
> and the audit-#5 path stays open to drop in confidential PRDs (paid-key only) later.

> **Corpus expanded 2026-07-16 → 28 docs.** The `prd` slice gained **6 real, author-written
> PRDs** — 5 confidential internal product docs + 1 job-application case study — and the
> `decision` slice gained 1 real strategy case study. This **partly closes the validity
> caveat above**: the `prd` base rate is no longer proxy-only. Confidential docs run on both
> tiers per an explicit owner decision (recorded in the local manifest); source text stays
> gitignored and is referenced here by anonymised id only.
>
> **Labels human-verified 2026-07-16** (24 rows, all `verified=true`). The pre-run signal held:
> the polished public proxies carried **near-zero** un-disclosed contradictions, while the **real
> PRDs each carried ~1 genuine un-planted contradiction** (structural — a metric/timeframe/SLA
> that conflicts with another section), plus author-confirmed tensions. So the hero has real
> material to catch — the base rate is not an artifact of the proxy.

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

> **Run 1 — 2026-07-16, cost-bounded 9-doc subset (both tiers).** Free-tier RPD is the
> binding constraint, so the first keyed run covered a **9-doc subset** chosen for
> signal-per-cost: **7 `prd`** (6 real author-written PRDs + 1 public proxy) and **2
> `decision`** (1 real strategy case study + 1 code ADR proxy). The remaining 19 docs
> (all `spec`/`comms` + the rest) are **unrun**. Numbers are this subset, paid tier
> unless noted. The runner was made resumable (`V1_RESUME`) after the record pass
> exceeded one test timeout. Artifacts: gitignored `.v1-corpus/runs/2026-07-16-focused9/`.

### 1. Hero base rate & recall (9-doc subset, paid tier, verified labels)

| Slice | Bucket | Docs | Labels | Base rate / doc | Recall |
| --- | --- | --- | --- | --- | --- |
| ALL | B1 strict contradiction | 9 | 10 | **1.11** | **10%** (1/10) |
| ALL | B2 tension | 9 | 5 | 0.56 | 0% (0/5) |
| prd | B1 | 7 | 8 | 1.14 | **0%** (0/8) |
| prd | B2 | 7 | 3 | 0.43 | 0% |
| decision | B1 | 2 | 2 | 1.00 | 50% (1/2) |
| decision | B2 | 2 | 2 | 1.00 | 0% |

**The base rate is real (~1.1 strict contradictions/doc) — but recall is near-zero on real
PRDs.** The single B1 catch was a code-level conflict in the ADR proxy (lexically-dense,
same-domain claims — the tool's best case). **Every labeled contradiction in the 7 PRDs was
missed.**

### 2. Contradiction wild precision (adjudicated with the author)

| Slice | n emitted | Wild precision | Floor | Meets? |
| --- | --- | --- | --- | --- |
| ALL | 13 | **15%** (2/13) | 95% | ❌ |
| prd | 4 | **0%** (0/4) | 95% | ❌ |
| decision | 9 | 22% (2/9) | 95% | ❌ |

The 13 emitted contradictions were adjudicated `tp`/`fp` with the author of the real docs.
**On the real PRDs, all 4 emitted contradictions were false positives; the only 2 true
positives were both in the ADR proxy.** The FP patterns are structured, not random
(abstracted): two synonymous phrasings of one rule flagged as conflicting · a statement
flagged against its own restatement · a scope-exclusion flagged against an in-scope
commitment · a current-state problem flagged against the proposed fix that resolves it.
_(Other types not formally adjudicated this run — but see the jargon volume note in §3.)_

### 3. Free-vs-paid delta + jargon noise

- **Free tier under-adjudicates contradictions:** 2 emitted (both false) vs the paid tier's 13.
  Confident **false** contradictions on the free tier: **2**.
- **Undefined-jargon volume dominates the real-PRD feed:** the section-eval `undefined_jargon`
  check fired **21–53× per technical PRD** (vs ~2 on the public proxies) — a wall of flags,
  eyeballed as largely audience-inappropriate (domain vocabulary the doc's own intended reader
  would share). This, not the hero, is the most conspicuous real-PRD-experience finding.

## Implications

- **The contradiction hero, as built, does not survive real PRDs** — 0% recall *and* 0%
  precision on the author's own PRDs, both far under the 95% trust floor. **But the base rate
  is real (~1.1/doc)**, so the failure is in *finding / adjudicating*, not in whether
  contradictions exist. A fixable engine, not a dead premise.
- **Diagnosed miss mechanism = OBS-038** (candidate selection, not adjudication): the Jaccard
  prefilter surfaces a *compatible* near-duplicate of a claim and crowds the *contradictory*
  claim out of the top-K, so the adjudicator is never shown the real pair. → promotes the
  deferred real-vector / prefilter fix from "Discovered" to scheduled.
- **The FP patterns are structured** → scope-exclusion tagging (OBS-030, already Phase 8)
  removes one class; synonym / restatement / current-vs-proposed-temporal guards address the rest.
- **Jargon is the dominant felt-noise** → the fix is **audience-relative, _inferred_**
  calibration (flag a term only if the doc's inferred audience likely wouldn't know it) plus
  volume management (once-per-distinct-term, ranked cap) — **not** a bigger allow-list. Keeps
  the "should you explain this?" provocation only where it's live.
- **Per-type ratchet-floor recalibration** (`evaluator_quality_ratchet.md`; audit #7) — the
  contradiction wild-precision here (15% observed vs 95% floor) is a subset signal; recalibrate
  once a fuller run lands, but the gap direction is unambiguous.
- **Free-tier: leaning demo, not real tier** (audit #3) — near-silent on contradictions and,
  combined with the jargon wall, a weak keyless experience. Informs the free-vs-paid decision.

**Caveats:** n=9 subset, RPD-bounded; contradiction precision rests on author adjudication
(the FPs were clear-cut); the `spec`/`comms` slices are unrun. Directionally strong enough to act on.

## Hand-off

- The verified `labels.csv` is the ground truth **V3** (recall harness) reuses.
- The wild-precision numbers recalibrate the ratchet's per-type floors.
