---
status: idea
kind: quality
phases: [8]
summary: Verdict on the owner's "time-based triggers are dumb" hunch (2026-07-13) plus the re-derivation it earns. Finding — the timers are state-gated conjunctions, and the pause half detects *attention*, which manipulation events definitionally can't; the real defect is the doc pass's ~zero materiality floor (any text change in any section re-earns a strong-tier call). Tier 1 — a materiality floor on doc-pass arming. Tier 2 — arm off section-eval completion (state edges), demoting idle to the attention boundary. The 3s section pause stays.
---

# Evaluation-trigger re-derivation — materiality floor + state-edge arming (R3.3)

> Written 2026-07-13 from an owner-prompted research session ("I am starting to think that the time-based evaluation trigger mechanism is dumb… all the triggers should be only around text manipulation and/or text state; the doc-level strong evals should come from the conditions of enough text/structure/definition met"). This file is both the **assessment** (is the hunch grounded?) and the **design** for what replaces the weak part. The behavioural ground truth it audits is `docs/mechanics/evaluation-triggers.md`.

## Status

**Idea — Phase 8.** Research done 2026-07-13; design settled at the tier level (below), constants and one arming decision open. Scheduled into Phase 8 because the materiality floor directly protects the binding free-tier RPD budget V1's keyed runs will also draw on, and because V1's corpus evidence (which doc-pass re-runs actually change output) is the right calibration input for the floor constants.

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

- [ ] **Tier 1 — materiality floor.** Replace the doc pass's "any `docStateHash` change" arming condition with a delta classifier over the same inputs: run the strong call only if (claim added/changed/orphaned) ∨ (section count / heading structure changed) ∨ (maturity level crossed) ∨ (stage changed) ∨ (≥K summaries changed, K TBD). Sub-threshold deltas **accumulate** toward the floor rather than vanishing.
- [ ] **Verify closure latency.** Doc-scope grace (`missCount` / `DOC_GRACE_THRESHOLD = 2`) closes stale cards only when doc passes run; measure/bound how much rarer passes delay `auto_closed`, and pick floor constants that keep it acceptable. Add `orchestrator.test.ts` cases per floor clause (fires / accumulates / flushes).
- [ ] **Decide K** (summaries-changed clause) — desk-default 2–3; recalibrate against V1's corpus evidence of which re-runs changed doc-level output.
- [ ] **Tier 2 decision — state-edge arming.** Decide (with the owner) whether to move arming from the raw 12s timer to section-eval-completion edges (the event that actually changes the pass's inputs), with idle demoted to the attention-boundary conjunct that *fires* an armed pass. Includes the maturity-edge case: crossing nascent→forming *arms* the first doc pass immediately instead of waiting to be noticed by a later idle window.
- [ ] **Optional tuning:** lengthen `EVAL_DEBOUNCE_MS` (3s → ~6s) now that `block-settle-completion` covers the responsive path — cuts the per-sentence eval cost for slow deliberate writers. Dogfood before committing; do not change without checking UX-013's original latency complaint stays fixed.
- [ ] **Update `docs/mechanics/evaluation-triggers.md`** in the same PR as any of the above.

## The question

Should evaluation triggers be **only** text-manipulation / text-state events, with doc-level strong evals derived from "enough text/structure/definition" conditions — eliminating the time-based triggers (the 3s typing-pause settle and the 12s doc-idle)?

## Trigger inventory (audited 2026-07-13)

Eight triggers; six are already pure manipulation events (Enter-completion, cursor departure, bulk paste, import, stage change, block removal). The two time-based ones are both **conjunctions with text-state gates**, not bare clocks:

- **3s pause settle** — dispatches only on terminal punctuation ∧ ≥15 chars (`EVAL_DEBOUNCE_MS`, `Editor.tsx:42`).
- **12s doc-idle** — reaches the model only if maturity ≠ nascent ∧ the doc-state hash changed since the last pass (`DOC_IDLE_MS`, `Editor.tsx:44`; `docStateHash` dirty check, `evaluator.ts:838–845`). An idle firing on an unchanged doc is a free no-op.

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

Secondary defect: the state conditions are **level-gates** (checked whenever the timer happens to fire), not **edges** (events when crossed). The moment a doc crosses nascent→forming is precisely when the first doc pass is earned; today that waits for the next idle window to notice. (A pure maturity-edge trigger would fire mid-burst, violating the attention half — edges must *arm*, the boundary must *fire*.)

## Design — three tiers

**Tier 1 (build): materiality floor on doc-pass arming.** Keep the idle boundary; replace "any hash change" with a delta classifier over the inputs the hash already covers. Strong call runs iff:

- a claim was added / changed / orphaned since the last pass, **or**
- section count / heading structure changed, **or**
- the maturity level crossed (nascent→forming→mature), **or**
- the stage changed (exists today as `stage-changed`), **or**
- ≥K summaries changed (K TBD, desk-default 2–3).

Sub-threshold deltas **accumulate** rather than vanish — a run of small edits eventually meets the floor. This is a change to the arming logic around `evaluateDocument`'s existing dirty check, not to the evaluator; the hash machinery stays (it remains the replay/dirty identity).

**Tier 2 (decide, then build if earned): state edges as the carrier.** The doc pass's true upstream event is **section-eval completion** — the only thing that changes its inputs (plus stage change / block removal). Arm on those edges when the Tier-1 floor is met; *fire* at the next attention boundary (idle settle, or a strong boundary event: large cursor jump, export, return-to-top). Time stops being the trigger and becomes the boundary detector — R3.3's "Good enough" tier, literally. Maturity crossings become arming edges, so a doc that just earned its first pass gets it at the next pause instead of an arbitrary later one.

**Keep untouched:** the 3s section pause (R3.3-sanctioned, state-gated, irreplaceable — it detects the reflective stop) and the section-boundary commit debounce (revert-awareness is intrinsically "wait to see if the change sticks"; an event-only pipeline evaluates every transient — UX-014's whole lesson).

## Trade-offs & guards

- **Doc-scope closure latency.** The grace machinery (`missCount` / `DOC_GRACE_THRESHOLD = 2`, `doc_scope_reconciliation.md`) closes stale doc-scope cards only when doc passes run. Rarer passes ⇒ slower `auto_closed`. Floor constants must be picked with this bound in view; the Todo carries a measurement item.
- **Never let accumulation dead-end.** A long tail of sub-threshold edits must eventually flush (the accumulate-toward-floor rule); otherwise a slowly-rewritten doc never gets a fresh doc pass and the feed goes stale — the UX-016 failure shape in a new costume.
- **Verification:** `orchestrator.test.ts` cases per floor clause (fires / accumulates / flushes); mechanics doc updated in the same PR; RPD savings observable via `getApiStats()` in a scripted session before/after.

## Rejected alternatives

- **Full elimination of time-based triggers** (the hunch taken literally) — rejected: "stopped and is reflecting" cannot be detected by manipulation events, and the pause is when the user can actually read the feed. R3.3 itself lists pause length as a real signal.
- **Eager compute on state edges + delivery held for the boundary (Tier 3)** — the "Superb" direction: fully satisfies both the hunch and the attention argument by decoupling *when to compute* from *when to show*. **Deferred, not scheduled:** eager compute burns calls on states that get revised away (revert-aware eval exists precisely because transients are common), so on the free tier it's anti-optimal. Revisit only as a BYOK strong-capability enhancement, post-traction, with funnel/dogfood evidence.

## Open questions

- **K** for the summaries-changed clause (2? 3? proportional to section count?) — calibrate against V1's evidence of which doc-pass re-runs actually changed output.
- Whether Tier 2's extra boundary events (large cursor jump, export) earn their complexity over plain idle, or idle alone suffices as the firing edge.
- Whether a summary-**content** delta (vs text-hash delta) is a cheap better proxy for "could change a doc-level conclusion" — the fast call already returns the summary; comparing normalized summary text instead of raw text hash may absorb most reword-only churn at zero extra cost.
