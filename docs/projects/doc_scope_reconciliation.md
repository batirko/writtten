---
status: done
phases: [4, 5]
summary: Repair document-scope observation reconciliation — replace type-bucketed positional supersession with best-match pairing + an absence grace period (Phase 4 correctness), then make re-evaluation resolution-aware and decide the harder reassessment forks (Phase 5).
---

# Document-scope reconciliation fidelity

> The block-level reconciliation engine was repaired in Phase 4 (R3 — span+text matching, prior-observation re-injection, `resolved_prior`). The **document-scope** path was not. It still does type-bucketed *positional* supersession, which manufactures false "superseded" links, flickers stable notes, and silently drops still-true critiques. This file captures the finding, an implementation plan for the high-value / low-ambiguity correctness fix, and the open decisions for the larger reassessment work.

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Status: `idea`** (written 2026-06-05). Surfaced while auditing a live Phase-4 dogfooding debug log (`gemini-2.5-pro [paid]`, 27 triggers / 9 calls / 10 archives, document = the §-by-§ paste of `docs/assets/phase1-test-text.md`). All 10 archives in that session came from a single `doc-idle` re-eval and were the trigger for this analysis.

This is **reconciliation/lifecycle-engine** work — client-side, no server/telemetry/egress (standing rule 5). It is the document-scope counterpart to already-shipped block-level work and should be read alongside:

- `docs/projects/quality_remediation_synthesis.md` — **R3** (block-level reconciliation repair, done — OBS-012/OBS-021) and **R3b** (archive trust: closure context + ghost anchors, Phase 5). T1c below directly feeds R3b.
- `docs/projects/evaluation_signal_quality.md` — **OBS-012**, the 0.6-Jaccard doc-level dedup that this work extends (and explains why it under-fires).
- `docs/projects/observation_taxonomy_and_priority.md` — the budget feed (`DEFAULT_FEED_BUDGET = 7`) that determines whether these doc-scope notes were ever *visible* when they churned.
- `docs/projects/message_generation_workflow.md` — the lifecycle contract (`auto_closed` / `dismissed` / `superseded`).

## The finding

### Current archivation mechanism

An observation is archived for one of four reasons (`src/model/logger.ts`):

1. **`superseded`** — a new observation of the same type takes its slot during reconciliation.
2. **`auto_closed`** — an existing observation has no counterpart in the new set (orphan).
3. **`resolved_prior`** — the model *explicitly* said the observation no longer applies.
4. **User action** — dismiss / collapse.

Reconciliation runs on every eval (regenerate → dedupe / supersede / auto-close / insert). There are **two** reconcilers:

- `reconcileObservations` (block/section-scoped, `src/services/evaluator.ts:184`) — matches on **content-sig, then span + text**. Robust.
- `reconcileDocumentObservations` (document-scoped, `src/services/evaluator.ts:287`) — matches on **type alone, positionally**. This is the broken one.

### The "still true?" call exists — but only at section level

The section-eval prompt appends the passage's prior observations and asks the model to return a `resolved_prior` array of indices that no longer apply (`src/services/evaluator.ts:609`, consumed at `:837`). Those become `resolved_prior` archives. **Document-scope observations (`missing_topic`, `underexposed_topic`, `structure_flow`, `audience_mismatch`) are never asked this question.** They are only ever positionally superseded or auto-closed against a blind regeneration.

### The bug: type-bucketed positional supersession

`reconcileDocumentObservations` dedupes a new observation against an existing one only on exact text **or > 0.6 Jaccard** similarity (the OBS-012 guard, `:306`). Anything below that falls through to:

```ts
// evaluator.ts:320 — "first unconsumed existing of the same type"
const supersedable = existing.find(
  (e) => e.type === newO.type && !matchedExistingIds.has(e.id)
);
```

It grabs the **first unmatched existing observation of the same type**, regardless of topic. Because assignment is greedy and order-dependent, the 0.6 dedupe only fires if the matching slot is *still free* when its new counterpart is processed — an earlier, unrelated new observation can consume it first.

### Three observable harms (from the 2026-06-05 session)

The first `doc-idle` produced 5 `missing_topic` / 3 `underexposed_topic` / 2 `structure_flow`. The second produced 5 / 3 / 3. All 10 of the first set were archived as `superseded`:

1. **False supersession links.** "Missing risks/social-engineering mitigations" was archived `supersededBy` a note about a missing problem statement — unrelated. `supersededBy` is not a semantic link within a type bucket; it is positional.
2. **Flicker of stable notes.** "Alternative solutions … not discussed" came back **byte-identical** yet was superseded + re-inserted with a new id instead of deduped — its slot was consumed first. "Rollout/launch plan" (Jaccard ≈ 0.64, *above* threshold) likewise churned. The engine built to stop flicker (`:156`) does not, for doc-scope.
3. **Silent drops of still-true critiques.** Run 2 stochastically omitted "risks", "business impact", "non-happy-path UX" — all still true of the document (the only edit between runs was adding an "Out of scope" section). They were archived as `superseded`, not resolved. Because per-type **counts stayed flat** (5/3/2 → 5/3/3), the loss is invisible in aggregate. Compounded by the budget feed: these low/medium-severity doc-scope notes were likely below the 7-group budget line, sitting collapsed in "also noticed," so the user may never have seen them before they were swapped.

### Edit → reassessment granularity (related gap)

When a user edits text linked to a note, there is **no span-aware / per-note reassessment**. `scheduleEval` dispatches a full **section-eval for the whole block** (`src/services/orchestrator.ts:393`); editing the exact noted sentence and editing an unrelated word in the same block take the identical path. TipTap decorations track the note's *position* through the edit but never re-judge its *truth*. Consequences:

- **Doc-scope notes ignore the edit entirely** until the next whole-doc `doc-idle` pass.
- **Cross-block notes go stale.** A contradiction note anchored to block A is not re-checked when an edit to block B resolves the conflict — only when A re-evals or a sweep runs.

The section-eval's `resolved_prior` is the only resolution intelligence, and it is coarse-grained (whole section), block-only.

## Phased Plan

| Phase | Contribution |
| ----- | ------------ |
| **4** | **Tier 1 — correctness, low-ambiguity, no new dependency, no extra API requests, fixture-testable.** Best-match doc-scope reconciliation + absence grace period + honest archive labels. Removes flicker, false-supersede links, and silent drops. Calm-feed/trust fix in the same family as R3. |
| **5** | **Tier 2 — decisions + larger build.** Resolution-aware regeneration (extend `resolved_prior` to doc level), and the reassessment forks (similarity metric, span-aware targeting, identity/text-drift, threshold tuning). Couples with R3b (archive trust) and R4 (doc-level anchoring). |

## Todo

### Phase 4 — Tier 1 (high-value, low-ambiguity) — shipped 2026-06-05

- [x] **T1a — Best-match doc-scope pairing.** Pure, injectable `planDocReconciliation` (`src/services/docReconcile.ts`): best-match assignment within each type bucket via the injected lexical similarity, greedy-by-descending-score, each side used once. Replaces the greedy `find`-first positional supersession. Similarity fn (D1) and floor (D6) are constructor params.
- [x] **T1b — Absence grace period (hysteresis).** `missCount` / `lastSeenAt` on `Observation` (`src/store/db.ts`, DB v7 migration); doc-scope orphans are bumped not closed until absent for `DOC_GRACE_THRESHOLD = 2` consecutive runs; a re-match resets the counter. Pure state, no extra LLM call.
- [x] **T1c — Honest archive labels.** Doc-scope no longer emits positional `superseded`; orphans close as `auto_closed` only after the grace period. `supersededBy` no longer carries false links into the debug log.
- [x] **T1d — Tests.** `src/services/docReconcile.test.ts` (6 pure invariant tests, asserting outcomes not scores) + `src/services/evaluator.test.ts` doc-scope grace block (first-miss survives, threshold closes, re-match resets, never-superseded).
- [x] **T1e — Mechanic doc.** `docs/mechanics/evaluation-triggers.md` updated with the doc-scope reconciliation + grace-period behaviour as built.

### Phase 5 — Tier 2 (decisions, then build)

- [x] **D2 build — Resolution-aware regeneration (Workstream A, shipped 2026-06-06).** Extended `resolved_prior` pattern to the doc-quality call: on paid tier, prior doc-scope obs listed with 0-based indices in the user prompt; model returns `priorId` on persisting items and `resolved_prior: [i…]` for addressed ones. Reconciler gained a three-pass structure: 0-pre (force-close resolved), persist (reset missCount, no new insert — kills accumulation), lexical fallback (Tier-1 path for unmapped + free tier). Tests: `reconcileDocumentObservations` opts tests (4 cases) + `evaluateDocument` routing tests (2 cases). `docs/mechanics/evaluation-triggers.md` updated.
- [x] Resolve Tier 2 decisions (2026-06-06) — see _Decisions (resolved)_ below.
- [x] **Extend resolution-awareness to the ledger sweep (Workstream B, shipped 2026-06-06).** `reconcileSweepContradictions` now accepts `paidKey` + `evalId`. On paid tier: authoritative-with-grace — sweep output is the conflict authority; re-emitted pairs reset `missCount`, absent pairs age via `DOC_GRACE_THRESHOLD=2` to `auto_closed`. Free tier unchanged (additive). Tests: stale pair first-miss survives, second miss closes, re-emitted resets, free tier additive. `docs/mechanics/evaluation-triggers.md` updated.
- [ ] **D3 — span-aware / targeted reassessment on edit:** deferred.

## Decisions (resolved 2026-06-06)

The Tier 2 forks are now decided. Summary, then detail per fork below.

| Fork | Decision |
| ---- | -------- |
| **D2 — direction** | **Adopt resolution-aware regeneration.** Model classifies persists / new / resolved in the existing call; lexical best-match + grace become the fallback, not the primary. |
| **D1 — similarity metric** | **Lexical stays as the fallback only** (no embeddings). D2 is the primary matcher; the 0.6 floor is fallback for the free tier and when D2 output is unparseable. |
| **Free-tier behaviour** | **Paid-only D2.** Resolution-aware classification runs only when a genuine reasoning model is present (paid key). Free tier keeps Tier-1 lexical best-match + grace. Mirrors the hedged-contradiction tier split. |
| **D5 — text on persist** | **Freeze original wording.** A persisted note keeps its existing text + id; the model's rephrase is discarded. No card mutation under the user. |
| **Scope** | **Include `strategic_tension` + `contradiction`.** Resolution-awareness extends to the ledger sweep, not just the four doc-scope types — so stale conflicts resolve when their claims change. |
| **D3 — span-aware on edit** | **Defer.** Collapses into global re-eval for doc-scope; cross-block staleness is largely addressed by the scope decision above. |
| **D4 — hysteresis policy** | **Keep N=2 consecutive.** Becomes D2's guardrail against false "resolved". |
| **D6 — threshold** | **Keep 0.6**, now fallback-matcher only. |

Detail per fork:

### D1 — Similarity metric

How to measure "same note." Fork:

| Option | Pros | Cons |
| ------ | ---- | ---- |
| **Lexical (current Jaccard)** | cheap, deterministic, fixture-testable, no dependency, local-first | misses paraphrase ("metrics before solution" vs "solution after metrics" share almost no words) |
| **Embeddings** | catches paraphrase | new model in router, latency, **non-deterministic** (fights fixtures + local-first) |
| **LLM-as-judge** | most accurate | non-deterministic, costs latency/quota, couples generation to reconciliation |

**Leaning:** stay lexical for Tier 1; revisit if paraphrase misses prove painful. **They now have** — see _Field evidence_ under D2. The lexical floor cannot catch the model rephrasing its own doc-scope points, so D2 (or semantic D1) is the real fix; the floor itself is **not** the knob to turn (lowering it re-introduces false merges of unrelated same-type notes).

### D2 — Adopt resolution-aware regeneration? (the "price")

Recommended "right thing." The price is **not** extra API requests — the binding free-tier constraint is **requests-per-day per model**, and this folds the resolution question into the *existing* single doc-quality call (the section-eval already proves this pattern at ~1s on the fast tier).

| Axis | Change |
| ---- | ------ |
| **# requests (RPD — binding limit)** | **none** — still one call per doc-idle |
| Input tokens | +small (append prior notes, a few hundred tokens) |
| Output tokens | +marginal (resolved/persists/new buckets) |
| Latency | +some (~15s → ~20s; additive, no extra round-trips) |
| **Reliability** | the real cost — harder task → false-"resolved" risk on weak models → absorbed by T1b hysteresis (free) |
| Code/tests | +moderate, one-time (bigger state machine, parsing, fixtures) |

The version to **avoid** is per-note "is this still true?" calls — that is N× requests per idle and would blow RPD.

#### Field evidence (2026-06-05 post-Tier-1 A/B) — the case for scheduling D2 sooner

Re-running the same §-by-§ paste of `phase1-test-text.md` on the shipped Tier-1 build (three `doc-idle` runs: `rEvK3D8U` → `tlfpPr7K` → `ey5Y9yqI`) confirmed Tier 1 works as designed **and** isolated D1 as the next bottleneck:

- **Tier 1 verified live.** All 10 archives were honest `auto_closed` with **no `supersededBy`** (vs. the pre-fix run's 10 false `superseded` links). The grace period demonstrably prevented a silent drop: the doc-idle-#1 set survived doc-idle #2 (a fully-reworded regeneration that re-emitted none of them → `missCount = 1`) and only closed at doc-idle #3 (`missCount = 2`). No single-run omission dropped a still-true note.
- **But lexical dedup misses the model's own paraphrases.** doc-idle #1 produced _"The plan for **incorporating** challenge outcome data **into** the fraud model **is undefined**."_; doc-idle #3 produced _"The plan for **using** challenge outcome data **to improve** the fraud model **is not detailed**."_ — plainly the same observation, Jaccard ≈ **0.53**, below the 0.6 floor. Tier 1 therefore aged out #1's card and inserted #3's as new.
- **Net behavioural shift: flat-but-lying → honest-but-accumulating.** With positional supersession gone, rephrasings no longer replace 1:1; they coexist until they age out. Steady state ≈ **2× the per-run set** during the grace window, populated with semantic duplicates of the same few points (missing rollout / risks / cost, UX underexposed…). The budget feed (top 7) masks most of it in "also noticed," so it's quiet — but it's the residue D1 was always going to leave.

**Conclusion:** Tier 1 traded the correctness/trust failures for a calm-feed cost that only D2 (model classifies persists/new/resolved, so "rollout plan" is recognised as the same point it raised last run) or a semantic D1 can remove. The grace period observed here becomes D2's guardrail against false "resolved." This is the motivating evidence to schedule **D2 next**.

### D3 — Span-aware / targeted reassessment on edit?

Do we add a path that reassesses the *specific* note whose linked text changed, vs. continue relying on whole-section / whole-doc re-eval? Fork: responsiveness vs cost + complexity. **Hard for doc-scope notes** — they have no anchor, so "update on edit" collapses back into "re-evaluate globally + reconcile" (i.e. Tier 1 already covers it). Cross-block contradiction staleness is the more concrete gap. **Lower priority; likely defer.**

### D4 — Hysteresis policy

Grace-period mechanism: N consecutive absent runs (simple) vs TTL (time-based) vs confidence decay (gradual). Pick one; start with N=2 consecutive and tune.

### D5 — Identity on text drift

When a matched note's text drifts but it is "the same note," do we keep the id and **update the card text under the user**, or freeze the original wording? UX call — silent rewrites can feel like the note changed out from under them.

### D6 — Threshold value

Wherever the "close enough to be the same note" floor sits, it dials stability ↔ staleness by hand. No objectively correct value; tune by watching real sessions. Too sticky → keeps notes whose wording no longer fits; too fresh → flicker.

## Open questions

- ~~Should `strategic_tension` / `contradiction` notes follow the doc-scope reconciler or get their own treatment?~~ **Resolved 2026-06-06: in scope for Tier 2.** They get resolution-awareness via the ledger sweep. Open sub-question for the plan: the sweep currently reconciles *additively and never auto-closes* — resolution must key off whether the conflicting **claim pair** still exists/conflicts, not text similarity, since these notes are claim-anchored, not prose-anchored.
- Does the grace period interact badly with genuine user edits that *do* resolve a doc-scope note (delayed "✓ addressed" by N runs)? D2 resolution-awareness would close a true-resolution faster than hysteresis-only.
