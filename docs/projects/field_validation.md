---
status: idea
phases: [5]
summary: The 2026-06-10 due-diligence audit's headline work — falsify (or confirm) the central bet with evidence from outside the founder's own head. A base-rate corpus study over real PRDs, structured sessions with external PMs on their own drafts, and instrumentation that can finally see the hero capability's *misses* (not just its false positives). Scheduled as a parallel track that does not gate the Phase 5 UX polish.
---

# Field validation — close the n=0 gap

> **Readiness target:** make the central bet falsifiable. The due-diligence audit (`docs/snapshots/2026-06-10_due_diligence_audit.md`) judged the product *"a research artifact and a craft project … one of the best-documented small codebases we've audited"* — but **a product with zero users and a five-phase plan that never schedules one.** Every field observation (OBS-001..023, both prior snapshots) is the founder pasting test docs at their own tool, tuned against the one person guaranteed to agree with it. This project puts the bet on a table where it can lose.

## Status

**Idea — Phase 5, parallel track.** Scheduled, but it **does not gate** the existing Phase 5 UX-polish milestones (visual style, onboarding, emotional register) — those proceed concurrently. The decision to run validation in parallel rather than as a hard gate is deliberate (2026-06-13); the audit argued for a gate, the project owner chose a parallel track so polish isn't blocked while evidence accrues. Every Phase 5 item is nonetheless better-aimed once V1/V2 produce data, so do these early in the phase.

Read alongside:

- `docs/snapshots/2026-06-10_due_diligence_audit.md` — the source findings (this file's V-IDs map to its numbered findings).
- `docs/product-requirements.md` (§3 — the silence/rhythm bet is "a bet, not a settled truth"; R4.4/R4.6 — the precision asymmetry and the load-bearing hero) — the theories this work tests.
- `docs/projects/prompt_quality_observations.md` (OBS-010) — the one register-discipline field datum, which *contradicts* the register; V2 is its falsification.
- `docs/projects/quality_remediation_synthesis.md` (R2 — severity ∝ maturity) — the hypothesis V2 confirms or kills.
- `docs/projects/observation_taxonomy_and_priority.md` (Milestone C) — the Phase-6 decision-rigor taxonomy whose research gate **is** V1 (pulled forward).
- `docs/projects/evaluator_quality_ratchet.md` — the corpus/scorer machinery V1 and V3 run on; the per-type-floor tightening (audit #7) is a new milestone there.

## Phased Plan

| Phase | Contributes |
| --- | --- |
| **5** | **V1** base-rate corpus study (un-planted true contradictions, per-type precision in the wild, free-vs-paid delta). **V2** five external-PM sessions on real drafts (write-vs-paste behavior; located-critique as respect-or-cold; second-session return). **V3** hero-miss instrumentation so recall — not just false positives — becomes visible. |
| **6** | Feeds the decision-rigor taxonomy expansion (its corpus gate is V1) and any retention/positioning decisions that survive contact with real users. |

## Why this, and why now

The audit names two FATAL findings, both downstream of n=0:

1. **The central bet is unfalsified.** The fidelity bar, the discomfort budget, the persona spec, the dismissal-learning taxonomy are all theories of *other people's* psychology, validated against the most philosophically bought-in user on Earth. *"Naming a risk in beautiful prose feels like handling it."*
2. **The hero capability has an unmeasured base rate, and the instrumentation is structurally blind to its failures.** Every recorded catch is of a *planted* contradiction (the Q2/Q3 fixture). No doc estimates how often a real PRD contains a genuine contradiction the author wouldn't self-catch. The observation log can only capture false *positives* — a user never reports the contradiction the tool *missed*. And the Jaccard top-10 lexical prefilter silently drops semantically-related-but-lexically-distant claim pairs ("Q2" vs "the second quarter") — eroding hero-recall in exactly the invisible way.

If the hero fires rarely and the daily experience is the noisy supporting cast (`clarity`/`undefined_jargon`/`unsupported_claim` — the most trust-eroding surface per the field log), the product has a first-week-retention shape the corpus never confronts. These are cheap to de-risk and currently scheduled *behind* the features they should inform.

## Todo

### V1 — Base-rate corpus study — 🟡 Med · 🧠 (audit #2, #7)

- [ ] Assemble 15–20 real PRDs (the founder's, colleagues' with permission, public post-mortems / spec write-ups). Treat as confidential where relevant — see the privacy caveat (this is exactly the free-tier-training concern; prefer a paid key or local model for others' docs).
- [ ] Run the existing pipeline over each (harness `loadDoc` / `loadMarkdown`, or the `runFixture` headless path). Hand-label the genuine logical contradictions per doc *first*, independent of the tool.
- [ ] Count and report: **un-planted true contradictions found** (hero base rate per document), **per-type precision in the wild**, and the **free-tier vs paid-tier delta** on the same corpus.
- [ ] Output: a snapshot in `docs/snapshots/` with the numbers and the implications for (a) the free-tier-real-or-demo decision, (b) the per-type ratchet floors, (c) whether contradiction-at-distance is frequent enough to be the hero. **This is the gate the Phase-6 decision-rigor taxonomy was already specified to wait behind** — it's pulled forward here.

### V2 — External-PM sessions (×5) — 🟠 Med · 🧠 (audit #1, #4, #6)

- [ ] Recruit five PMs outside the project. Each brings a **real in-flight draft they care about**, not a demo doc.
- [ ] Observe, don't coach. Record (session notes / harness event streams — no telemetry added to the product): **do they write in the editor or paste a finished draft?** (paste-first collapses the product toward the one-shot audit it defines against — finding #4). **Does located-critique-without-a-fix land as respect or as coldness on a mature draft?** (the OBS-010 hypothesis — finding #6). **Does anything bring them back for a second session?** (the missing first-week-retention story).
- [ ] Output: session notes + a synthesis that explicitly marks each of the strategic open questions (free-tier, paste-vs-ambient, OBS-010/maturity-severity) as moved-toward-resolved or still-open. This is the cheapest falsification of the central bet; every Phase 5 polish item is better-aimed after it.

### V3 — Hero-miss instrumentation — 🟠 Med–High · 🧠 (audit #2)

- [ ] Design a way to sample **misses**, not just false positives. The observation log structurally can't see misses (the user doesn't know what wasn't flagged). Candidate: a periodic strong-tier full-doc audit over the V1 corpus, scored against the hand-labeled contradiction set — i.e. reuse the ratchet's Tier-2 scorer to measure **recall** of contradiction-at-distance, not just precision.
- [ ] Quantify the prefilter's recall cost: run the contradiction check with and without the Jaccard top-10 prefilter on the corpus and report how many true pairs the lexical filter drops (the "Q2"/"second quarter" class). This is the trigger to revisit the LEANN semantic-prefilter `(deferred)` item in `docs/plan.md` → Discovered.
- [ ] Keep it dev/eval-only — this is measurement infrastructure, not a product feature, and must not add product telemetry or egress.

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
