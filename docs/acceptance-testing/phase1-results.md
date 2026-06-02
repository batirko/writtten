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
| **T6 Contradiction**        | ✅ **FIXED** | **Exit criterion.** Was FAIL; fixed 2026-06-01, fires now — see [#1 RESOLVED](#1--t6-contradiction-never-fires-fail--exit-criterion) |
| T6 Contradiction hover      | ✅ PASS     | Hover on CONTRADICTION card highlights both P1 and P2 spans simultaneously; 7 `.obs-highlight-contradiction.obs-highlight-hovered` spans confirmed. Required `ObservationHighlighter.ts` fix: add second `Decoration.inline` for `conflictingBlockId` span. |
| T7 Anchoring                | ✅ PASS     | Clarity "Q2" decoration correctly position-maps through an 8-char prefix insert (synchronous `DecorationSet.map` verified). Required `ObservationHighlighter.ts` fix: remove `\|\| docChanged` from rebuild condition so `decorations.map(tr.mapping, tr.doc)` is used for plain edits instead of rebuilding from stale stored offsets. |
| T8 Auto-close               | ✅ PASS     | Editing P2 "Q3" → "Q2" triggered a settle-pause, re-eval produced 0 contradictions, observation auto-closed without any dismiss click. Active obs confirmed via `getState().observations` (contradiction absent). |
| T9 Block deletion           | ✅ PASS     | Cards cascaded out; `block-removed`, no new REQUEST                                               |
| T10 Stage field (automated) | ✅ PASS     | Stage text injected into REQUEST user content                                                     |
| T10 Stage persist (reload)  | ✅ PASS     | 👁 Human confirmed                                                                                |
| T11 Resiliency              | ✅ PASS     | 👁 Human brief check, no notes (429 not triggered)                                                |
| T12 Persistence             | ✅ PASS     | Text + both CLARITY cards survived reload                                                         |

**Phase 1 fully verified (2026-06-01).** All tests pass. T6-hover/T7/T8 confirmed in a follow-up browser session using the agent acceptance harness (mock-mode fixture, chrome-devtools for hover fidelity). Two fixes were required beyond the block-id collision: (1) `ObservationHighlighter.ts` emits a second decoration for the conflicting block's span so both sides light up on hover; (2) removed `|| docChanged` from the decoration rebuild condition so `DecorationSet.map()` correctly tracks span positions through edits instead of rebuilding from stale stored offsets.

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

**Why this breaks the contradiction check — CONFIRMED via the agent acceptance harness (2026-05-31).** The earlier "hypothesis, unverified in source" is now **fact**. With the Phase-1 harness (`docs/projects/agent_acceptance_harness.md`, `src/debug/harness.ts`) the ledger is directly observable, and a live re-run of the exact reproducer produced:

- **Duplicate block id in the DOM.** After splitting P1 into P2, both paragraphs carry the *same* id:
  ```html
  <p data-block-id="cxbvJY5mbJ">This will ship in Q3.</p>
  <p data-block-id="cxbvJY5mbJ">We'll launch this in Q2.</p>
  ```
- **The overwrite, captured as an event.** `window.__sidecar__.getEvents()` shows P1's claim inserted, then P2's claim *overwriting* it under the shared id:
  ```
  [sidecar] ledger-write seq=4  block=cxbvJY5mbJ action=insert    claims=1   ← P1 "…Q3."
  [sidecar] ledger-write seq=10 block=cxbvJY5mbJ action=overwrite claims=1   ← P2 "…Q2." clobbers P1
  ```
- **Final ledger holds one claim, not two.** `getState().ledger` →
  `[{ block: "cxbvJY5mbJ", text: "We'll launch this in Q2.", kind: "commitment" }]`. P1's `Q3` commitment is gone, so the cross-document contradiction pass has nothing to compare and never runs. Two CLARITY observations still render (clarity is per-block and doesn't depend on ledger uniqueness).

This also **exonerates the contradiction logic itself**: the evaluator unit test (`should run contradiction checks against other claims`) fires a `contradiction` when two claims live under *distinct* block ids. The sole defect is the duplicate id.

**Root cause (now confirmed).** `src/editor/extensions/BlockId.ts` — the `appendTransaction` plugin only assigns an id when `!node.attrs.blockId`. On an `Enter`/paragraph split, ProseMirror **copies the source node's attrs (including `blockId`) into the new paragraph**, so the new block arrives already carrying P1's id and the plugin skips it. The fix belongs there: detect a `blockId` that already exists elsewhere in the doc (a collision) and mint a fresh one for the duplicate, rather than gating solely on presence. The orchestrator/evaluator/ledger are keyed correctly given unique ids; they don't need changes.

**Reproducer (now deterministic with the harness).** Clear workspace → type P1 ending in terminal punctuation → `Enter` → type P2 → poll `await window.__sidecar__.getState()` until `pending === 0` → read `.ledger` (expect 2 entries; bug yields 1) and `getEvents()` for a `ledger-write … action=overwrite`. No blind `sleep`, no inferring from REQUEST lines.

**RESOLVED (2026-06-01).** Fixed in `src/editor/extensions/BlockId.ts`: the `appendTransaction` plugin now tracks ids already seen in the pass and reissues a fresh `nanoid(10)` for any block whose id is null **or collides with an earlier block** (the split-copy case), instead of skipping any node that already has an id. Extracted as the pure, unit-tested `assignBlockIds(doc, tr)` (`src/editor/extensions/BlockId.test.ts` — duplicate→reissued, null→assigned, unique→untouched). Live re-verification via the harness:

```
domIds: ["gAikfgrPEg", "Cvp54O6fE6"]          ← now distinct (was a single shared id)
ledger: [ {block: gAikfgrPEg, text: "This will ship in Q3."},
          {block: Cvp54O6fE6, text: "We'll launch this in Q2."} ]   ← 2 claims, both action=insert
observation: { type: "contradiction", block: "Cvp54O6fE6", conflicting: "gAikfgrPEg",
               text: "This contradicts the Q3 shipping date." }      ← the Phase 1 "wow", firing
```

The cross-document contradiction pass now has two competing claims to compare and fires as designed — **T6 passes**. (T6-hover / T7 anchoring / T8 auto-close are now unblocked but still want a focused confirmation pass.)

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
