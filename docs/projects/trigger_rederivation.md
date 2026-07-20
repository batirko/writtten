---
status: in-progress
kind: quality
phases: [8]
summary: Verdict on the owner's "time-based triggers are dumb" hunch (2026-07-13) plus the re-derivation it earns. Finding — the timers are state-gated conjunctions, and the pause half detects *attention*, which manipulation events definitionally can't; the real defect is the doc pass's ~zero materiality floor (any text change in any section re-earns a strong-tier call). Tier 1 — a materiality floor on doc-pass arming. Tier 2 — arm off section-eval completion (state edges), demoting idle to the attention boundary. The 3s section pause stays.
---

# Evaluation-trigger re-derivation — materiality floor + state-edge arming (R3.3)

> Written 2026-07-13 from an owner-prompted research session ("I am starting to think that the time-based evaluation trigger mechanism is dumb… all the triggers should be only around text manipulation and/or text state; the doc-level strong evals should come from the conditions of enough text/structure/definition met"). This file is both the **assessment** (is the hunch grounded?) and the **design** for what replaces the weak part. The behavioural ground truth it audits is `docs/mechanics/evaluation-triggers.md`.

## Status

**In-progress — Phase 8.** Research done 2026-07-13; design settled at the tier level 2026-07-13; **Tier 1 build spec settled 2026-07-16** (§ _Tier 1 — build spec_ below: snapshot persistence, all five clauses made concrete, provisional constants `SUMMARY_DELTA_FLOOR = 2` / `SUBFLOOR_FLUSH_STREAK = 4`, the summary-**content** proxy adopted). **Tier 1 shipped 2026-07-17** — `src/services/docPassMateriality.ts` (pure classifier + snapshot serde) + the floor wired into `evaluateDocument` behind the `docStateHash` check, snapshot under `${docId}::floor` (no schema bump); unit + `evaluateDocument`-integration tests green (`docPassMateriality.test.ts`, `evaluator.test.ts`); `docs/mechanics/evaluation-triggers.md` updated. Remaining in this project: closure-latency measurement, V1 constant recalibration, and the **Tier 2 decide-with-owner** item (state-edge arming). Scheduled into Phase 8 because the materiality floor directly protects the binding free-tier RPD budget V1's keyed runs will also draw on, and because V1's corpus evidence (which doc-pass re-runs actually change output) is the right calibration input for the floor constants.

Read alongside:

- `docs/mechanics/evaluation-triggers.md` — the audited mechanism; **must be updated in the same task as any build here.**
- `docs/product-requirements.md` R3.1–R3.5 — the fidelity bar this work serves; R3.3 is the load-bearing line ("real cognitive signals … not a dumb timer" — note **pause length is on the "real signals" list**).
- `docs/logs/ux_quality_observations.md` UX-013 (over-reliance on the pause timer; fixed by adding the event trigger), UX-014 (revert-awareness needs hysteresis), UX-016/UX-018 (state gates silencing high-value early feedback).
- `docs/projects/revert_aware_evaluation.md` — why an event-only pipeline is wrong by construction (transients).
- `docs/projects/doc_scope_reconciliation.md` — the grace/missCount machinery whose closure latency bounds how rare doc passes may become.
- `docs/projects/field_validation.md` (V1) — the evidence source for floor calibration.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **8** | Tier 1 (materiality floor on doc-pass arming) built + verified; Tier 2 (state-edge arming, idle demoted to attention boundary) decided against V1 evidence and built if it earns it. Tier 3 (compute/deliver decoupling) stays out of scope — parked below as deferred. |

## Todo

### Phase 8

- [x] **Tier 1 — materiality floor (shipped 2026-07-17).** `src/services/docPassMateriality.ts` (pure module: `DocPassSnapshot` + `isMaterialDelta` five-clause classifier + `buildCandidateSnapshot` + serde) + the floor check wired into `evaluateDocument` directly after the existing `docStateHash` dirty check; snapshot persisted as JSON under the existing string-KV doc-eval-state store (`${docId}::floor` key — **no DB schema bump**; cleared alongside `${docId}` / `${docId}::sweep`). Constants provisional: `SUMMARY_DELTA_FLOOR = 2`, `SUBFLOOR_FLUSH_STREAK = 4`. Suppressed passes emit a harness `settle` `{ trigger: "doc-idle-subfloor", reasons }`.
- [ ] **Verify closure latency.** Doc-scope grace (`missCount` / `DOC_GRACE_THRESHOLD = 2`) closes stale cards only when doc passes run; with the flush streak at 4, the worst-case added delay is 4 sub-floor idle cycles per grace beat — measure it in a scripted browser session (`getApiStats()` before/after for the RPD saving; observe one stale doc-scope card's `auto_closed` latency) and record the numbers here.
- [ ] **Tests** — `evaluator.test.ts` (the floor lives in `evaluateDocument`, not the orchestrator): one case per clause (claim delta fires · structure delta fires · maturity edge fires · stage change fires · K=2 summaries fire) + reword-only-single-summary is sub-floor (**no model call**) + streak flush runs the pass on the 4th sub-floor dirty idle + a fresh snapshot (streak 0) is written on every executed pass + legacy no-snapshot state runs the pass.
- [ ] **Recalibrate constants via V1** — once the fuller V1 run lands, check which recorded doc-pass re-runs actually changed doc-level output and tune `SUMMARY_DELTA_FLOOR` / `SUBFLOOR_FLUSH_STREAK` against that evidence (they ship provisional, like the maturity thresholds did).
- [ ] **Tier 2 decision — state-edge arming.** Decide (with the owner) whether to move arming from the raw 12s timer to section-eval-completion edges (the event that actually changes the pass's inputs), with idle demoted to the attention-boundary conjunct that *fires* an armed pass. Includes the maturity-edge case: crossing unformed→forming *arms* the first doc pass immediately instead of waiting to be noticed by a later idle window. Explicitly **not** part of the Tier-1 build; take it up only after Tier 1 has soaked and V1's fuller run is in.
- [ ] **Optional tuning:** lengthen `EVAL_DEBOUNCE_MS` (3s → ~6s) now that `block-settle-completion` covers the responsive path — cuts the per-sentence eval cost for slow deliberate writers. Dogfood before committing; do not change without checking UX-013's original latency complaint stays fixed.
- [ ] **Update `docs/mechanics/evaluation-triggers.md`** in the same PR as any of the above.

## The question

Should evaluation triggers be **only** text-manipulation / text-state events, with doc-level strong evals derived from "enough text/structure/definition" conditions — eliminating the time-based triggers (the 3s typing-pause settle and the 12s doc-idle)?

## Trigger inventory (audited 2026-07-13)

Eight triggers; six are already pure manipulation events (Enter-completion, cursor departure, bulk paste, import, stage change, block removal). The two time-based ones are both **conjunctions with text-state gates**, not bare clocks:

- **3s pause settle** — dispatches only on terminal punctuation ∧ ≥15 chars (`EVAL_DEBOUNCE_MS`, `Editor.tsx:42`).
- **12s doc-idle** — reaches the model only if maturity ≠ unformed ∧ the doc-state hash changed since the last pass (`DOC_IDLE_MS`, `Editor.tsx:44`; `docStateHash` dirty check, `evaluator.ts:838–845`). An idle firing on an unchanged doc is a free no-op.

So the state conditions the hunch asks for **already exist**; the timers are the scheduler on top of them.

## Grounding — where the hunch is right

1. **It is the PRD's own requirement.** R3.3: "Timing uses real cognitive signals (pause, paragraph completion, return-to-passage, explicit done) **not a dumb timer**." The "Good enough" tier demands timing correlate with cognitive state. The hunch is codified product philosophy — but note the PRD lists **pause length as a real signal**, alongside the event signals. Its position is not "no time"; it's "time uncorrelated with cognitive state is dumb."
2. **Field evidence agrees on direction.** UX-013: in a real session the 3s pause was the *only* trigger that ever fired — the system over-relied on the timer; the fix (2026-07-02) added the event-based Enter-completion trigger. The trajectory already runs toward events.
3. **The state gates need to be smarter, exactly as the hunch frames it.** UX-016/UX-018: the word-count/maturity gates silenced the highest-value early feedback. "Conditions of enough text/structure/definition met" is the right shape for the doc-level arming condition — and half of it shipped as the maturity proxy (R2/UX-013).

And one cautionary datum on the other side: **window-blur — an event trigger — was removed** (OBS-014/OBS-020) for firing at cognitively wrong moments and burning 4–6 paid calls per paste. Event-based is not intrinsically better; what matters is whether the signal correlates with "the author stepped back from this text."

## The reframe — the timer detects attention, not text

Manipulation events tell the system **what** to evaluate. Only silence tells it **when the user can hear the answer** — and silence is definitionally unobservable through change events; its entire content is their absence.

Deleting pause detection breaks the most common reflective posture: write a sentence, stop, stare. Under an event-only regime that text is evaluated on the user's *next* manipulation — feedback about the previous thought arriving exactly as the next one starts, the worst delivery moment. It also inverts the product's attention economics: the pause is when the user has attentional slack to read the feed at all. The HCI interruption literature (Iqbal & Bailey's "moments of opportunity" line: interruptions at subtask boundaries cost a fraction of mid-task ones) backs the pause-after-terminal-punctuation as the cheapest reliable boundary detector available. Invariant #4 ("quiet while generating, opinionated while revising") is *implemented by* that timer.

**The optimal trigger for anything user-facing is therefore a conjunction: material state change (events/edges) ∧ attention boundary (pause, or an explicit done-gesture).** Doc-idle already has this shape — dirty-hash ∧ 12s silence. Its defect is elsewhere:

## The defect — doc-idle's materiality floor is ~zero

The doc pass's inputs are block summaries + claim ledger + stage. But `docStateHash` includes every summary's **text hash**, so *any* text change in *any* section re-arms a strong-tier call. A contemplative writer's loop — type a sentence → 3s → section eval rewrites that summary's hash → 9 more seconds of thinking → doc-level strong call — burns roughly **one strong call per long pause**, even when the delta (a reworded sentence) cannot change a `missing_topic` / `structure_flow` conclusion. Against the binding free-tier budget (~20 RPD per model, `gemini-2.5-pro` = 0) this is the pipeline's largest unforced cost leak.

Secondary defect: the state conditions are **level-gates** (checked whenever the timer happens to fire), not **edges** (events when crossed). The moment a doc crosses unformed→forming is precisely when the first doc pass is earned; today that waits for the next idle window to notice. (A pure maturity-edge trigger would fire mid-burst, violating the attention half — edges must *arm*, the boundary must *fire*.)

## Design — three tiers

**Tier 1 (build): materiality floor on doc-pass arming.** Keep the idle boundary; replace "any hash change" with a delta classifier over the inputs the hash already covers. Strong call runs iff:

- a claim was added / changed / orphaned since the last pass, **or**
- section count / heading structure changed, **or**
- the maturity level crossed (unformed→forming→mature), **or**
- the stage changed (exists today as `stage-changed`), **or**
- ≥K summaries changed (K TBD, desk-default 2–3).

Sub-threshold deltas **accumulate** rather than vanish — a run of small edits eventually meets the floor. This is a change to the arming logic around `evaluateDocument`'s existing dirty check, not to the evaluator; the hash machinery stays (it remains the replay/dirty identity).

**Tier 2 (decide, then build if earned): state edges as the carrier.** The doc pass's true upstream event is **section-eval completion** — the only thing that changes its inputs (plus stage change / block removal). Arm on those edges when the Tier-1 floor is met; *fire* at the next attention boundary (idle settle, or a strong boundary event: large cursor jump, export, return-to-top). Time stops being the trigger and becomes the boundary detector — R3.3's "Good enough" tier, literally. Maturity crossings become arming edges, so a doc that just earned its first pass gets it at the next pause instead of an arbitrary later one.

**Keep untouched:** the 3s section pause (R3.3-sanctioned, state-gated, irreplaceable — it detects the reflective stop) and the section-boundary commit debounce (revert-awareness is intrinsically "wait to see if the change sticks"; an event-only pipeline evaluates every transient — UX-014's whole lesson).

## Tier 1 — build spec (settled 2026-07-16)

The floor is a **second, semantic dirty-check layered behind the existing hash dirty-check**, not a replacement. The hash check stays byte-exact (it is the replay/mock identity and the free "nothing changed at all" short-circuit); the floor only engages when the hash says *something* changed and asks *whether it could matter*.

**Persistence — no schema change.** The doc-eval-state store is already a string KV (`saveDocEvalState(key, value)` / `loadDocEvalState(key)`, `db.ts:493`), and the sweep already namespaces into it (`${docId}::sweep`). The floor snapshot rides the same store as JSON under **`${docId}::floor`**:

```ts
// src/services/docPassMateriality.ts (new, pure — no DB, no LLM)
export interface DocPassSnapshot {
  stage: string;                       // "" when unset
  maturity: MaturityLevel | "";        // "" on the legacy no-maturity path
  sectionCount: number;
  headings: string[];                  // ordered section heading texts (order matters for structure_flow)
  summaries: Record<string, string>;   // blockId → normalized summary CONTENT (not text hash — see below)
  claimSigs: string[];                 // sorted `${sourceBlockId}:${normalizedText}`
  subFloorDirtyStreak: number;         // consecutive hash-dirty-but-sub-floor idles
}
export function isMaterialDelta(prev: DocPassSnapshot, next: Omit<DocPassSnapshot, "subFloorDirtyStreak">):
  { material: boolean; reasons: string[] };
```

**The five clauses** (`isMaterialDelta` returns material when any holds):

1. **Claim delta** — `claimSigs` set difference non-empty in either direction (a claim added, removed/orphaned, or reworded past normalization).
2. **Structure delta** — `sectionCount` differs, or the ordered `headings` list differs (a heading added/removed/renamed/reordered — the input `structure_flow` actually reasons over).
3. **Maturity edge** — `prev.maturity !== next.maturity` (also delivers the "crossing unformed→forming earns the first pass at the next idle" arming case for free, since the pass is armed by the editor once maturity ≠ unformed and the floor then sees the edge).
4. **Stage change** — `prev.stage !== next.stage` (belt-and-braces; the `stage-changed` trigger routes through `handleDocIdle` anyway, and this makes the floor independent of trigger ordering).
5. **Summary delta ≥ K** — at least `SUMMARY_DELTA_FLOOR = 2` blockIds whose **normalized summary content** changed (added/removed count too). This adopts the "summary-content delta" open question as part of the spec: the fast call already returns each section's summary, so comparing normalized summary text instead of the raw-text hash absorbs reword-only churn at zero extra cost — a rewording that doesn't change what the section *says* (its summary) cannot change a `missing_topic`/`structure_flow` conclusion, which is precisely the materiality question.

**Accumulation is structural, not a counter:** the snapshot is written only when a pass actually **runs**, so every idle diffs against the *last executed pass*, and small edits across sections accumulate until ≥K summaries differ — nothing is ever discarded. The one shape that would never accumulate (endless reword-only churn inside a single section) is caught by the flush rule: each hash-dirty-but-sub-floor idle increments `subFloorDirtyStreak` (persisted in the snapshot); at **`SUBFLOOR_FLUSH_STREAK = 4`** the pass runs anyway and the streak resets. This bounds both the staleness of the feed **and** the doc-scope grace-closure latency (a stale card's close is delayed by at most 4 sub-floor idles per grace beat).

**Wiring (`evaluateDocument`, directly after the `docStateHash` check at `evaluator.ts:861`):**

- hash unchanged → return (exactly today — the floor never runs).
- hash changed → `loadDocEvalState(`${docId}::floor`)`; **no snapshot (legacy/first pass) → run** and write one.
- snapshot present → build `next` from the already-loaded `meaningful` summaries + `claims` + stage + maturity (all in scope at that point; heading texts come from the summaries' section records — if a heading list isn't derivable there, thread it from the editor alongside `singleSectionText`, which already crosses the same boundary) → `isMaterialDelta`:
  - material → run the pass; on completion write `docStateHash` + fresh snapshot (`subFloorDirtyStreak: 0`).
  - sub-floor → increment the streak in the stored snapshot, **do not** write `docStateHash` (the doc stays hash-dirty so the next idle re-asks), return without a model call. At streak ≥ 4 → treat as material (reason `"flush"`).

**Interaction notes:** the RPM-backpressure defer and the in-flight-section serialisation in `handleDocIdle` are untouched (they run before `evaluateDocument` is called); the single-section inline path (`singleSectionText`) flows through the same floor — its "summary" entry is the section's one summary, and clause 5 then rarely fires alone, which is correct (a one-section doc's materiality is carried by claims/structure/maturity/flush). Mock-replay fixtures are unaffected: the floor sits *before* prompt assembly and only ever suppresses calls; any run that does fire builds the identical prompt.

**Dev observability:** emit a harness `settle` event with `{ trigger: "doc-idle-subfloor", reasons }` when the floor suppresses a pass, so a scripted session can count suppressed strong calls (the RPD saving) directly.

## Trade-offs & guards

- **Doc-scope closure latency.** The grace machinery (`missCount` / `DOC_GRACE_THRESHOLD = 2`, `doc_scope_reconciliation.md`) closes stale doc-scope cards only when doc passes run. Rarer passes ⇒ slower `auto_closed`. Floor constants must be picked with this bound in view; the Todo carries a measurement item.
- **Never let accumulation dead-end.** A long tail of sub-threshold edits must eventually flush (the accumulate-toward-floor rule); otherwise a slowly-rewritten doc never gets a fresh doc pass and the feed goes stale — the UX-016 failure shape in a new costume.
- **Verification:** per-clause cases live in `evaluator.test.ts` (the floor lives in `evaluateDocument`, not the orchestrator) — fires / accumulates / flushes — plus pure-classifier unit tests in `docPassMateriality.test.ts`; mechanics doc updated in the same PR; RPD savings observable via `getApiStats()` in a scripted session before/after.

## Rejected alternatives

- **Full elimination of time-based triggers** (the hunch taken literally) — rejected: "stopped and is reflecting" cannot be detected by manipulation events, and the pause is when the user can actually read the feed. R3.3 itself lists pause length as a real signal.
- **Eager compute on state edges + delivery held for the boundary (Tier 3)** — the "Superb" direction: fully satisfies both the hunch and the attention argument by decoupling *when to compute* from *when to show*. **Deferred, not scheduled:** eager compute burns calls on states that get revised away (revert-aware eval exists precisely because transients are common), so on the free tier it's anti-optimal. Revisit only as a BYOK strong-capability enhancement, post-traction, with funnel/dogfood evidence.

## Open questions

- ~~**K** for the summaries-changed clause~~ — **settled 2026-07-16:** `SUMMARY_DELTA_FLOOR = 2`, shipped provisional; recalibrate against V1's evidence of which doc-pass re-runs actually changed output (Todo).
- ~~Whether a summary-**content** delta (vs text-hash delta) is a cheap better proxy~~ — **adopted 2026-07-16** as clause 5 of the build spec: the snapshot stores normalized summary content, so reword-only churn is absorbed at zero extra cost.
- Whether Tier 2's extra boundary events (large cursor jump, export) earn their complexity over plain idle, or idle alone suffices as the firing edge. (Tier-2 decision, with the owner, after Tier 1 soaks.)
