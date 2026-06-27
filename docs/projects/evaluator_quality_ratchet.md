---
status: done
kind: infra
phases: [4, 6]
summary: Labeled fixture corpus + two-tier scorer (deterministic replay + opt-in live precision/recall) wired into Vitest so evaluator recommendation accuracy can't silently regress as prompts change. (Machinery shipped in Phase 4; a Phase 6 follow-on tightens the bar per the 2026-06-10 audit.)
---

# Evaluator Quality Ratchet

## Status

> Canonical status lives in the frontmatter. Not yet started — planned for a dedicated session.

**Phase 4.** This is the last open item in Phase 4. Everything else (priority axes, budget feed, badging, aggregation, jargon allow-list, `strategic_tension`) has shipped. This is the ratchet that guards all of it.

---

## Phased Plan

| Phase     | Work                                                                                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4**     | Build the machinery: types, scorer, `runFixture` harness, Tier 1 deterministic Vitest suite, seed corpus (~6–8 labeled fixtures), Tier 2 opt-in live scorer, record helper.                                                                                                                                                                                                  |
| **6**     | **Tighten the bar (2026-06-10 due-diligence audit #7):** per-type precision floors that reflect the trust asymmetry (contradiction ≥ 0.95, nits looser) instead of one aggregate ≥ 0.7; a second-rater label pass so ground truth isn't solely prompt-author-authored; grow the corpus toward the 20–40-doc scale so a single flaky fixture can't swing the floor 14 points. |
| **5 / 6** | Grow the corpus (remediation sprint for OBS-001…005 adds regression cases); run SkillOpt against the prompts once the corpus is large enough (20–40 docs).                                                                                                                                                                                                                   |

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

- [ ] **Implement the tiered floors** in `evalRatchet.live.test.ts`: assert each type's precision against its tier floor (skip a type's assert when n=0 for it in the current corpus; log it). Keep an aggregate `recall ≥ 0.8` soft-assert. Calibrate the numbers up/down once V1 lands real per-type precision (the table is the policy; the constants are tunable).
- [ ] **Grow the corpus toward 20–40 cases — start now, augment via V1.** Begin immediately with hand-built fixtures (`npm run eval:record`) covering each tier's types, decoupled from V1's PRD sourcing, so n climbs toward statistical meaning _this_ phase; then reuse V1's real-PRD corpus where licensing allows to augment and de-bias it. (n≈7 → 20–40 is what gives the per-type floors statistical meaning; hand-built cases get there without blocking on V1.)
- [ ] **Second-rater labels — refine via V1.** The hand-built corpus starts with author labels (acceptable for a provisional gate); V1's **reconciled ground-truth labels** then replace author-only `expected` so the floors aren't solely prompt-author-authored. Independence is a V1 _refinement_, not a precondition for shipping the tiered gate.
- [ ] Note: the **design** above is complete and build-ready, and the gate ships with teeth this phase via hand-built corpus growth; V1 then _refines_ the two data-dependent dimensions (independent labels, real-PRD scale) rather than gating them. V3 supplies the complementary recall measurement that calibrates the Tier-A contradiction floor honestly.

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
