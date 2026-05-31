# Phase 1 Acceptance Test Results

> Run date: **2026-05-31** Environment: dev server `http://localhost:5173`, Chrome via `chrome-devtools` MCP. Provider: Gemini (free tier). Chip reported `gemini-2.0-flash` on cold load / `gemini-3.5-flash` during activity. Automated by Claude; 👁 human steps confirmed by operator (T1, T4, T6, T10, T11).

## Scorecard

| Test                        | Result     | Notes                                                                                             |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| T0 Pre-flight               | ✅ PASS     | No console errors; chip + debug panel present                                                     |
| T1 Quiet while drafting     | ✅ PASS     | Partial sentence fired no trigger. Human: no spinner.                                             |
| T2 Settle pause             | ✅ PASS     | `settle-pause` → RESPONSE in ~7s; 3 CLARITY cards                                                 |
| T3 Blur trigger             | ⚠️ WEIRD   | Fired `settle-pause`, not `settle-blur` — see [#2](#2--t3-blur-trigger-not-observed-weird)        |
| T3 Short-block suppression  | ✅ PASS     | `"ok."` → zero triggers after 5s                                                                  |
| T4 Clarity (automated)      | ✅ PASS     | 3 observation-toned CLARITY cards; no apply/fix affordance                                        |
| T4 Clarity hover            | ✅ PASS     | 👁 Human confirmed highlight                                                                      |
| T5 Claim ledger             | ✅ PASS     | `claims:[{text:"This feature will ship in Q3.",kind:"commitment"}]`                               |
| T5 Hash short-circuit       | ✅ PASS     | No-op re-edit re-settled but fired no new REQUEST                                                 |
| **T6 Contradiction**        | ❌ **FAIL** | **Exit criterion.** Never fires — see [#1](#1--t6-contradiction-never-fires-fail--exit-criterion) |
| T6 Contradiction hover      | ⛔ BLOCKED  | Blocked by T6 fail (also confirmed by human)                                                      |
| T7 Anchoring                | ⛔ BLOCKED  | Needs a live highlight from T6                                                                    |
| T8 Auto-close               | ⛔ BLOCKED  | Needs an active contradiction from T6                                                             |
| T9 Block deletion           | ✅ PASS     | Cards cascaded out; `block-removed`, no new REQUEST                                               |
| T10 Stage field (automated) | ✅ PASS     | Stage text injected into REQUEST user content                                                     |
| T10 Stage persist (reload)  | ✅ PASS     | 👁 Human confirmed                                                                                |
| T11 Resiliency              | ✅ PASS     | 👁 Human brief check, no notes (429 not triggered)                                                |
| T12 Persistence             | ✅ PASS     | Text + both CLARITY cards survived reload                                                         |

**Phase 1 is NOT verified.** The exit-criterion test (T6) fails, and T7/T8 are blocked behind it.

---

## Non-positive observations

### #1 — T6 contradiction never fires (FAIL — exit criterion)

**Severity:** blocker. This is the Phase 1 "wow" and its exit criterion.

**What happened.** Two paragraphs were written in a freshly-cleared workspace:

- P1: `"This will ship in Q3."`
- P2: `"We'll launch this in Q2."`

Both blocks were evaluated (each got its own CLARITY cards), but **no `CONTRADICTION` card ever appeared** and no strong-tier cross-document call fired. `wait_for(["CONTRADICTION","contradiction"])` timed out at 25s. Operator independently confirmed: _"contradictions never appear for me as well"_ — so this is **not** a test-harness artifact.

**Verified evidence — same block ID for both paragraphs.** The debug log shows both REQUESTs tagged with the **identical** block id `gD-8uoum`:

```
[REQUEST] settle-pause block=gD-8uoum  10:30:47   ← P1 "This will ship in Q3."
[REQUEST] settle-pause block=gD-8uoum  10:31:53   ← P2 "We'll launch this in Q2."
```

For comparison, the single-paragraph tests each produced a _distinct_ id (`s8MWT2v1`, `F_S-U4eF`, `dc_8ycVQ`, …). The collision only manifests when a second paragraph is created.

**Why this breaks the contradiction check (hypothesis, unverified in source).** If both paragraphs share one block id, the claim ledger is keyed by block id, so P2's commitment (`Q2`) overwrites P1's commitment (`Q3`) instead of being added alongside it. The ledger therefore never holds two competing claims, and the cross-document contradiction pass has nothing to compare. The two CLARITY responses still render because clarity is per-block and doesn't depend on ledger uniqueness.

**Where to look.** Block-id assignment / ProseMirror node-id tracking feeding the orchestrator — likely `src/services/orchestrator.ts` and the block→ledger write in the evaluator (`src/services/evaluator.ts`). The reproducer: clear workspace → type a sentence in P1 → `Enter` → type a sentence in P2 → inspect the two REQUEST block ids in the debug log. Expect them to differ; they don't.

---

### #2 — T3 blur trigger not observed (WEIRD)

**Severity:** low — possibly a test-harness artifact, not a confirmed product bug.

**What happened.** The blur sub-test types a full sentence in P1 and immediately clicks into P2, expecting `trigger=settle-blur:cursor-departed`. Instead the debug log recorded `trigger=settle-pause` for that block — the pause debounce elapsed during the latency between the automated `type_text` and `click` calls, so the pause timer won the race before the blur path could fire.

**Why it's only "weird."** A genuine `settle-blur:cursor-departed` entry _was_ seen earlier (in T0 baseline, block `fjHoVOeB`), so the blur path is wired up. The evaluation still ran and produced an observation — only the _trigger label_ differed from what the test scripts. This is most likely the MCP round-trip latency exceeding the pause threshold, not a defect.

**Recommendation.** Re-run the blur sub-test by hand (type, then click away within the pause window) to confirm `settle-blur` fires for a fast cursor departure. If it still mislabels under genuine fast blur, then it's a real ordering bug between the pause and blur triggers.

---

### #3 — "Clear workspace" does not cancel an in-flight LLM request (anomaly)

**Severity:** low–medium. Cosmetically confusing; produces phantom observations.

**What happened.** During the first T1 attempt, a REQUEST that was already in flight when **Clear workspace** was pressed continued to completion _after_ the clear, and its RESPONSE then populated two CLARITY cards into the now-empty document:

```
[REQUEST]  gemini-3.5-flash  10:21:32   ← issued before clear
(clear pressed)
[RESPONSE] gemini-3.5-flash  10:21:59   ← lands after clear → injects cards
```

The cards referenced text that no longer existed in the editor. A second clear flushed them. The clearing path appears to wipe document/observation state but does **not** abort outstanding model calls, so a late response can re-seed the feed.

**Where to look.** The clear handler should cancel/ignore pending evaluations (e.g. an `AbortController` on the request, or a generation token checked before applying a response). Likely in the orchestrator's request lifecycle and the clear action.

---

### #4 — Provider chip model name is inconsistent across loads (minor)

**Severity:** cosmetic.

**What happened.** The chip showed `gemini-2.0-flash` on cold page load (T0) and again after reload (T12), but `gemini-3.5-flash` throughout active testing once requests had run. T0's pass criterion only asks for _a_ model name, so it passed — but the flip between `2.0-flash` and `3.5-flash` depending on activity is worth confirming as intended (fast-vs-strong tier display vs. a stale initial label).

---

## Summary

One blocker (**#1, T6**) prevents Phase 1 sign-off and cascades to T7/T8. Items #2–#4 are low-severity: #2 is probably a harness-latency artifact, #3 and #4 are real but minor robustness/cosmetic issues. Everything else passed, including all five human-confirmed checks. Fixing the block-id collision in #1 is the single thing standing between the current build and the Phase 1 exit criterion.
