---
status: in-progress
kind: research
phases: [8]
summary: The 2026-06-10 due-diligence audit's headline work — falsify (or confirm) the central bet with evidence from outside the founder's own head. A base-rate corpus study over real PRDs, structured sessions with external PMs on their own drafts, and instrumentation that can finally see the hero capability's *misses* (not just its false positives). Scheduled as the heart of Phase 8 (2026-07-10, V1 first); the V1 machinery + a hand-labeled corpus already exist.
---

# Field validation — close the n=0 gap

> **Readiness target:** make the central bet falsifiable. The due-diligence audit (`docs/snapshots/2026-06-10_due_diligence_audit.md`) judged the product _"a research artifact and a craft project … one of the best-documented small codebases we've audited"_ — but **a product with zero users and a five-phase plan that never schedules one.** Every field observation (OBS-001..023, both prior snapshots) is the founder pasting test docs at their own tool, tuned against the one person guaranteed to agree with it. This project puts the bet on a table where it can lose.

## Status

**In-progress — Phase 8 (re-scheduled as the heart of Phase 8 on 2026-07-10, V1 first). Protocols settled 2026-06-18 (V1/V2/V3 all 🟢); V1 machinery + corpus + human-verified labels landed 2026-07-06→16; V1 Run 1 (cost-bounded 9-doc subset, both tiers) executed and written up 2026-07-16 — see the snapshot for the numbers (base rate real; hero recall/precision far under floor; jargon dominates felt noise).** The run procedures, labeling rubric, session format, and instrumentation design are fully specified below; what remains is _running_ them (the keyed V1 free+paid run, the five sessions, the recall harness build) — not further design. **Was** scheduled as a Phase-6 parallel track (2026-06-13, over the audit's argument for a hard gate); the owner parked the track to the then-Phase 7 (post-traction) and re-scheduled it as Phase 8 in the 2026-07-10 plan re-cut. Everything below is build-ready when it's picked up; the V1 base rate is already partly readable from the verified labels (see the snapshot).

Read alongside:

- `docs/snapshots/2026-06-10_due_diligence_audit.md` — the source findings (this file's V-IDs map to its numbered findings).
- `docs/product-requirements.md` (§3 — the silence/rhythm bet is "a bet, not a settled truth"; R4.4/R4.6 — the precision asymmetry and the load-bearing hero) — the theories this work tests.
- `docs/logs/prompt_quality_observations.md` (OBS-010) — the one register-discipline field datum, which _contradicts_ the register; V2 is its falsification.
- `docs/projects/quality_remediation_synthesis.md` (R2 — severity ∝ maturity) — the hypothesis V2 confirms or kills.
- `docs/projects/observation_taxonomy_and_priority.md` (Milestone C) — the Phase-9 decision-rigor taxonomy whose research gate **is** V1.
- `docs/projects/evaluator_quality_ratchet.md` — the corpus/scorer machinery V1 and V3 run on; the per-type-floor tightening (audit #7) is a new milestone there.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7** | **V1** base-rate corpus study (un-planted true contradictions, per-type precision in the wild, free-vs-paid delta). **V2** five external-PM sessions on real drafts (write-vs-paste behavior; located-critique as respect-or-cold; second-session return). **V3** hero-miss instrumentation so recall — not just false positives — becomes visible. Also feeds the decision-rigor taxonomy expansion (its corpus gate is V1) and any retention/positioning decisions that survive contact with real users. _(Deferred from Phase 6 → 7 on 2026-07-07.)_ |

## Why this, and why now

The audit names two FATAL findings, both downstream of n=0:

1. **The central bet is unfalsified.** The fidelity bar, the discomfort budget, the persona spec, the dismissal-learning taxonomy are all theories of _other people's_ psychology, validated against the most philosophically bought-in user on Earth. _"Naming a risk in beautiful prose feels like handling it."_
2. **The hero capability has an unmeasured base rate, and the instrumentation is structurally blind to its failures.** Every recorded catch is of a _planted_ contradiction (the Q2/Q3 fixture). No doc estimates how often a real PRD contains a genuine contradiction the author wouldn't self-catch. The observation log can only capture false _positives_ — a user never reports the contradiction the tool _missed_. And the Jaccard top-10 lexical prefilter silently drops semantically-related-but-lexically-distant claim pairs ("Q2" vs "the second quarter") — eroding hero-recall in exactly the invisible way.

If the hero fires rarely and the daily experience is the noisy supporting cast (`clarity`/`undefined_jargon`/`unsupported_claim` — the most trust-eroding surface per the field log), the product has a first-week-retention shape the corpus never confronts. These are cheap to de-risk and currently scheduled _behind_ the features they should inform.

## Todo

### V1 — Base-rate corpus study — 🟢 Med · 🧠 (audit #2, #7) — protocol settled 2026-06-18

> **Machinery landed 2026-07-06** (runner + scorers + labeling-sheet artifact — the run itself is the remaining work, tracked by the unticked boxes below). The headless corpus runner is `npm run eval:v1` (`src/services/evalV1Corpus.live.test.ts`, `EVAL_V1`-gated); the two-bucket recall / per-type wild-precision / free-vs-paid scorers are `scoreCorpusRecall` / `scoreWildPrecision` / `diffTierRuns` / `unlabeledContradictions` in `src/services/evalScorer.ts`; markdown→sections + fixture builder are in `src/services/eval-fixtures/corpus/`; the labeling-sheet format + parser + the "how to run it" walkthrough are in `src/services/eval-fixtures/corpus/labeling/` (see its `README.md`) and mirrored in `docs/snapshots/2026-07-06_v1_base_rate_corpus_study.md` (the durable home for the numbers). Corpus + filled labels + dumped recordings stay in a local, gitignored `.v1-corpus/` (invariant #5). Record once with `V1_RECORD=1`, then re-score offline for free. **Stratified 2026-07-06:** the corpus is bucketed by `docType` (`prd`/`spec`/`decision`/`comms`, one subfolder each) and every number is reported overall **and** per type (`stratifyRecall` / `stratifyWildPrecision`), so the hero base rate can be checked for whether it holds off its best-case doc type or collapses. A reproducible sourcing script (`fetch-corpus.sh`, public URLs only) assembled a 19-doc corpus (spec 10 / decision 4 / comms 3 / prd 2). **Caveat:** confidential PRDs aren't public, so `spec` uses open-source RFCs/design docs as a PROXY and `prd` uses PRD-shaped explainers — the base rate is "public-spec", not "confidential-PRD" (see the snapshot's validity caveat); the audit-#5 path stays open to add real PRDs on a paid key later.

> **⚠️ Before planning any further V1 run — read this first (2026-07-21).**
>
> **Every dumped recording in `.v1-corpus/` is stale.** A mock-mode replay of the current corpus scored **282 requests / 282 misses**. Cause is legitimate, not a bug: `#196` (audience-relative jargon) and `#207` (rhetoric extraction) each edited the section-eval prompt *after* Run 1, and the replay key is `reqHash(system, user, json)` — so every section-call key moved. Contradiction calls then never fire either, because the fast call returns `{}` and no claims reach the ledger.
>
> **Consequences for anyone picking up V1:**
>
> 1. **`V1_RESUME` cannot cheaply extend Run 1.** It only skips docs whose dump already exists — and every existing dump is now worthless. Any further run is a **full re-record** of whatever slice is chosen.
> 2. **Budget accordingly.** From Run 1's own logs, ~800–1,300 model calls covered 9 docs across both tiers. The 10-doc `prd` slice is **~1,000–1,400 calls** ≈ one day of free-tier RPD plus modest paid spend. **The binding free-tier limit is 500 RPD**, not 20 — `gemini-3.1-flash-lite` (the workhorse on both tiers of a free key) carries 500/day; only the `gemini-3.5-flash` fallback is 20. Older notes citing "~20 RPD" mislead on this.
> 3. **Run 1's numbers stay valid as a historical record** (they were measured on 2026-07-16's code) but are **not reproducible on current `main`**, and the current pipeline — post OBS-030, OBS-038, jargon calibration, OBS-037 — would give different ones. That re-measure is the point of the next run, not a cost to avoid.
> 4. **This can no longer fail silently.** A mock miss returns an empty `{}`, so a fully-stale corpus used to yield clean zeros and a **passing** test — a run that measured nothing was indistinguishable from one that found nothing. The runner now prints a per-arm replay-fidelity table and fails on any miss (`#245`).
>
> **Run-1 → current doc-id mapping** (derived empirically from label spans + recording contents; the corpus was re-keyed after Run 1, so the archived `runs/2026-07-16-focused9/` artifacts use ids that no longer mean what they say):
>
> | Run 1 id | Current id | File |
> | --- | --- | --- |
> | `P01` | `P04` | `prd/prd-trading-alerts.md` |
> | `P02` | `P05` | `prd/study-n8n.md` |
> | `P03` | `P06` | `prd/vi-01.md` (agentic gateway; intentionally zero labels) |
> | `P04` | `P07` | `prd/vi-02.md` |
> | `P05` | `P08` | `prd/vi-03.md` |
> | `P06` | `P09` | `prd/vi-04.md` |
> | `P07` | `P10` | `prd/vi-05.md` |
> | `P08` | `P22` | `decision/cosmos-adr-02.md` |
> | `P09` | `P25` | `decision/study-ai-coding.md` |
>
> Current ids are assigned by (docType rank, filename) in `anonymisedId`/`buildCorpus` (`corpus/loadCorpus.ts`), so `prd` is plain alphabetical: `explainer-01`=P01 … `vi-05`=P10; `spec` P11–P20; `decision` P21–P25; `comms` P26–P28.

**Run procedure (build-ready):**

- [ ] **Assemble the corpus — 15–20 real PRDs.** Sources: the founder's own; colleagues' with permission; public post-mortems / spec write-ups. **Privacy:** others' confidential docs run **only** under a paid key or local model — never the free tier (which may train on them; audit #5). Store the corpus outside the repo; reference docs by anonymised id in the snapshot.
- [ ] **Hand-label first, tool-blind.** Before running the pipeline, label each doc independently of writtten, into **two buckets** (decision 2026-06-18 — count both, report separately so the hero number stays clean):
  - **Bucket 1 — strict contradictions:** genuine logical incompatibilities across the doc (A vs not-A — e.g. "ships Q2" vs "ships Q3"). This is the `contradiction`-type hero measure.
  - **Bucket 2 — tensions / inconsistencies:** softer conflicts (a metric that doesn't match a stated goal, an unstated trade-off) — what `strategic_tension` covers.
  - Per labeled item record: doc id, the two span locations (quoted text), bucket, and a one-line rationale. Use a flat labeling sheet (CSV/MD table) keyed by doc id; this sheet **is** the ground truth V3 and the ratchet reuse.
- [ ] **Run the pipeline over each doc** via the `runFixture` headless path (or harness `loadDoc`/`loadMarkdown`). Capture the full emitted observation set per doc (all types, with anchors).
- [ ] **Free-vs-paid delta:** run each doc **twice** — once under free-tier model routing, once under a paid key — and diff the `contradiction`/`strategic_tension` outputs. Count **confident false contradictions emitted on the free tier** (the precise R4.4 failure).
- [ ] **Count and report:**
  - **Hero base rate** — Bucket-1 contradictions per document (and Bucket-2 separately), un-planted, found by hand-labeling.
  - **Per-type precision in the wild** — for each observation type, tool emissions matched against labels / total emissions (feeds the ratchet's per-type floors, audit #7).
  - **Free-tier vs paid-tier delta** — the confident-false-contradiction count and any per-type precision gap.
- [ ] **Output:** a `docs/snapshots/` entry with the numbers and the implications for (a) the **free-tier-real-or-demo** decision, (b) the **per-type ratchet floors**, (c) whether contradiction-at-distance is **frequent enough to be the hero**. **This is the gate the Phase-9 decision-rigor taxonomy was specified to wait behind.** The labeling sheet is handed to **V3** (recall ground truth) and the **ratchet** (independent labels — see `evaluator_quality_ratchet.md` audit #7).

### Free-tier signal-quality expectations (Phase-8 milestone; deliverable settled 2026-07-16)

V1 Run 1 confirmed the 2026-07-10 keyed-sweep observation at corpus scale: the free tier emitted **2** contradictions across the 9-doc subset — **both false** — against the paid tier's 13. The free tier is near-silent on the hero and wrong when it speaks. This milestone turns that from an observation into a stated product posture. Three deliverables:

1. **The fuller free-tier read.** Extend the V1 run past the 9-doc subset (`V1_RESUME`; at minimum the remaining `prd` + `spec` docs) so the free-tier delta rests on more than n=2 emissions. Zero new design — the runner, scorers, and `diffTierRuns` already report it.
2. **A pre-registered decision rule** (registered 2026-07-16, before the fuller run, so the outcome can't be argued into comfort): _if the fuller run's free-tier confident-contradiction wild precision is below the Tier-A floor (0.95 — realistically: if it is not dramatically better than Run 1's 0/2), the free tier stops presenting confident contradiction cards._ Recommended mechanism (owner ratifies at pickup): on `capability.adjudicateConfidently === false`, the per-section and sweep parse paths drop the `contradictions` bucket (the `tensions` bucket and all span checks stay) — an emit-side gate in `evaluator.ts`, no prompt/hash change on the paid path. A false hero card is the R4.4 maximum-damage failure; a free tier that stays quiet about contradictions and says so is more trustworthy than one that guesses.
3. **The stated decision in the docs.** Whatever the rule produces, write the free-tier expectations plainly where users and readers meet them: the strategic open question's own terms ("if BYO-key is effectively mandatory to meet the bar, that should be a **stated decision** in `docs/concept.md`/`docs/features.md`, not an emergent one"), plus the first-run/BYOK copy if mechanism 2 ships (e.g. the key-entry note stating contradiction detection needs a paid-tier key). This also settles the quality half of the "Free tier: real tier or demo?" open question with evidence.

**Status 2026-07-21 — built, then deliberately NOT shipped (owner decision). Deliverable 2 is not ready to ratify.**

The mechanism in (2) was implemented and tested, then held back. What exists, on branch **`parked/freetier-contradiction-gate`** (rebase it forward; don't rebuild):

- A third capability flag, `emitContradictions`, kept **separate** from `adjudicateConfidently`. That separation is load-bearing and is the non-obvious part of the design: `adjudicateConfidently` also selects the hedged-vs-confident *prompt*, so gating on it directly is hash-affecting — it would have silently blanked the ~20 `contradiction` expectations across the fixture corpus (which runs at `WEAK_CAPABILITY` against hedged recordings) and turned the ratchet red. The separate flag keeps prompts byte-identical: **zero fixtures re-recorded**.
- Guards at both emit paths (per-section and the bulk-paste sweep), with dedicated tests, since the corpus deliberately runs with the gate open and would not notice it breaking in either direction.

**Why it was held:** the free-tier case rests on **n=2 emissions**, and the rule registered on 2026-07-16 is conditioned on *the fuller run's* precision — which has not been run. Shipping on n=2 would answer the "free tier: real tier or demo?" positioning question, by narrowing the hero capability out of the free tier, on two data points. The registration was written to stop a bad result being argued into comfort; it is not satisfied by substituting a thinner basis for the measurement it names. What is tolerated meanwhile, measured: ~**1 false contradiction per 4–5 documents** on the free tier.

**Sequencing when this is picked up:** re-record the 10-doc `prd` slice (⚠️ see the staleness callout in § V1 — this is a full re-record, not `V1_RESUME`), adjudicate **only** the contradiction emissions (~15 verdicts), then decide. One further input: the keyless landing demo currently surfaces **no contradiction card at all** (UX-040) — so shipping the gate before that is fixed would leave the free path with no contradiction evidence anywhere, demo included.

The clarity-noisiness half of the original observation (5 low-severity cards on a 178-word draft) is deliberately **not** re-solved here — it is the same volume problem the audience-relative jargon calibration and the priority budget already own; this milestone's scope is the contradiction trust surface.

### V2 — External-PM sessions (×5) — 🟢 Med · 🧠 (audit #1, #4, #6) — protocol settled 2026-06-18

> **Deferred to unscheduled 2026-07-17 (owner call).** Moved out of the active Phase-8 list to the `docs/plan.md` → _Discovered / unscheduled_ backlog — build-ready, not blocked, just not next. The framing below stands: this is still the cheapest falsification of the central bet and the highest-value item to pick back up.

**Format (decided 2026-06-18): unmoderated use + structured debrief.** Each PM uses writtten **alone** on their own draft (lowest observer effect on the write-vs-paste behaviour we most want to measure — a moderator watching changes how people draft), with the session instrumented **locally** via the harness event stream; then a short debrief interview. This trades live-reaction richness for honest behaviour + scale; the debrief recovers the reactions.

**Recruitment + setup (build-ready):**

- [ ] **Recruit five PMs outside the project**, via the founder's network / PM communities. Screener: each must bring a **real in-flight draft they care about** (PRD/spec/decision doc), **not** a demo; aim for a spread of seniority/domain. No incentive needed beyond early access; if offered, keep it nominal and disclosed.
- [ ] **Privacy + consent:** their draft is confidential — run on a **paid key or local model**, never the free tier (audit #5). Get explicit consent that a **local, no-egress event log** is captured and that they will **manually send** it afterwards (this stays within the no-product-telemetry invariant — capture is local + user-initiated, not automatic).
- [ ] **Instrumented build:** give them a build with the harness event recorder writing the event stream to a **downloadable local JSON** at session end (no network). They download + send it with their draft's final state. (If a local build is impractical for a participant, fall back to reconstructing write-vs-paste from the debrief + their final doc — but prefer the event log.)

**The unmoderated session (~20–30 min):** a one-paragraph orientation (what the tool is, that it never edits their text, that it stays quiet while they draft) and then they work on their own draft, alone. No coaching, no task list.

**Debrief interview (~20 min), fixed question set** mapping to the three research questions:

- [ ] **Write-vs-paste (finding #4):** "Did you draft inside it, or paste something you'd already written? Why?" — corroborate against the event stream (incremental block edits vs a single large paste). _Paste-first collapses the product toward the one-shot audit it defines against._
- [ ] **Located-critique as respect-or-cold (OBS-010, finding #6):** walk them to one observation that flagged something without prescribing a fix and ask whether it felt **respectful / useful / cold / presumptuous**, and whether that depended on how finished the draft was (the maturity-severity hypothesis, R2).
- [ ] **Second-session return (retention):** "Would you open it again on your next draft? What would have to be true?" — the missing first-week-retention story.
- [ ] Also capture: which observations they **acted on / ignored / dismissed**, whether the feed felt calm or noisy, and whether they trusted the contradiction calls.

- [ ] **Output:** five session notes + a synthesis that explicitly marks each strategic open question (**free-tier**, **paste-vs-ambient**, **OBS-010/maturity-severity**) as _moved-toward-resolved_ or _still-open_, with the evidence. Land in `docs/snapshots/`. This is the cheapest falsification of the central bet; the polish and positioning items are better-aimed after it.

### V3 — Hero-miss instrumentation — ✅ shipped 2026-07-17 (audit #2) — design settled 2026-06-18

The observation log structurally can't see **misses** (the user never reports the contradiction the tool missed). V3 makes recall visible by reusing the ratchet's Tier-2 scorer against **V1's labeling sheet** (the Bucket-1/Bucket-2 ground truth).

**Recall harness (shipped):**

- [x] **Recall scorer.** _Already existed_ — `scoreCorpusRecall`/`stratifyRecall` in `src/services/evalScorer.ts` report per-bucket recall against `labels.csv`, consumed by the V1 runner (`evalV1Corpus.live.test.ts`). V3 reuses it unchanged.
- [x] **Prefilter A/B — quantify the Jaccard cost.** `scorePrefilterDrop` (`evalScorer.ts`) diffs the prefilter arm against an **all-pairs** arm and splits each bucket's miss into `dropCount` (labels only all-pairs catches → the SELECTION cost) and `adjudicationMissCount` (labels neither catches). The bypass seam is an additive `contradictionCandidates: "prefilter" | "all-pairs"` at the contradiction call site (`evaluator.ts` — same line OBS-038 rewrites; default byte-identical). The all-pairs arm reuses the prefilter arm's fast-tier recordings via **fill-gaps record** (`mock.ts`/`factory.ts`, default-off) so it only spends RPD on the differing contradiction calls. Unit tests: `evalScorer.prefilterDrop.test.ts` (drop logic) + `evaluator.prefilterBypass.test.ts` (default-path identity). **Fixed en route:** the evaluator's module-level revert-snapshot store survived `runner.setup()`, so a second arm silently restored the first's snapshot (drop stuck at 0); `setup()` now clears it.
- [x] **Dev/eval-only.** `EVAL_V1`-gated exactly like the rest of Tier 2 — CI stays offline and quota-free; corpus + labels + recordings stay in the gitignored `.v1-corpus/` (invariant #5); no telemetry, no egress.
- [x] **Output:** per-bucket recall + prefilter-drop count, regenerable offline from dumped fixtures. **Baseline (2026-07-17, current main, pre-OBS-038):** on a 3-PRD slice (paid `gemini-2.5-pro`), of 6 B1 labels the prefilter arm catches 2 (33%); of the 4 misses **1 is selection** (all-pairs recovers it) and **3 are adjudication** (all-pairs misses too). So the prefilter drop is real (the `40%`/`20%` metric pair) but adjudication, not selection, is the dominant miss cause on this slice — see `docs/snapshots/2026-07-06_v1_base_rate_corpus_study.md` § 4. n=3; firms up with the full-PRD run.

> **Dependency (met):** V3 consumes V1's verified `labels.csv`. The scorer + runner ship; the baseline used the current-main corpus at `#197`.

## The strategic open questions this work resolves

These are recorded in `docs/plan.md` → Discovered/unscheduled as `(open question)` entries; V1/V2/V3 are how they get answered (do **not** answer them by reasoning alone — that's the trap the audit names):

- **Free tier: real tier or demo?** (audit #3) — the binding free-tier constraint is ~20 RPD per Flash model and **0** for `gemini-2.5-pro`, and free-tier "strong" checks run on a weak model and emit confident false contradictions (the precise R4.4 failure). If BYO-key is effectively mandatory to meet the bar, that should be a stated decision in `docs/concept.md`/`docs/features.md`, not an emergent one. V1's free-vs-paid delta is the evidence.
- **Paste-first vs ambient-companion thesis** (audit #4) — if real usage is paste → read → leave, the settling/rhythm/lifecycle machinery services a loop users don't inhabit, and what remains is "LLM document reviewer with excellent span anchoring." V2 observes which loop users actually inhabit.
- **Does maturity-aware severity (R2) dissolve the OBS-010 discomfort?** (audit #6) — currently a good hypothesis promoted to a conclusion without a test. V2 is the test: correctly-timed, register-compliant critique on a mature draft, reported as respectful or cold.
- **Privacy honesty** (audit #5) — confidential PRDs are shipped to a provider that, on the free tier, may train on them. V1 makes this concrete (you'll be running others' confidential docs); it reinforces the privacy-section rewrite in `docs/architecture.md` and the case for pulling the local-model adapter earlier.

## Notes / non-goals

- **No product telemetry.** All of this is measured out-of-band (session notes, dev-only eval runs over a local corpus). The local-first/privacy invariant is not relaxed by this work.
- This file **schedules and frames** the validation; running the sessions and the study is the work itself. The deliverables are snapshots and session notes in `docs/snapshots/`, plus updates to the open questions above.

## Verification

This is research, not code, so "verification" is **did the evidence get produced and recorded**:

1. V1 produces a `docs/snapshots/` entry with the three numbers (hero base rate, per-type wild precision, free-vs-paid delta).
2. V2 produces five session notes + a synthesis that updates each strategic open question's status.
3. V3 produces a recall number for contradiction-at-distance on the labeled corpus and a prefilter-drop count — both reproducible from the eval harness.
