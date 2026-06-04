# Phase 4 — Core Experience: Signal Quality & Calm Feed — Acceptance Tests

> **Why this file exists.** Phase 4 made the write → observe → rethink loop _good_: priority/severity/confidence axes, a budget-based calm feed, confidence/impact badging, same-span observation aggregation, a jargon allow-list, the `strategic_tension` type, and the evaluator quality ratchet. Every piece has unit tests; none had a **phase-level acceptance pass** against the running app. This file closes that gap — it turns "the code compiles and unit tests pass" into "the product _feels_ calm and trustworthy, and high-impact items outrank nits," which is the literal Phase 4 exit criterion.
>
> The sibling file `phase4-import.md` already covers import / semantic paste (also shipped in Phase 4). This file covers the **core-experience** milestones and the holistic "would a PM trust this feed today?" judgment that the phase is graded on.
>
> **How to use this file.** Claude drives the automated steps; a human confirms steps marked **👁 HUMAN**. After each test record **PASS / FAIL / WEIRD / SKIP** plus the requested evidence in the scorecards at the bottom.
>
> **Before starting:** `npm run dev` must be running at `http://localhost:5173`.
>
> **Tooling.** Two MCPs, picked per job (see `CLAUDE.md` § Browser testing):
>
> - **claude-preview** (`mcp__Claude_Preview__preview_*`) — preferred for anything driving `window.__sidecar__`: seeding fixtures, polling state, reading the ledger/observations, record/replay. `preview_eval` has a **30 s hard timeout** — keep polling loops under it.
> - **chrome-devtools** (`mcp__chrome-devtools__*`) — preferred for real input fidelity: typing into the ProseMirror editor, hovering cards to trigger highlights, clicking by accessibility uid, reading rendered CSS (border colors, the `~` qualifier).
>
> Load tool schemas via ToolSearch before first use.

---

## Conventions & shared reference

**Status readiness.** Wait for idle with either:

- preview: poll `window.__sidecar__.getState()` until `pending === 0`, or
- chrome-devtools: `wait_for('[data-testid="sidecar-status"]', ["idle"])`.

**The harness surface** (`window.__sidecar__`, dev-only) — the same surface as `phase2-3-mgw.md`. Phase-4-relevant additions to `getState().observations[i]`:

| Field                | Meaning                                                                       |
| -------------------- | ----------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| `kind`               | `"problem"` \                                                                 | `"opportunity"` \ | `"reflection"` — drives the border-color register |
| `severity`           | `"low"` \                                                                     | `"medium"` \      | `"high"` — drives border intensity                |
| `confidence`         | `"low"` \                                                                     | `"medium"` \      | `"high"` — low → `~` qualifier on the tag         |
| `priority`           | float in `[0.5, 3.0]` — governs budget membership & primary-of-group          |
| `conflictingBlockId` | set for `contradiction` AND `strategic_tension` — the second highlighted span |

**Observation taxonomy under test** (9 types, fixed — Phase 4 added `strategic_tension`): `clarity`, `contradiction`, **`strategic_tension`**, `unsupported_claim`, `undefined_jargon` (span scope) · `missing_topic`, `underexposed_topic`, `audience_mismatch`, `structure_flow` (document scope).

**Priority model** (`src/services/priority.ts`, fully unit-tested — these are the values the feed sorts by):

| Observation                                      | severity | confidence | priority      |
| ------------------------------------------------ | -------- | ---------- | ------------- |
| `contradiction`, commitment×commitment, paid key | high     | high       | **3.0** (max) |
| `unsupported_claim` overlapping a commitment     | high     | medium     | 2.25          |
| generic paid `contradiction`                     | medium   | high       | 2.0           |
| `missing_topic`                                  | medium   | medium     | 1.5           |
| `strategic_tension` (always)                     | medium   | medium     | **1.5**       |
| free-tier **hedged** `contradiction`             | medium   | low        | 1.0           |
| `clarity` / `undefined_jargon` / flow nits       | low      | medium     | 0.75          |

**Badging matrix** (`data-kind` × `data-severity` → `border-left` color, `src/styles.css`):

| kind \ severity | low                 | medium          | high                |
| --------------- | ------------------- | --------------- | ------------------- |
| `problem`       | grey `#8e8e93`      | amber `#f59e0b` | red `#ef4444`       |
| `opportunity`   | pale teal `#99c5d0` | teal `#0ea5e9`  | deep teal `#0369a1` |

Low-confidence cards render a `~` after the type tag (`.observation-card[data-confidence="low"] .tag::after`).

**Feed budget:** `DEFAULT_FEED_BUDGET = 7`. Top-7 groups by priority are visible; the rest fall into the "also noticed" drawer. **Contradiction floor:** any group containing a `contradiction` is _always_ visible regardless of budget. `strategic_tension` is **never** floored (it's an opportunity, priority 1.5).

**Aggregation:** observations sharing the exact span `blockId:startOffset:endOffset` collapse into one card. Highest-priority member is `primary`; the rest are in a "N more on this passage" collapse. Doc-scoped observations never aggregate.

**testid selectors used here:**`sidecar-status` · `obs-card` (+ `data-obs-type` / `data-kind` / `data-severity` / `data-confidence` / `data-grouped` / `data-obs-id`) · `obs-dismiss` · `obs-group-also` · `obs-group-toggle` · `obs-group-item` · `also-noticed-drawer` · `also-noticed-toggle` · `jargon-allowlist-input` · `settings-panel` · `provider-chip` · `clear-workspace` / `clear-confirm` · `debug-entry` · `arrival-indicator`.

---

---

# Part A — Priority / severity / confidence axes

Goal of this part: every observation carries the three metadata axes, computed by the pure priority function, and they reflect the structural signals the design promises. This is the data the calm feed and badging are built on — if it's wrong, everything downstream is wrong.

## P4A-T1 — Every observation carries all three axes

**Who:** Claude (automated)

**Setup:** `clear()`. Live mode with a key, OR replay a fixture from the corpus (`src/services/eval-fixtures/`).

**Steps:**

1. Seed a doc that yields a spread of types — fastest: `loadDoc` with a vague unsupported assertion + a contradiction pair. Wait for idle.
2. Read `getState().observations`.

**Pass criteria:**

- **Every** observation has non-null `kind`, `severity`, `confidence`, and a numeric `priority` in `[0.5, 3.0]`.
- `kind` is one of `problem` / `opportunity` / `reflection`; no observation is missing the axis (no `undefined`).

**Report:** Paste the `{type, kind, severity, confidence, priority}` tuple for each observation.

---

## P4A-T2 — Contradiction confidence is tier-calibrated

**Who:** Claude (automated)

**Setup:** `clear()`.

**Steps:**

1. **Free tier (no key / flash-lite hedged prompt):** create a Q2-vs-Q3 contradiction. Wait for idle. Record the contradiction's `confidence` and `priority`.
2. **Paid tier (BYO key set):** repeat with the same conflict. Record again.

**Pass criteria:**

- Free-tier contradiction → `confidence: "low"`, `priority: 1.0` (hedged).
- Paid-tier contradiction → `confidence: "high"`, `priority ≥ 2.0` (and 3.0 if commitment×commitment).
- No _other_ type is tier-calibrated — `clarity`, `jargon`, etc. always report `confidence: "medium"`.

**Report:** Free vs paid contradiction confidence/priority. Confirm only contradiction varies by tier.

---

## P4A-T3 — Structural escalation bumps severity

**Who:** Claude (automated; may seed via `loadLedger` for determinism)

**Setup:** `clear()`.

**Steps:**

1. **commitment×commitment:** seed two `commitment`-kind claims that conflict on a date (e.g. "Ships Q2" / "Ships Q3") via `loadLedger`, then provoke the contradiction. Record severity.
2. **unsupported over a commitment:** make an unsupported assertion on a span that also carries a `commitment` claim. Record severity.

**Pass criteria:**

- commitment×commitment (or metric×metric) contradiction escalates one step → `severity: "high"`.
- `unsupported_claim` overlapping a commitment escalates → `severity: "high"`, `priority: 2.25`.
- A generic contradiction with non-commitment claims stays `medium`.

**Report:** Severity for each escalation path. Confirm the non-escalated baseline stays `medium`.

---

---

# Part B — Budget-based calm feed

Goal of this part: the feed shows a bounded, priority-ranked set; overflow goes quietly into a drawer; contradictions never get buried; display order is document order (never shuffles by priority). This is the single biggest "feels calm vs. feels like a wall" lever.

## P4B-T1 — Top-N budget: visible set is bounded

**Who:** Claude (automated)

**Setup:** `clear()`.

**Steps:**

1. Seed/provoke **more than 7** distinct active observations (e.g. `loadDoc` with 8–10 blocks each yielding a clarity/jargon nit). Wait for idle.
2. Count `[data-testid="obs-card"]` in the main feed (exclude the drawer).
3. Read the "also noticed" drawer count.

**Pass criteria:**

- At most `DEFAULT_FEED_BUDGET` (7) groups render in the main feed.
- The remainder appear under `[data-testid="also-noticed-drawer"]` — they are **not** dropped.
- `getState().observations` still reports the full count (budget is display-only; nothing is deleted).

**Report:** Total active count, visible count (≤7), drawer count. Confirm visible + drawer == total groups.

---

## P4B-T2 — "Also noticed" drawer opens & closes

**Who:** Claude (automated) + **👁 HUMAN** (collapse animation)

**Setup:** Continue from P4B-T1 (overflow exists).

**Steps:**

1. Locate `[data-testid="also-noticed-drawer"]` and its toggle `[data-testid="also-noticed-toggle"]`.
2. Confirm the drawer is **collapsed by default** (overflow cards not rendered/visible).
3. Click the toggle. Confirm overflow cards become visible.
4. Click again. Confirm it collapses.

**Pass criteria:**

- Drawer defaults closed — calm feed shows only the budgeted set on load.
- Toggle reveals/hides the overflow; the count in the toggle label matches the overflow count.
- Overflow cards are full observation cards (dismissable), not dead text.

**👁 HUMAN:** Confirm the drawer reads as a quiet "also noticed" affordance, not an alarm — it should feel optional.

**Report:** Default state, toggle behavior, overflow count matches label?

---

## P4B-T3 — Contradiction floor: contradictions never get buried

**Who:** Claude (automated)

**Setup:** `clear()`.

**Steps:**

1. Seed **7+ low-priority nits** (clarity/jargon, priority 0.75) so the budget is full.
2. Now introduce **one contradiction** (a Q2/Q3 conflict). Wait for idle.
3. Inspect the visible feed vs. the drawer.

**Pass criteria:**

- The contradiction is in the **visible** feed even though 7 nits already filled the budget (contradiction floor).
- No contradiction ever sits in the "also noticed" drawer.
- The nits that got pushed out by the floor move to the drawer (the floor adds, it doesn't silently delete).

**Report:** Confirm contradiction visible despite full budget; confirm zero contradictions in drawer.

---

## P4B-T4 — Display is document order, not priority order

**Who:** **👁 HUMAN** + Claude (snapshot diff)

**Setup:** `clear()`.

**Steps:**

1. Build a feed where a **low**-priority clarity nit sits in paragraph 1 and a **high**-priority contradiction sits in paragraph 5.
2. Note the on-screen card order.

**Pass criteria:**

- Within the visible set, cards render in **document order** (¶1 nit above the ¶5 contradiction) — priority governs _membership_ in the visible set, **not** display order (feed-stability contract §8).
- Editing to add a new observation slots it into document position; existing cards do **not** re-sort by priority.

**👁 HUMAN:** Confirm reading position is stable — a newly-arrived high-priority card does not yank the feed to the top.

**Report:** Card order vs. document order. Confirm no priority-driven shuffle.

---

---

# Part C — Confidence / impact badging

Goal of this part: visual hierarchy makes a contradiction _look_ more urgent than a clarity nit, so high-impact items win attention instead of competing. The border-color matrix and the low-confidence `~` qualifier carry this.

## P4C-T1 — Border-color matrix (kind × severity)

**Who:** Claude (automated CSS read) + **👁 HUMAN** (visual)

**Setup:** Seed a doc producing a spread: a high-severity contradiction (`problem`/`high` → red), a `missing_topic` (`problem`/`medium` → amber), a clarity nit (`problem`/`low` → grey), and a `strategic_tension` (`opportunity`/`medium` → teal).

**Steps:**

1. For each `[data-testid="obs-card"]`, read `data-kind` + `data-severity` and the computed `border-left-color`.
2. Cross-check against the matrix in Conventions.

**Pass criteria:**

- `problem`/`high` → red `#ef4444`; `problem`/`medium` → amber `#f59e0b`; `problem`/`low` → grey `#8e8e93`.
- `opportunity`/`medium` → teal `#0ea5e9` (the `strategic_tension` register).
- A glance distinguishes a contradiction from a nit by color/weight alone.

**👁 HUMAN:** Confirm the contradiction visibly outranks the clarity nit — the red border draws the eye first.

**Report:** Per-card `(kind, severity) → border color`. Confirm matches matrix.

---

## P4C-T2 — Low-confidence `~` qualifier

**Who:** Claude (automated) + **👁 HUMAN**

**Setup:** Provoke a **free-tier hedged contradiction** (`confidence: "low"`, P4A-T2 step 1).

**Steps:**

1. Confirm the card has `data-confidence="low"`.
2. Read the rendered type tag — the `::after` pseudo-element should append `~`.

**Pass criteria:**

- A low-confidence observation's tag shows the `~` hedge qualifier; medium/high-confidence tags do not.
- This is the only visual difference — no separate "uncertain" badge or color change.

**👁 HUMAN:** Confirm the `~` reads as "tentative," softening the claim without hiding it.

**Report:** Tag text for a low-confidence vs. a medium-confidence card. Confirm `~` present only on low.

---

---

# Part D — Observation aggregation (same-span grouping)

Goal of this part: when several checks fire on one sentence (the Q2/Q3 paradox fired three), they collapse into one high-impact card instead of flooding the feed with near-duplicates of one underlying issue.

## P4D-T1 — Same-span observations collapse into one card

**Who:** Claude (automated)

**Setup:** `clear()`. Arrange a single span that legitimately triggers ≥2 types — e.g. a sentence that is both an unsupported claim and contains undefined jargon, OR replay the aggregation case.

**Steps:**

1. Provoke the multi-flag span. Wait for idle.
2. Read `getState().observations` — confirm ≥2 observations share the same `blockId:startOffset:endOffset`.
3. Count `[data-testid="obs-card"]` for that span (should be **one**).
4. Confirm the card has `data-grouped="true"` and an `[data-testid="obs-group-also"]` section.

**Pass criteria:**

- N same-span observations → **one** card (one budget slot), `data-grouped="true"`.
- The **primary** shown is the highest-priority member (`data-obs-type` = the most urgent type).
- The toggle reads "N more on this passage" with the correct N (= members − 1).

**Report:** Underlying observation count for the span vs. rendered card count (1). Primary type = highest priority?

---

## P4D-T2 — Group expand / collapse & per-member dismiss

**Who:** Claude (automated)

**Setup:** Continue from P4D-T1 (a grouped card exists).

**Steps:**

1. Confirm the "others" are collapsed by default (no `[data-testid="obs-group-item"]` visible).
2. Click `[data-testid="obs-group-toggle"]`. Confirm `obs-group-item` rows appear, one per non-primary member.
3. Dismiss the group via the card's `[data-testid="obs-dismiss"]`.
4. Read `getState()`.

**Pass criteria:**

- Toggle reveals the secondary members; each shows its own type tag + text.
- Dismissing the card dismisses **all** members of the group (the underlying issue is one passage) — the whole group leaves the active feed, all members route to archive.
- Doc-scoped observations never group — each `missing_topic` / `structure_flow` stays its own card even though both lack a span.

**Report:** Expand worked? On dismiss, how many observations moved to archive (should be all group members)?

---

---

# Part E — Jargon allow-list / domain dictionary

Goal of this part: kill `undefined_jargon` false-positives on standard PM vocabulary so the feed earns trust. A hardcoded preset is always merged; a user dictionary adds to it.

## P4E-T1 — Preset terms are suppressed

**Who:** Claude (automated)

**Setup:** `clear()`. Empty jargon allow-list.

**Steps:**

1. Type a block using **preset** terms verbatim (`src/services/jargonPreset.ts`): e.g. _"We'll run a soft launch to one cohort, measure NPS and churn, then expand the rollout."_ Wait for idle.
2. Read `getState().observations`, filter `type === "undefined_jargon"`.

**Pass criteria:**

- **No** `undefined_jargon` fires on preset terms (`soft launch`, `cohort`, `nps`, `churn`, `rollout`).
- A genuinely undefined non-preset acronym in the same block (e.g. `GQRS`) **does** fire — the allow-list suppresses, it doesn't disable the check.

**Report:** Jargon observations produced. Confirm preset terms absent, novel acronym present.

---

## P4E-T2 — User dictionary suppresses custom terms (and persists)

**Who:** Claude (automated) + **👁 HUMAN** (persistence across reload)

**Setup:** `clear()`.

**Steps:**

1. Open settings; locate `[data-testid="jargon-allowlist-input"]` (textarea, one term per line).
2. Add a custom domain term, e.g. `Northstar Index` (one per line).
3. Type a block using that term plus an undefined control acronym. Wait for idle.
4. Read jargon observations.

**Pass criteria:**

- The user-added term is **not** flagged; the control acronym still is.
- Matching is case-insensitive and merges with (does not replace) the preset.

**👁 HUMAN:** Reload the page; confirm the allow-list textarea content persists.

**Report:** Custom term suppressed? Control still fired? Human: persisted across reload?

---

---

# Part F — `strategic_tension` type

Goal of this part: deliberate strategic tradeoffs route to the softer `strategic_tension` (opportunity register), **not** to `contradiction` — they're both-can-be-true tensions worth surfacing, not logical impossibilities. This resolves OBS-004.

## P4F-T1 — A tradeoff routes to tension, not contradiction

**Who:** Claude (automated)

**Setup:** `clear()`. Replay the `strategic-tension-fraud` corpus fixture (deterministic) OR run live.

**Steps:**

1. Seed two sections expressing a genuine tradeoff (e.g. "minimize fraud via aggressive blocking" vs. "minimize friction / false declines"). Wait for idle.
2. Read `getState().observations`.

**Pass criteria:**

- A `strategic_tension` observation fires across the two sections — **not** a `contradiction`.
- It carries `kind: "opportunity"`, `confidence: "medium"`, `priority: 1.5`, and `conflictingBlockId` set to the other section.
- A genuine logical contradiction (Q2-vs-Q3 from Part B) still routes to `contradiction`, _not_ tension — the two are not conflated.

**Report:** The tension observation tuple. Confirm no contradiction fired on the tradeoff; confirm Q2/Q3 still fires a contradiction.

---

## P4F-T2 — Tension visual register & dual-span highlight

**Who:** Claude (automated) + **👁 HUMAN** (hover both spans)

**Setup:** Continue from P4F-T1 (a `strategic_tension` card exists).

**Steps:**

1. Confirm the card has `data-kind="opportunity"`, `data-severity="medium"` → teal `#0ea5e9` border (Part C matrix).
2. **👁** Hover the card. Both anchored spans (this section + `conflictingBlockId` section) should highlight, exactly like a contradiction's dual highlight.
3. Confirm `strategic_tension` is **never** in the contradiction floor — if 7 higher items exist, a lone tension (priority 1.5) can fall into the "also noticed" drawer.

**Pass criteria:**

- Teal border distinguishes the tension from a red contradiction at a glance — softer register, as designed.
- Hover lights **both** spans (the highlighter gates on `conflictingBlockId`, not on `type === "contradiction"`).
- Tension is budget-subject, not floored.

**👁 HUMAN:** Confirm both passages highlight on hover; confirm the teal reads as "worth weighing," not "error."

**Report:** Border color, dual-span highlight confirmed, floor behavior.

---

---

# Part G — Evaluator quality ratchet

Goal of this part: the regression suite that guards everything above actually bites. Tier 1 is deterministic and runs in CI; Tier 2 is the opt-in live precision/recall scorecard.

## P4G-T1 — Tier 1 deterministic suite is green & in `npm test`

**Who:** Claude (automated, terminal)

**Steps:**

1. Run `npm test`. Locate `src/services/evalRatchet.test.ts` and `src/services/evalScorer.test.ts` in the output.

**Pass criteria:**

- Every corpus fixture passes with exact precision/recall (= 1, or NaN for the zero-observation `clean-doc` guard).
- The record helper (`record.test.ts`) is **excluded** from the normal run (no live API calls in `npm test`).
- Total suite is green.

**Report:** Fixture count, pass/fail. Confirm `record.test.ts` did not run live.

---

## P4G-T2 — The ratchet actually bites (regression-guard proof)

**Who:** Claude (automated, terminal)

**Steps:**

1. Temporarily break a deterministic path — e.g. flip the `strategic_tension` `kind` from `"opportunity"` to `"problem"` in `src/services/evaluator.ts`, or comment out the aggregation grouping.
2. Run `npm test`.
3. Revert the change; re-run.

**Pass criteria:**

- Tier 1 goes **red** with the break (the scorer caught the regression) — proving the suite isn't vacuously green.
- After revert, green again.

**Report:** Which path was broken, which fixture(s) went red, green after revert?

---

## P4G-T3 — Tier 2 live scorecard (opt-in)

**Who:** Claude (automated, terminal) — **SKIP if no key / quota**

**Setup:** `VITE_GEMINI_API_KEY` in `.env.local`.

**Steps:**

1. Run `EVAL_LIVE=1 npm run eval:live`.
2. Read the `console.table` per-type precision/recall scorecard.

**Pass criteria:**

- Aggregate precision ≥ 0.6 and recall ≥ 0.7 (the soft floor) — a real prompt regression would fail this.
- `clean-doc` yields zero false positives on the live model.
- `strategic-tension-fraud` fires a **tension**, not a contradiction, on the live model.
- `knownGaps` (OBS-001/003/005) are reported as expected-misses, not counted against the score.

**Report:** Paste the scorecard. Confirm clean-doc clean and tension routing on live. SKIP if quota/key unavailable.

---

---

# Part H — Holistic: does the feed feel calm and trustworthy?

Goal of this part: the Phase 4 exit criterion in plain language. The pieces above are means; this is the end. Run one continuous PRD-revision session and judge the _whole_.

## P4H-T1 — The calm-feed exit criterion (the acceptance script)

**Who:** Claude (drives) + **👁 HUMAN** (the trust judgment)

**Run a real revision arc, asserting at each beat:**

1. **High-impact first.** A doc with a contradiction + several nits → the contradiction is visible (floored), badged red, and visibly outranks the grey/amber nits.
2. **Bounded surface.** Even with 10+ underlying issues, the visible feed is ≤7 groups; the rest sit quietly in "also noticed."
3. **Near-duplicates collapse.** A span that fires 3 checks shows as **one** card with "2 more on this passage" — not three cards.
4. **No false alarms.** Standard PM vocabulary (soft launch, cohort, NPS) produces **zero** jargon flags; a strategic tradeoff shows as a teal **tension**, not a red contradiction.
5. **Stable reading position.** Editing to add an observation slots it in document order; nothing shuffles by priority; the contradiction doesn't yank the feed to the top.
6. **Still never edits prose.** No Apply / Fix / Rewrite / Accept affordance appears anywhere — on any card, group, drawer, or badge.

**Pass criteria:** every beat holds. The subjective verdict — _"would a PM trust this feed in a real revision?"_ — is **yes**: signal is high, noise is low, urgency is legible.

**👁 HUMAN:** This beat is the actual deliverable. Render the verdict: calm and trustworthy, or still noisy/untrustworthy (and where)?

**Report:** Beat-by-beat PASS/FAIL + the one-line trust verdict.

---

## P4H-T2 — Invariants still hold under the new surface

**Who:** Claude (automated)

**Steps:**

1. Collect every observation `type` over the session — confirm all 9 are within the fixed taxonomy (no free-form category leaked in via `strategic_tension`'s prompt change).
2. Confirm no fix-application affordance was introduced by badging/aggregation/drawer UI (CLAUDE.md invariant #1).
3. Confirm aggregation/budget/jargon are **display/post-processing** layers — `getState().observations` still holds the full, un-truncated set (the budget hides, it never deletes).

**Pass criteria:**

- Taxonomy stays closed at 9 types (invariant #2).
- Zero apply/rewrite affordances (invariant #1).
- Budget/aggregation are non-destructive: full observation set survives in state and archive.

**Report:** Type set observed (⊆ 9). Confirm no fix affordance. Confirm full set intact behind the budget.

---

---

# Scorecards

## Part A — Priority / severity / confidence axes

| Test                                 | Result | Notes |
| ------------------------------------ | ------ | ----- |
| P4A-T1 every obs has 3 axes          |        |       |
| P4A-T2 contradiction tier-calibrated |        |       |
| P4A-T3 structural escalation         |        |       |

## Part B — Budget-based calm feed

| Test                          | Result | Notes           |
| ----------------------------- | ------ | --------------- |
| P4B-T1 top-N budget bounded   |        |                 |
| P4B-T2 also-noticed drawer    |        | (👁 collapse)   |
| P4B-T3 contradiction floor    |        |                 |
| P4B-T4 document-order display |        | (👁 no shuffle) |

## Part C — Badging

| Test                      | Result | Notes                           |
| ------------------------- | ------ | ------------------------------- |
| P4C-T1 border matrix      |        | (👁 contradiction outranks nit) |
| P4C-T2 low-confidence `~` |        | (👁 reads tentative)            |

## Part D — Aggregation

| Test                          | Result | Notes |
| ----------------------------- | ------ | ----- |
| P4D-T1 same-span collapse     |        |       |
| P4D-T2 expand / group dismiss |        |       |

## Part E — Jargon allow-list

| Test                             | Result | Notes       |
| -------------------------------- | ------ | ----------- |
| P4E-T1 preset suppression        |        |             |
| P4E-T2 user dictionary + persist |        | (👁 reload) |

## Part F — `strategic_tension`

| Test                                        | Result | Notes                 |
| ------------------------------------------- | ------ | --------------------- |
| P4F-T1 tradeoff → tension not contradiction |        |                       |
| P4F-T2 teal register + dual-span            |        | (👁 hover both spans) |

## Part G — Quality ratchet

| Test                                    | Result | Notes          |
| --------------------------------------- | ------ | -------------- |
| P4G-T1 Tier 1 green in `npm test`       |        |                |
| P4G-T2 ratchet bites (regression proof) |        |                |
| P4G-T3 Tier 2 live scorecard            |        | SKIP if no key |

## Part H — Holistic

| Test                                      | Result | Notes          |
| ----------------------------------------- | ------ | -------------- |
| P4H-T1 calm-feed exit criterion (6 beats) |        | trust verdict: |
| P4H-T2 invariants under new surface       |        |                |

---

**This acceptance suite passes when:** all automated tests pass; the 👁 HUMAN beats in P4H-T1 (calm/trust verdict), P4C-T1 (contradiction outranks nit), P4F-T2 (dual-span hover), and P4B-T4 (no priority shuffle) are confirmed; the quality ratchet bites (P4G-T2); and the hard invariants (P4H-T2: closed taxonomy, no fix affordances, non-destructive budget) hold without exception. P4G-T3 may be marked **SKIP (no key / quota)** — that is not a failure of the phase.
