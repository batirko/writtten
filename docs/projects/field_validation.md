---
status: idea
kind: research
phases: [6]
summary: The 2026-06-10 due-diligence audit's headline work — falsify (or confirm) the central bet with evidence from outside the founder's own head. A base-rate corpus study over real PRDs, structured sessions with external PMs on their own drafts, and instrumentation that can finally see the hero capability's *misses* (not just its false positives). Scheduled as a parallel track that does not gate the Phase 6 UX polish.
---

# Field validation — close the n=0 gap

> **Readiness target:** make the central bet falsifiable. The due-diligence audit (`docs/snapshots/2026-06-10_due_diligence_audit.md`) judged the product _"a research artifact and a craft project … one of the best-documented small codebases we've audited"_ — but **a product with zero users and a five-phase plan that never schedules one.** Every field observation (OBS-001..023, both prior snapshots) is the founder pasting test docs at their own tool, tuned against the one person guaranteed to agree with it. This project puts the bet on a table where it can lose.

## Status

**Idea — Phase 6, parallel track. Protocols settled 2026-06-18 (V1/V2/V3 all 🟢, ready to execute).** The run procedures, labeling rubric, session format, and instrumentation design are fully specified below; what remains is _running_ them (assembling the corpus, the five sessions, the recall harness build) — not further design. Scheduled, but it **does not gate** the existing Phase 6 UX-polish milestones (visual style, onboarding, emotional register) — those proceed concurrently. The decision to run validation in parallel rather than as a hard gate is deliberate (2026-06-13); the audit argued for a gate, the project owner chose a parallel track so polish isn't blocked while evidence accrues. Every Phase 6 item is nonetheless better-aimed once V1/V2 produce data, so do these early in the phase.

Read alongside:

- `docs/snapshots/2026-06-10_due_diligence_audit.md` — the source findings (this file's V-IDs map to its numbered findings).
- `docs/product-requirements.md` (§3 — the silence/rhythm bet is "a bet, not a settled truth"; R4.4/R4.6 — the precision asymmetry and the load-bearing hero) — the theories this work tests.
- `docs/logs/prompt_quality_observations.md` (OBS-010) — the one register-discipline field datum, which _contradicts_ the register; V2 is its falsification.
- `docs/projects/quality_remediation_synthesis.md` (R2 — severity ∝ maturity) — the hypothesis V2 confirms or kills.
- `docs/projects/observation_taxonomy_and_priority.md` (Milestone C) — the Phase-6 decision-rigor taxonomy whose research gate **is** V1 (pulled forward).
- `docs/projects/evaluator_quality_ratchet.md` — the corpus/scorer machinery V1 and V3 run on; the per-type-floor tightening (audit #7) is a new milestone there.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | **V1** base-rate corpus study (un-planted true contradictions, per-type precision in the wild, free-vs-paid delta). **V2** five external-PM sessions on real drafts (write-vs-paste behavior; located-critique as respect-or-cold; second-session return). **V3** hero-miss instrumentation so recall — not just false positives — becomes visible. |
| **7** | Feeds the decision-rigor taxonomy expansion (its corpus gate is V1) and any retention/positioning decisions that survive contact with real users.                                                                                                                                                                                                   |

## Why this, and why now

The audit names two FATAL findings, both downstream of n=0:

1. **The central bet is unfalsified.** The fidelity bar, the discomfort budget, the persona spec, the dismissal-learning taxonomy are all theories of _other people's_ psychology, validated against the most philosophically bought-in user on Earth. _"Naming a risk in beautiful prose feels like handling it."_
2. **The hero capability has an unmeasured base rate, and the instrumentation is structurally blind to its failures.** Every recorded catch is of a _planted_ contradiction (the Q2/Q3 fixture). No doc estimates how often a real PRD contains a genuine contradiction the author wouldn't self-catch. The observation log can only capture false _positives_ — a user never reports the contradiction the tool _missed_. And the Jaccard top-10 lexical prefilter silently drops semantically-related-but-lexically-distant claim pairs ("Q2" vs "the second quarter") — eroding hero-recall in exactly the invisible way.

If the hero fires rarely and the daily experience is the noisy supporting cast (`clarity`/`undefined_jargon`/`unsupported_claim` — the most trust-eroding surface per the field log), the product has a first-week-retention shape the corpus never confronts. These are cheap to de-risk and currently scheduled _behind_ the features they should inform.

## Todo

### V1 — Base-rate corpus study — 🟢 Med · 🧠 (audit #2, #7) — protocol settled 2026-06-18

> **Machinery landed 2026-07-06** (runner + scorers + labeling-sheet artifact — the run itself is the remaining work, tracked by the unticked boxes below). The headless corpus runner is `npm run eval:v1` (`src/services/evalV1Corpus.live.test.ts`, `EVAL_V1`-gated); the two-bucket recall / per-type wild-precision / free-vs-paid scorers are `scoreCorpusRecall` / `scoreWildPrecision` / `diffTierRuns` / `unlabeledContradictions` in `src/services/evalScorer.ts`; markdown→sections + fixture builder are in `src/services/eval-fixtures/corpus/`; the labeling-sheet format + parser + the "how to run it" walkthrough are in `src/services/eval-fixtures/corpus/labeling/` (see its `README.md`) and mirrored in `docs/snapshots/2026-07-06_v1_base_rate_corpus_study.md` (the durable home for the numbers). Corpus + filled labels + dumped recordings stay in a local, gitignored `.v1-corpus/` (invariant #5). Record once with `V1_RECORD=1`, then re-score offline for free. **Stratified 2026-07-06:** the corpus is bucketed by `docType` (`prd`/`spec`/`decision`/`comms`, one subfolder each) and every number is reported overall **and** per type (`stratifyRecall` / `stratifyWildPrecision`), so the hero base rate can be checked for whether it holds off its best-case doc type or collapses. A reproducible sourcing script (`fetch-corpus.sh`, public URLs only) assembled a 19-doc corpus (spec 10 / decision 4 / comms 3 / prd 2). **Caveat:** confidential PRDs aren't public, so `spec` uses open-source RFCs/design docs as a PROXY and `prd` uses PRD-shaped explainers — the base rate is "public-spec", not "confidential-PRD" (see the snapshot's validity caveat); the audit-#5 path stays open to add real PRDs on a paid key later.

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
- [ ] **Output:** a `docs/snapshots/` entry with the numbers and the implications for (a) the **free-tier-real-or-demo** decision, (b) the **per-type ratchet floors**, (c) whether contradiction-at-distance is **frequent enough to be the hero**. **This is the gate the Phase-6 decision-rigor taxonomy was already specified to wait behind** — pulled forward here. The labeling sheet is handed to **V3** (recall ground truth) and the **ratchet** (independent labels — see `evaluator_quality_ratchet.md` audit #7).

### V2 — External-PM sessions (×5) — 🟢 Med · 🧠 (audit #1, #4, #6) — protocol settled 2026-06-18

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

- [ ] **Output:** five session notes + a synthesis that explicitly marks each strategic open question (**free-tier**, **paste-vs-ambient**, **OBS-010/maturity-severity**) as _moved-toward-resolved_ or _still-open_, with the evidence. Land in `docs/snapshots/`. This is the cheapest falsification of the central bet; every Phase 6 polish item is better-aimed after it.

### V3 — Hero-miss instrumentation — 🟢 Med–High · 🧠 (audit #2) — design settled 2026-06-18

The observation log structurally can't see **misses** (the user never reports the contradiction the tool missed). V3 makes recall visible by reusing the ratchet's Tier-2 scorer against **V1's labeling sheet** (the Bucket-1/Bucket-2 ground truth).

**Recall harness (build-ready):**

- [ ] **Recall scorer.** Extend the Tier-2 live scorer (`evalRatchet.live.test.ts` machinery) to run each V1 corpus doc through the strong-tier full-doc contradiction/tension check and **match emissions to V1's labeled pairs** (match on span/claim overlap, not exact offsets — reuse the substring-label approach the fixtures already use). Report **recall = matched labels / total labels**, separately for **Bucket 1 (strict contradiction)** and **Bucket 2 (tension)** — the hero-recall number the product has never had.
- [ ] **Prefilter A/B — quantify the Jaccard cost.** Run the contradiction check twice per doc: **with** the Jaccard top-10 lexical prefilter and **with it disabled** (all-pairs). Diff the matched labels: the **prefilter-drop count** = true labeled pairs that only the no-prefilter run catches (the "Q2"/"the second quarter" class). This is the concrete trigger to revisit the **LEANN semantic-prefilter `(deferred)`** item (`docs/plan.md` → Discovered).
- [ ] **Dev/eval-only.** This is measurement infrastructure, not a product feature — gated behind the `EVAL_LIVE` flag like the rest of Tier 2; **no product telemetry or egress** (runs over the local corpus only).
- [ ] **Output:** a reproducible recall number (per bucket) for contradiction-at-distance + the prefilter-drop count, both regenerable from the eval harness over the V1 corpus.

> **Dependency:** V3 consumes V1's labeling sheet, so it runs **after** V1's hand-labeling (not after V1's full report). The scorer code can be built in parallel; it just needs the labels to produce numbers.

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
