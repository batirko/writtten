---
status: in-progress
kind: infra
phases: [4, 6, 8]
summary: Labeled fixture corpus + two-tier scorer (deterministic replay + opt-in live precision/recall) wired into Vitest so evaluator recommendation accuracy can't silently regress as prompts change. Machinery shipped in Phase 4; the tiered per-type floors shipped in Phase 6; Phase 8 grows the corpus toward statistical meaning, imports V1's second-rater ground truth, recalibrates the provisional floor constants against the wild-precision evidence, and runs the consolidated live-recording session the Phase-8 prompt/signal fixes all draw on.
---

# Evaluator Quality Ratchet

## Status

> Canonical status lives in the frontmatter (`in-progress`).

**Phases 4 + 6 shipped** (machinery: types, scorer, `runFixture`, Tier 1 + Tier 2 suites, record helper; then the tiered per-type precision floors, 2026-07-05). **Phase 8 remains** — § _Phase 8_ below, build-ready as of 2026-07-16: corpus growth (the corpus already stands at **~19 section-eval fixtures**, well past the seed ~7 this file's older sections describe), V1 second-rater label import, floor-constant recalibration rules, and the **one consolidated live-recording session** that this project and the other Phase-8 prompt/signal milestones share.

---

## Phased Plan

| Phase     | Work                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4**     | Build the machinery: types, scorer, `runFixture` harness, Tier 1 deterministic Vitest suite, seed corpus (~6–8 labeled fixtures), Tier 2 opt-in live scorer, record helper.                                                                                                                                                                                                  |
| **6**     | **Tighten the bar (2026-06-10 due-diligence audit #7):** per-type precision floors that reflect the trust asymmetry (contradiction ≥ 0.95, nits looser) instead of one aggregate ≥ 0.7; a second-rater label pass so ground truth isn't solely prompt-author-authored; grow the corpus toward the 20–40-doc scale so a single flaky fixture can't swing the floor 14 points. |
| **5 / 6** | Grow the corpus (remediation sprint for OBS-001…005 adds regression cases); run SkillOpt against the prompts once the corpus is large enough (20–40 docs).                                                                                                                                                                                                                   |
| **8**     | Corpus growth to close per-tier coverage gaps (incl. doc-level fixture support so `audience_mismatch` and the D-tier doc types stop being uncovered), the two-channel second-rater label protocol, pre-registered floor-recalibration rules against V1's wild-precision evidence, and the consolidated live-recording session (OBS-027 behavioural + OBS-031 message-fidelity fixtures — both resolved **record**, 2026-07-16). See § Phase 8.                                                                       |

---

## Todo

### Phase 4 — build the machinery

**Types + scorer (pure, no LLM)**

- [ ] `src/services/eval-fixtures/types.ts` — `EvalFixture` + `ExpectedObservation` interfaces (see §Design)
- [ ] `src/services/evalScorer.ts` — pure `scoreObservations(produced, expected) → ScoreResult` (tp/fp/fn, precision, recall)
- [ ] `src/services/evalScorer.test.ts` — scorer unit tests: perfect match, deliberate FP, deliberate FN, mix

**Harness**

- [ ] `src/services/eval-fixtures/runFixture.ts` — reusable headless mock-mode runner (extracted from `acceptance.phase1.test.ts`): mocks db + nanoid, `loadRecordings`, `setLlmMode("mock")`, runs sections in order via `evaluateSection`, returns collected observations
- [ ] Refactor `src/services/acceptance.phase1.test.ts` to use `runFixture.ts` (removes duplication)

**Seed corpus — `src/services/eval-fixtures/`**

- [ ] `contradiction-timeline.ts` — hard contradiction Q2 vs Q3 (port from phase1 fixture)
- [ ] `strategic-tension-fraud.ts` — tradeoff routes to `strategic_tension`, NOT `contradiction` (locks in OBS-004 fix)
- [ ] `clarity-vague.ts` — vague passage fires `clarity`
- [ ] `unsupported-vs-attributed.ts` — one genuine `unsupported_claim` + one attributed claim that must NOT fire (OBS-001 → `knownGaps`)
- [ ] `jargon-allowlist.ts` — domain term suppressed by allow-list + genuinely undefined term fires (OBS-003/005 → `knownGaps`)
- [ ] `aggregation-samespan.ts` — two checks on one span → grouped (guards aggregation end-to-end)
- [ ] `clean-doc.ts` — clean section → **zero** observations (false-positive guard)
- [ ] `index.ts` — barrel that exports the corpus array

**Negative-assertion fixtures (owned by `docs/projects/philosophy_guardrails.md`).** The corpus is also the regression gate for two philosophy guardrails — added there, asserted here: an **anti-taxonomy** fixture (a surface-flawed-but-substantively-clean doc that must produce **no** grammar/style/surface nit — G2/R4.3) and a **register** fixture/lint (no generated message prescribes a fix or asks a leading question — G3/R2.2–R2.3). These extend the corpus; the design lives in `philosophy_guardrails.md`.

**Tier 1 — deterministic regression suite**

- [ ] `src/services/evalRatchet.test.ts` — `it.each(corpus)`: run each fixture via `runFixture`, `scoreObservations`, assert `precision === 1 && recall === 1` (exact — deterministic → no stochastic tolerance needed)

**Tier 2 — opt-in live scorer**

- [ ] `src/services/evalRatchet.live.test.ts` — `describe.skipIf(!process.env.EVAL_LIVE)`: runs real prompts, accumulates per-type precision/recall, `console.table` scorecard, soft asserts aggregate floor (`recall ≥ 0.8`, `precision ≥ 0.7`); `knownGaps` reported as expected-misses (logged, not asserted)
- [ ] `src/services/eval-fixtures/record.ts` — node script: given a fixture id, runs sections in `record` mode, `dumpRecordings()`, writes recordings map back into the fixture file

**Scripts + docs**

- [ ] `package.json` — add `"eval:live": "EVAL_LIVE=1 vitest run evalRatchet.live"` and `"eval:record": "tsx src/services/eval-fixtures/record.ts"` scripts
- [ ] `docs/acceptance-testing/ratchet.md` — "How to add a fixture / run the ratchet" guide (record → label `expected` → Tier 1 green)
- [ ] `docs/plan.md` — tick **Evaluator quality ratchet** milestone; check Phase 4 complete
- [ ] `docs/projects/ai_tooling_integration.md` — check off "labeled eval test set" + "wire into Vitest" Phase 4 todos; note SkillOpt now unblocked

### Phase 6 — tighten the bar (2026-06-10 due-diligence audit #7) — 🟢 Med · 🧠 (design settled 2026-06-18)

The machinery shipped, but the _floor it guards_ is below the prose bar: R4.4 implies an effective precision near 1.0 for high-severity types ("one 'contradiction' that isn't one and the user discounts the entire feed"), while the live floor is one aggregate `precision ≥ 0.7` over ~6–8 fixtures — which permits the feed to be 30% wrong and still pass, and gives n≈7 no statistical meaning (a single flaky fixture swings it ~14 points).

**Decision (2026-06-18, interactive; sequencing refined 2026-06-27):** replace the single aggregate assert with a **four-tier per-type floor table** keyed to trust cost (a false `contradiction` discounts the whole feed; a false soft-opportunity is mild). Floors are **provisional** — the _tiering and code shape_ ship now; the constants get recalibrated against the real-PRD per-type precision numbers V1 produces. **Corpus growth is decoupled from V1 (2026-06-27 decision):** start growing the fixture corpus **now** with hand-built cases (`npm run eval:record`) toward statistical meaningfulness, rather than waiting on V1's PRD-sourcing — so the gate has teeth _this_ phase. V1 then _refines_ it: independent second-rater labels + real-PRD material recalibrate the floors and replace author-only ground truth. The unblock no longer waits on V1; V1 sharpens an already-meaningful gate. Rationale: a per-type floor over n≈7 is statistically hollow regardless of the number, so corpus size — not the constant — is the binding fix, and hand-built fixtures reach it without the PRD-sourcing dependency.

**Per-type precision floors** (in `evalRatchet.live.test.ts` — replace the lone aggregate assert):

| Tier  | Floor (provisional) | Types                                                                        | Why                                                                                                                                                                                    |
| ----- | ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **≥ 0.95**          | `contradiction`                                                              | The hero capability; one false positive discounts the entire feed (R4.4). Highest trust cost.                                                                                          |
| **B** | **≥ 0.85**          | `unsupported_claim`, `audience_mismatch`                                     | Assertive `problem`-kind claims _about the user's content_; a false one is costly but not feed-discrediting.                                                                           |
| **C** | **≥ 0.80**          | `clarity`, `undefined_jargon`                                                | Span nits; false positives are mild and easily ignored. `clarity` held at the higher end of this tier because it's the G2 "laundering slot" the anti-taxonomy doesn't otherwise cover. |
| **D** | **≥ 0.70**          | `missing_topic`, `underexposed_topic`, `structure_flow`, `strategic_tension` | Soft `opportunity`-kind suggestions in a gentle, "never cried wolf" register; tolerating more false positives is acceptable.                                                           |

- [x] **Implement the tiered floors** — shipped 2026-07-05. The policy lives in `evalScorer.ts` as `PRECISION_FLOORS` (`Record<Observation["type"], number>` — exhaustive, so a new observation type can't be added without assigning a floor) + `precisionFloorForType()` + `AGGREGATE_RECALL_FLOOR` (0.8). `evalRatchet.live.test.ts` replaces the lone aggregate-precision assert with a per-type loop: each type is asserted against its tier floor **only when it has predictions** (tp+fp>0) in the corpus; uncovered types are logged (`⚠️ No corpus coverage`) and skipped so the gate never silently passes a type it never exercised. Aggregate `recall ≥ 0.8` soft-assert retained; the scorecard prints n/precision/floor/status per type. CI-safe unit tests in `evalScorer.test.ts` cover the tier lookup (exhaustiveness + tier ordering). The constants remain provisional — recalibrated once V1 lands real per-type precision (the table is the policy; the numbers are tunable).
- [x] ~~Grow the corpus / second-rater labels~~ — **moved to § Phase 8 below (2026-07-16)**, now build-ready with the concrete gap list, label protocol, and recalibration rules. (Organic growth already carried the corpus from the seed ~7 to ~19 fixtures through the Phase-6/7 signal-quality PRs.)

### Phase 8 — corpus growth, V1 recalibration, and the consolidated recording session (build-ready 2026-07-16)

**1. Corpus growth — close the coverage gaps, not just raise n.** Inventory 2026-07-16: **19 section-eval fixtures**, but coverage is uneven against the floor table:

| Tier | Covered today | Gap to close (Phase-8 fixtures) |
| ---- | ------------- | -------------------------------- |
| A `contradiction` | timeline · intra-section · sweep-fidelity | `contradiction-sla-family` (OBS-038 triplet) · `contradiction-short-paste` (UX-016) |
| B `unsupported_claim` | vs-attributed · success-metric · opinion/rhetorical-apprehension | — (well covered) |
| B `audience_mismatch` | **zero** — doc-level type, `runFixture` drives `evaluateSection` only | see item 2 |
| C `clarity` | 5 fixtures | — |
| C `undefined_jargon` | jargon-allowlist | `jargon-audience-inferred` (re-record `jargon-allowlist` with it — the audience-relative prompt genuinely changes its expected behavior) |
| D `strategic_tension` | strategic-tension-fraud | `reconciled-tension` + `rhetoric-extraction` (OBS-037) |
| D `missing_topic` / `underexposed_topic` / `structure_flow` | **zero** (doc-level) | see item 2 |

**2. Doc-level fixture support — extend `runFixture` with an optional doc-pass step.** The B-tier `audience_mismatch` floor (≥0.85) currently guards nothing — an uncovered type is logged and skipped. `evaluateDocument` is deterministic given its sorted inputs (that's what the `docStateHash` design bought), so mock replay works; add `docPass?: boolean` to the fixture shape, run `evaluateDocument` after the sections, collect doc-scope observations into the same score. Two seed doc-level fixtures: an `audience-mismatch` discrimination case (stated exec audience + deep implementation jargon → fires; same content with an engineering audience → doesn't) and a `missing-topic` case on a `prd_spec`-staged doc. D-tier types then gain coverage for free from the same fixtures.

**3. Second-rater labels — two channels, resolved 2026-07-16.** V1's corpus is confidential-source and gitignored, so its docs can never become committed fixtures. Independence therefore arrives two ways: **(i)** committed fixtures get a lightweight second-rater pass — AI-drafted adjudication reviewed by a human who is not the fixture's author where possible, recorded per-fixture as a `secondRated` note (mirrors V1's `verified=true` discipline: a draft never masquerades as ground truth); **(ii)** the *wild* per-type precision numbers come from `npm run eval:v1` against V1's human-verified `labels.csv` — the reconciled ground truth stays in `.v1-corpus/`, and the ratchet references its snapshot numbers rather than embedding the material.

**4. Floor-constant recalibration — pre-registered decision rules** (so the recalibration can't quietly become goal-post moving):

- **Tier A never drops.** The 0.95 contradiction floor is trust-derived (R4.4), not performance-derived. V1 Run 1's 15% wild precision is a *pipeline defect signal* — the gate is **supposed** to fail until OBS-038/OBS-030/the prompt-discipline fixes land; lowering the floor to meet the pipeline would invert the ratchet's purpose.
- **Re-tier a type only on felt-trust-cost evidence**, i.e. V1/V2 showing its false positives are experienced more (or less) severely than the tier assumed — not merely because observed precision sits above/below the current constant.
- **Post-fix re-measure:** after the Phase-8 signal fixes land, re-run `eval:v1` (the runner is resumable via `V1_RESUME`; extend past the 9-doc subset toward the full 28) and record the per-type wild numbers next to the floors in the scorecard. That comparison — wild vs floor, before/after — is the recalibration artifact; constants change only per the two rules above, with the change and its evidence logged here.

**5. The consolidated live-recording session (the "merged decide-items" plan milestone — decisions made 2026-07-16: record, both).** The OBS-027 prompt-assembly guard proves the *input* reaches the model; V1 proved behavior is where precision lives — so both deferred "decide: record or accept the existing guard" items resolve to **record**:

- **OBS-027 behavioural discrimination (4 fixtures):** `cross-section-reference-resolved` (a term/reference defined in a sibling section must **not** flag in the referencing section) · `out-of-scope-heading-intent` (an item under "Out of scope"/"Non-goals" must not flag as ambiguity/gap) · `cross-section-genuine-gap` (a reference **no** sibling resolves must **still** flag — the recall guard) · `loose-topical-overlap` (a sibling that merely mentions the topic without defining the term must **not** suppress the flag).
- **OBS-031 message fidelity (1 fixture):** `contradiction-sweep-paraphrase` — a sweep pair built to invite paraphrase drift (a stated metric *threshold* vs a separate commitment); assert the recorded message quotes/restates the claim's own words (the existing label-leak lint plus a substring assertion on the threshold's wording) — deterministic-replay can't prove a model-output property, so this is the one guard that must be live-recorded.

**Procedure & budget** (also the template for the per-PR fixtures in the table above, which record inside their own PRs since they capture *changed*-prompt behavior): author `sections` + `expected` → `npm run eval:record -- <id>` with keys sourced from `.env.test.local` (record at the **free tier** — the tier keyless users actually run, and the convention the existing corpus follows; never echo key values) → verify Tier 1 green → `EVAL_LIVE=1 npm run eval:live` scorecard. Cost: 5 fixtures ≈ 10–12 fast + ~3 strong calls — inside one day's free-tier RPD with the rotation pools; check `getApiStats()` before starting.

---

## Design

### Why two tiers

The evaluator is half deterministic (anchoring, reconciliation, dedup, priority, aggregation, contradiction/tension routing) and half stochastic (the LLM call). A replay suite that freezes LLM output guards the deterministic half perfectly and runs free in CI — but by construction cannot catch _prompt_ regressions. Catching those needs the real model. The two tiers share one corpus and one scorer, and compose cleanly:

- **Tier 1 — deterministic replay** (`npm test`, quota-free, CI-safe): replays recorded LLM responses → asserts exact pipeline output. Catches breakage in anchoring, reconciliation, aggregation, priority, routing.
- **Tier 2 — live scorer** (`EVAL_LIVE=1 npm run eval:live`, needs `VITE_GEMINI_API_KEY`): runs real prompts → precision/recall scorecard. Catches prompt regressions. Feeds SkillOpt later.

### Fixture format

```ts
// src/services/eval-fixtures/types.ts
import type { Observation } from "../../store/db";

export interface ExpectedObservation {
  type: Observation["type"];
  sectionId?: string; // omit for doc-scoped
  substring?: string; // label by literal text, not brittle offsets
  note?: string; // why this is ground truth
}

export interface EvalFixture {
  id: string;
  description: string;
  stage?: string;
  jargonAllowlist?: string[];
  sections: { id: string; text: string }[]; // ordered — ledger accumulates
  recordings: Record<string, string>; // reqHash → response (Tier 1)
  expected: ExpectedObservation[]; // ground truth (both tiers)
  knownGaps?: ExpectedObservation[]; // known misses/FPs; tracked not asserted
}
```

### Scorer match rule

An `ExpectedObservation` matches a produced `Observation` iff:

- `expected.type === produced.type`
- AND if `expected.sectionId` is set: `produced.blockId === expected.sectionId`
- AND if `expected.substring` is set: `produced.text` contains `expected.substring` (case-insensitive) OR the anchored `substring` is contained in the block text at the produced span (substring match, not offset comparison — offsets are too brittle as a ground-truth label)
- Doc-scoped (`expected.sectionId` absent): type match only

Each produced/expected observation used at most once (greedy left-to-right).

### Scorer output

```ts
export interface ScoreResult {
  fixture: string;
  truePositives: Array<{ expected: ExpectedObservation; produced: Observation }>;
  falsePositives: Observation[];
  falseNegatives: ExpectedObservation[];
  precision: number; // tp / (tp + fp); NaN if no predictions
  recall: number; // tp / (tp + fn); NaN if no expected
}
```

### Harness: `runFixture.ts`

Extracted from `acceptance.phase1.test.ts`. Provides a `runFixtureMockMode(fixture: EvalFixture): Promise<Observation[]>` that:

1. Mocks `../store/db` with an in-memory claim + observation store (same pattern as `acceptance.phase1.test.ts`)
2. Mocks `nanoid` to stable ids
3. `loadRecordings(fixture.recordings)`; `setLlmMode("mock")`
4. Runs `fixture.sections` in order via `evaluateSection(docId, sec.id, sec.text, [{blockId: sec.id, text: sec.text}], fixture.stage, "mock-key", undefined, fixture.jargonAllowlist)`
5. Collects `saveObservation` calls; returns active observations (excludes auto_closed/superseded)
6. Resets mock mode to `"live"` in cleanup

**Determinism of contradiction/tension in mock mode** — this works because `evaluator.ts` already sorts claims to stable text-alphabetic order before building the contradiction prompt, making the strong-call hash stable across runs regardless of IndexedDB auto-increment ids. `acceptance.phase1.test.ts` proves this.

### Record helper: `record.ts`

A TSX node script (`tsx` / `ts-node`) run as `npm run eval:record -- <fixtureId>`:

1. Imports fixture from `src/services/eval-fixtures/<fixtureId>.ts`
2. Sets `setLlmMode("record")`; runs sections via `evaluateSection` with a real API key from env
3. Calls `dumpRecordings()` and writes the result back into the fixture file's `recordings` field (via a simple string replace or `fs.writeFileSync` with JSON stringify of the updated fixture)

This makes adding a new fixture painless: author `sections` + `expected`, run `eval:record`, commit the populated `recordings`. No manual hash derivation from mock-miss warnings.

---

## Reuse — key existing code

| What                     | Where                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Record/replay LLM mock   | `src/model/mock.ts` — `setLlmMode`, `loadRecordings`, `dumpRecordings`, `reqHash`                                             |
| Factory intercept point  | `src/model/factory.ts` — `wrap()` calls `replayResponse` in mock mode                                                         |
| Headless harness pattern | `src/services/acceptance.phase1.test.ts` — in-memory db + claim accumulator; extract to `runFixture.ts`                       |
| Evaluator entry point    | `src/services/evaluator.ts` — `evaluateSection(docId, sectionId, text, members, stage?, apiKey?, paidKey?, jargonAllowlist?)` |
| Existing fixture shape   | `docs/acceptance-testing/fixtures/phase1-contradiction.json` — recordings map format                                          |

---

## Verification

1. `npx tsc --noEmit` — clean
2. `npm test` — full suite green; Tier 1 `evalRatchet.test.ts` shows N fixtures with exact precision/recall=1; Tier 2 reported as skipped
3. `npm run lint`
4. **Scorer sanity** — `evalScorer.test.ts` feeds a deliberate FP and a miss; confirms precision/recall math and FP/FN lists are correct
5. **Regression-guard proof** — temporarily break a deterministic path (e.g. flip the tension `kind` to `"problem"`) and confirm Tier 1 goes red; revert
6. **Record-helper proof** — delete one fixture's `recordings`, run `npm run eval:record -- <id>`, confirm Tier 1 goes green again
7. **Live tier smoke** (`EVAL_LIVE=1`, needs key) — scorecard prints; `clean-doc` yields zero FPs; `strategic-tension-fraud` fires a tension not a contradiction on the real model

---

## Commit plan

1. `test(eval): scorer + deterministic quality-ratchet harness (Tier 1)` — types, scorer, `runFixture`, `evalRatchet.test`, seed corpus, `acceptance.phase1` refactor
2. `test(eval): opt-in live prompt-quality scorer + record helper (Tier 2)` — live suite, record script, package scripts
3. `docs: close Phase 4 — evaluator quality ratchet` — `plan.md`, `ai_tooling_integration.md`, `acceptance-testing/ratchet.md`
