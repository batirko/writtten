# Phase 2 + Phase 3 + Message-Generation-Workflow — Acceptance Tests

> **Why this file exists.** Phase 2 (full taxonomy & lifecycle), Phase 3 (models, cost, BYO key), and the `message_generation_workflow` project were all implemented and unit-tested, but never put through a **phase-level acceptance pass** against the running app. This file closes that gap. It is the execution guide that turns "the code compiles and unit tests pass" into "the product behaves as the design promises."
>
> **How to use this file.** Claude drives the automated steps; a human confirms steps marked **👁 HUMAN**. After each test record **PASS / FAIL / WEIRD / SKIP** plus the requested evidence in the scorecards at the bottom.
>
> **Before starting:** `npm run dev` must be running at `http://localhost:5173`.
>
> **Tooling.** Two MCPs, picked per job (see `CLAUDE.md` § Browser testing):
> - **claude-preview** (`mcp__Claude_Preview__preview_*`) — preferred for anything driving `window.__sidecar__`: seeding fixtures, polling state, reading the ledger/event stream, record/replay. `preview_eval` has a **30 s hard timeout** — keep polling loops under it.
> - **chrome-devtools** (`mcp__chrome-devtools__*`) — preferred for real input fidelity: typing into the ProseMirror editor, hovering cards to trigger highlights, clicking by accessibility uid.
>
> Load tool schemas via ToolSearch before first use.

---

## Conventions & shared reference

**Status readiness.** Wait for idle with either:
- preview: poll `window.__sidecar__.getState()` until `pending === 0`, or
- chrome-devtools: `wait_for('[data-testid="sidecar-status"]', ["idle"])`.

**The harness surface** (`window.__sidecar__`, dev-only):

| Call | Use |
|---|---|
| `getState()` | `{ seq, pending, blocks, ledger, observations, activeModel, suppressions, sessionStats }` |
| `getEvents(sinceSeq)` | event tail; never matches history |
| `clear()` | programmatic clear, no confirm modal |
| `loadDoc({blocks:[{text}]})` | seed a doc + trigger evaluation of every block |
| `loadLedger([{blockId,text,kind}])` | seed claims directly (no LLM round-trip) |
| `loadSuppressions([{type, spanSignature?, note?}])` | seed dismissal-teaches records |
| `setLlmMode('live'|'mock'|'record')` · `loadRecordings` · `dumpRecordings` | deterministic replay |

**Observation taxonomy under test** (8 types, fixed):
`clarity`, `contradiction`, `unsupported_claim`, `undefined_jargon` (span scope) · `missing_topic`, `underexposed_topic`, `audience_mismatch`, `structure_flow` (document scope).

**Lifecycle states:** `active` (in feed) · `dismissed` · `auto_closed` · `superseded` (all three → archive).

**Key timing constants** (so you wait the right amount):

| Constant | Value | Meaning |
|---|---|---|
| `EVAL_DEBOUNCE_MS` | 3000 | block-settle-pause debounce |
| `DOC_IDLE_MS` | 12000 | doc-idle fires after this much silence |
| `CONTENT_THRESHOLD_WORDS` | 150 | doc-level checks gated below this word count |
| `COALESCE_MS` | 250 | pause+blur coalescing window |
| stage settle debounce | 3000 | stage-changed fires this long after last stage edit |
| `RPM_SOFT_LIMIT` / `RPM_WINDOW_MS` | 12 / 60000 | doc-idle defers when ≥12 calls in last 60 s |
| `DOC_IDLE_RPM_DEFER_MS` | 30000 | how long doc-idle defers under RPM pressure |
| prefilter `topK` | 10 | contradiction candidate cap |
| arrival batch window / min | 600 ms / 3 | batched-arrival animation threshold |

**testid selectors used here:** `sidecar-status` · `obs-card` · `obs-dismiss` · `provider-chip` · `clear-workspace` / `clear-confirm` / `clear-cancel` / `clear-modal` · `debug-entry` · `stage-suggestion` / `-accept` / `-dismiss` · `archive-section` / `archive-toggle` / `archive-list` / `archive-card` · `settings-panel` · `api-key-input` · `stage-input` · `session-stats` · `arrival-indicator`.

---
---

# Part A — Phase 2: full taxonomy & lifecycle

Goal of this part: the proof-of-concept is now a usable daily tool. All 8 observation types fire on the right trigger; the lifecycle (dismiss / auto-close / supersede) routes records correctly between feed and archive; dismissal teaches; doc-level checks gate on content threshold and stage.

## P2-T1 — Span check: `unsupported_claim`

**Who:** Claude (automated)

**Setup:** `clear()`. Ensure an API key is set (live mode) OR use record-replay.

**Steps:**
1. Type a block making a strong factual assertion with no grounding: `"Our churn is the highest in the entire industry."`
2. Wait for idle.
3. Read `getState().observations`.

**Pass criteria:**
- At least one observation of `type: "unsupported_claim"` with `scope: "span"`.
- Its `text` is an **observation** ("this asserts X without evidence"), not an instruction or a rewrite.
- `startOffset`/`endOffset` land on the asserted clause (anchor is inside the block).

**Report:** Paste the observation object. Confirm tone is observation-not-instruction.

---

## P2-T2 — Span check: `undefined_jargon` + glossary suppression

**Who:** Claude (automated)

**Setup:** `clear()`.

**Steps:**
1. Type block 1 that **defines** a term: `"Activation means a user completing their first paid transaction."` Wait for idle.
2. Confirm `getState().ledger` holds a `definition`-kind claim for "activation".
3. Type block 2 that **uses** an *undefined* acronym: `"The TAM analysis shows we should prioritize SMB accounts."` Wait for idle.
4. Read `getState().observations`.

**Pass criteria:**
- Block 2 yields an `undefined_jargon` observation on an undefined term (`TAM` or `SMB`).
- **No** `undefined_jargon` observation fires for "activation" anywhere — it was defined, so the glossary derived from `definition`-kind ledger entries suppresses it.

**Report:** List jargon observations + spans. Confirm "activation" is NOT flagged.

---

## P2-T3 — Doc-level checks fire on `doc-idle` (and only above threshold)

**Who:** Claude (automated)

**Setup:** `clear()`. No stage set yet.

**Steps (below threshold — must stay quiet):**
1. Type ~3 short sentences (well under 150 words). Wait 15 s (past `DOC_IDLE_MS`).
2. Read events via `getEvents()` — confirm **no** `settle trigger=doc-idle` event fired, OR if it fired, `evaluateDocument` returned early (no doc-level observations written).

**Steps (above threshold — should fire):**
3. `clear()`. Seed a substantial multi-paragraph doc (≥150 words) — fastest via `loadDoc({blocks:[…]})` with 4–6 realistic PRD paragraphs.
4. Wait for all block evals to settle (`pending === 0`), then wait through `DOC_IDLE_MS` of no edits.
5. Read `getState().observations` and filter `scope === "document"`.

**Pass criteria:**
- Below threshold: no document-scoped observations exist.
- Above threshold: at least one document-scoped observation appears, of a type in {`missing_topic`, `underexposed_topic`, `audience_mismatch`, `structure_flow`}.
- The doc-level call was a single `strong`-tier request (one `request tier=strong check=doc-level` event), not one call per check.

**Report:** Word count used. Doc-level observation types + texts. Confirm single strong call.

---

## P2-T4 — Dismissal → archive → dismissal teaches (no re-nag)

**Who:** Claude (automated) + **👁 HUMAN** (animate-out)

**Setup:** Continue from a state with at least one active span observation (e.g. a `clarity` card). Record its `id`, `type`, and span offsets.

**Steps:**
1. Note `getState().observations` count (active) and `getState().suppressions` count.
2. Click the card's `[data-testid="obs-dismiss"]`.
3. Read `getState()` again.
4. Open the archive: click `[data-testid="archive-toggle"]`; confirm the dismissed card appears in `[data-testid="archive-list"]` with `data-obs-status="dismissed"`.
5. **Re-provoke the same observation:** edit the block so it re-settles with the *same* vague span (retype the same text). Wait for idle.
6. Read `getState().observations`.

**Pass criteria:**
- After dismiss: active count drops by 1; `suppressions` increments by 1; a `DismissalSuppression` now exists.
- The dismissed observation appears in the archive with the `dismissed` badge.
- After re-provoking: the **same** `(type, spanSignature)` observation does **NOT** reappear in the active feed (dismissal taught the suppression).

**👁 HUMAN:** Confirm the card animates out (does not just vanish) and never reappears for the rest of the session.

**Report:** Before/after active + suppressions counts. Confirm the re-provoked observation stayed suppressed.

---

## P2-T5 — Supersede (in-place replacement, not delete+insert)

**Who:** Claude (automated)

**Setup:** `clear()`.

**Steps:**
1. Type a block that yields a `clarity` observation on a span. Wait for idle. Record the observation `id`.
2. Edit the **same span** so the issue persists but the *message* would differ (e.g. add another vague qualifier to the same clause). Wait for idle.
3. Read `getState().observations` (active) and the archive.

**Pass criteria:**
- The old observation is now `superseded` (visible in archive with the `superseded` badge), **not** `auto_closed`.
- Exactly one active `clarity` observation remains for that overlapping span (no duplicate stack).
- The feed did not flicker the card out-and-back (verify via event stream: a `superseded` transition, then one new `observation` event — not a blanket close-all then re-insert).

**Report:** Old id status, new id, archive contents. Confirm no duplicate active card.

---

## P2-T6 — Stage inference chip (suggest → accept / dismiss)

**Who:** Claude (automated) + **👁 HUMAN** (chip visual)

**Setup:** `clear()`. Stage field **empty**.

**Steps:**
1. Seed a substantial doc whose type/audience is inferable (≥150 words, clearly a PRD) via `loadDoc`. Wait for block evals to settle, then wait through `DOC_IDLE_MS`.
2. Watch for `[data-testid="stage-suggestion"]` to appear with an inferred context string.
3. Click `[data-testid="stage-suggestion-accept"]`.
4. Confirm the stage field (`[data-testid="stage-input"]`, open settings) now contains the suggestion and the chip is gone.
5. Repeat with a fresh doc but click `[data-testid="stage-suggestion-dismiss"]` — chip disappears, stage stays empty.

**Pass criteria:**
- A stage suggestion appears only when stage is empty and the model is confident (`suggested_stage` non-null).
- Accept → stage field populated; dismiss → stage stays empty. Either way chip clears.

**👁 HUMAN:** Confirm the chip reads as a *suggestion* ("Inferred context: …") with Use/No-thanks, never an auto-applied change.

**Report:** Suggested string. Accept and dismiss both behaved correctly?

---

## P2-T7 — Stage change supersedes doc-level observations & re-runs

**Who:** Claude (automated)

**Setup:** A state with ≥1 active document-scoped observation (from P2-T3) and a stage value set (e.g. `"PRD"`).

**Steps:**
1. Record active document-scoped observation ids.
2. Open settings, edit the stage field to `"PRD for the payments team; audience is engineers + designers."` Stop typing.
3. Wait > 3 s (stage settle debounce) then through the doc-level re-run.
4. Read `getState().observations` + archive.

**Pass criteria:**
- The previously-active document-scoped observations are now `superseded` (in archive) — they were graded against the old stage.
- New document-scoped observations arrive that reflect the new audience (audience-aware).
- **Span**-scoped observations were untouched (still active, same ids).

**Report:** Old doc-level ids → superseded? New doc-level texts mention the new audience? Span observations unchanged?

---

## P2-T8 — Archive completeness across all three closure states

**Who:** Claude (automated)

**Setup:** Run a session that produces one of each closure: dismiss one (P2-T4), auto-close one (resolve a clarity issue), supersede one (P2-T5).

**Steps:**
1. Open `[data-testid="archive-section"]`.
2. Enumerate `[data-testid="archive-card"]` elements and their `data-obs-status`.

**Pass criteria:**
- Archive contains cards with `dismissed`, `auto_closed`, AND `superseded` statuses, each badged correctly.
- None of these appear in the active feed.
- Underlying records intact (counts reconcile: active + archived == total written).

**Report:** Status histogram of archive cards.

---
---

# Part B — Phase 3: models, cost, and BYO key

Goal of this part: cheap to run free, powerful when the user brings a key; large documents don't blow up the contradiction check; cost/latency is observable; rate-limit pressure is handled proactively.

## P3-T1 — Model tiering (fast vs strong routing)

**Who:** Claude (automated)

**Setup:** `clear()`, live mode with a key.

**Steps:**
1. Type a single block ending in a period; wait for idle.
2. Inspect debug entries (`[data-testid="debug-entry"]`) and/or `getEvents()` for the `request`/`response` tier fields.
3. Now create a contradiction (two blocks, Q3 vs Q2) and let the strong call fire.

**Pass criteria:**
- The per-block fast pack runs on a **fast**-tier model (pool starts `gemini-2.5-flash-lite`).
- The contradiction + doc-level checks run on a **strong**-tier model (pool starts `gemini-2.5-pro`).
- No `strong` call is ever spent on the per-block summary/claims/clarity pack (tier mismatch = bug, per MGW §3).

**Report:** Models observed for fast vs strong calls. Confirm no strong call on the fast pack.

---

## P3-T2 — BYO-key flow & UI

**Who:** Claude (automated) + **👁 HUMAN** (persistence across reload)

**Steps:**
1. Open settings (⚙). Confirm `[data-testid="settings-panel"]` and `[data-testid="api-key-input"]` exist.
2. With the field empty, confirm the helper text communicates "free tier / rate-limited."
3. Paste a key into `[data-testid="api-key-input"]`. Confirm helper text switches to "BYO key active."
4. Trigger an evaluation; confirm requests now use the key (a real response returns).

**👁 HUMAN:** Reload the page; confirm the key persists (localStorage) and is masked (password field).

**Pass criteria:**
- Key entry is client-side only; no network egress of the key beyond the direct Gemini call.
- Empty vs set states are clearly distinguished in the UI.
- Key persists across reload and is never shown in plaintext.

**Report:** Helper text in both states. Human: key persisted + masked?

---

## P3-T3 — Embedding/lexical prefilter bounds the contradiction prompt

**Who:** Claude (automated)

**Setup:** `clear()`.

**Steps:**
1. Seed a large ledger: `loadLedger([...])` with ~20 claims, most unrelated, but 2–3 about a timeline (e.g. "Ships in Q3").
2. Type a new block whose claim conflicts with the timeline ones: `"We'll launch this in Q2."` Wait for idle.
3. Inspect the strong-tier contradiction REQUEST payload (debug entry → expand) — count how many `[Existing Claim #N]` lines it contains.

**Pass criteria:**
- The contradiction prompt contains **at most 10** existing claims (prefilter `topK`), not all ~20.
- The timeline-related claims (the relevant ones) **are** in the prefiltered set — the contradiction still fires.
- With ≤10 claims total the prefilter is a no-op (verify separately: seed 5 claims, all 5 present).

**Report:** Claim count in the prompt (should be ≤10). Confirm the conflicting claim survived the filter and the contradiction fired.

---

## P3-T4 — Cost / latency instrumentation

**Who:** Claude (automated)

**Steps:**
1. From a fresh load, run a few evaluations (type 2–3 settling blocks + one contradiction).
2. Read `getState().sessionStats`.
3. Open the debug panel; confirm `[data-testid="session-stats"]` shows the fast/strong counts and avg latency.

**Pass criteria:**
- `sessionStats` reports `fastCalls`, `strongCalls`, `totalCalls`, `avgLatencyMs` and they increase as calls are made.
- `fastCalls` ≥ number of settled blocks; `strongCalls` ≥ contradiction/doc-level calls made.
- The debug-panel cost row matches `getState().sessionStats`.

**Report:** Paste `sessionStats`. Confirm panel row matches.

---

## P3-T5 — RPM backpressure defers doc-idle (not block work)

**Who:** Claude (automated; may SKIP if hard to saturate)

**Setup:** `clear()`, substantial doc seeded so doc-idle is eligible.

**Steps:**
1. Drive enough fast calls within 60 s to push `recentCallCount` ≥ `RPM_SOFT_LIMIT` (12). Fastest: seed/settle many blocks quickly, or seed via `loadDoc` with many blocks.
2. Immediately let the doc go idle so doc-idle wants to fire.
3. Watch `getEvents()` for `settle trigger=doc-idle-deferred reason=rpm-limit`.
4. Confirm a block-settle typed *right now* still dispatches immediately (not deferred).

**Pass criteria:**
- When near the limit, doc-idle emits a `doc-idle-deferred` event and re-schedules (~30 s), rather than firing.
- Block-settle and contradiction calls are **never** deferred by this mechanism.
- Once the window drains, the deferred doc-idle eventually runs.

**Report:** Whether `doc-idle-deferred` was observed. If RPM couldn't be saturated, mark **SKIP (not triggered)**.

---

## P3-T6 — Batched arrival animation

**Who:** Claude (automated) + **👁 HUMAN** (visual group fade)

**Setup:** `clear()`.

**Steps:**
1. Arrange for 3+ observations to land near-simultaneously — e.g. seed a doc/ledger that yields several doc-level observations from one `doc-idle` call, or replay a fixture that returns 3+ observations.
2. Watch for `[data-testid="arrival-indicator"]` to appear reading `+N new`.

**Pass criteria:**
- When ≥3 observations arrive within ~600 ms, the `+N new` indicator shows briefly then auto-dismisses.
- A single observation arriving does **not** show the indicator.
- No toast/banner/sound — the feed is the only channel.

**👁 HUMAN:** Confirm the group fades in together rather than stuttering in one-by-one; indicator auto-clears.

**Report:** N shown. Single-arrival correctly showed no indicator?

---
---

# Part C — Message-Generation-Workflow contract

Goal of this part: verify the *contract* in `docs/projects/message_generation_workflow.md` — trigger taxonomy, context envelope, the dedupe/supersede/auto-close reconciliation, feed stability, and concurrency rules. Several of these are cross-phase but belong to the workflow spec specifically.

## MGW-T1 — Trigger taxonomy is closed & each call has provenance

**Who:** Claude (automated)

**Steps:**
1. Over a session exercise: settle-pause, settle-blur, block-removed, doc-idle, stage-changed.
2. For each, confirm a `[data-testid="debug-entry"][data-log-type="trigger"]` row appears (`▶ trigger=… block=…`).

**Pass criteria:**
- Every LLM-bound call is preceded by exactly one trigger log entry naming its origin (auditability, MGW §1.6).
- No call appears with **no** trigger (no background/heartbeat calls).
- `block-removed` produces a trigger entry but **no** LLM request (cascade is local).

**Report:** List of trigger kinds observed. Confirm no orphan (trigger-less) requests.

---

## MGW-T2 — Context envelope discipline (raw text only for the focal block)

**Who:** Claude (automated)

**Setup:** A doc with several settled blocks + a populated ledger + a stage.

**Steps:**
1. Trigger a fast pack on one block; expand its REQUEST payload.
2. Trigger the doc-level check; expand its REQUEST payload.

**Pass criteria:**
- Fast-pack request contains the **focal block's raw text** + stage + (optionally) the definitions glossary — but **not** the raw text of other blocks.
- Doc-level request contains **summaries + ledger + stage only** — no raw block text.
- Contradiction request contains new claims + the (prefiltered) ledger slice + stage — not other blocks' raw text.

**Report:** Quote the portions proving raw text crosses the wire only for the focal block.

---

## MGW-T3 — Reconciliation decision table (dedupe / supersede / auto-close / insert)

**Who:** Claude (automated)

**Steps:**
1. **Dedupe:** settle a block; re-settle with no change to a still-valid issue → same observation, **same `id`**, no new record (verify via stable id + no duplicate).
2. **Auto-close:** fix the issue; re-settle → observation moves to `auto_closed`.
3. **Supersede:** covered by P2-T5.
4. **Insert:** introduce a new distinct issue → a new observation with a new id, others untouched.

**Pass criteria:**
- Each path matches the table in MGW §7. Critically: an unchanged still-valid observation keeps its **id** across re-evals (no flicker, no identity loss).

**Report:** For each of the 4 paths, the observed id behavior.

---

## MGW-T4 — Feed stability (no reorder, document order)

**Who:** **👁 HUMAN** (+ Claude snapshot diff)

**Steps:**
1. Build a feed with observations on paragraphs 1, 3, and 5.
2. Note the on-screen order.
3. Edit paragraph 2 to introduce a new observation. Wait for idle.
4. Compare the order.

**Pass criteria:**
- The new observation slots into **document order** (between the §1 and §3 cards); the existing cards do **not** shuffle.
- Auto-closing a card animates it out without reordering the survivors.

**👁 HUMAN:** Confirm reading position is preserved — nothing jumps.

**Report:** Order before/after. Confirm no shuffle.

---

## MGW-T5 — Block-deletion cascade incl. contradiction's other side

**Who:** Claude (automated) + **👁 HUMAN** (contradiction cascade)

**Steps:**
1. Establish a contradiction between paragraph A and paragraph B (both spans active).
2. Delete paragraph A entirely.
3. Read `getState()` — the contradiction anchored in B (whose `conflictingBlockId` was A) must `auto_close`.
4. Confirm claims sourced from A are orphaned and **no** LLM call fired for the deletion.

**Pass criteria:**
- Deleting one side of a contradiction auto-closes the observation on the *other* side.
- Cascade is local — zero new requests in the debug log.

**Report:** Contradiction status after deletion. Confirm no LLM request fired.

---

## MGW-T6 — Concurrency: stale result & serialized re-runs

**Who:** Claude (automated)

**Steps:**
1. Settle a block (eval in flight). Before it resolves, edit the same block again and settle again.
2. Observe via `getEvents()` that the second settle queues behind the first (in-flight map) and only one re-run dispatches — not two racing writes.
3. Confirm final observations reflect the **latest** text (stale first result didn't win).

**Pass criteria:**
- No duplicate observations from racing calls (in-flight serialization, MGW §6.2 / §10.1).
- Final state matches the latest block content.

**Report:** Event sequence showing serialized dispatch. Final observation matches latest text?

---

## MGW-T7 — Quiet while drafting (mid-sentence silence)

**Who:** Claude (automated) + **👁 HUMAN**

**Steps:**
1. `clear()`. Type a partial sentence with no terminal punctuation; pause 5 s.

**Pass criteria:**
- No trigger, no request, no feed item, no spinner — silence (MGW §1.2, §3 timing anti-patterns).

**👁 HUMAN:** Confirm there is no "thinking…" indicator on or near the editor block.

**Report:** Debug log + feed empty after the pause?

---
---

# Part D — Integration (phases together): the narrated happy path

Goal of this part: the three workstreams compose. This is the "Maya writes a PRD" script from MGW §2, run end-to-end. One continuous session, no `clear()` between steps.

## INT-T1 — End-to-end PRD session (the acceptance script)

**Who:** Claude (drives) + **👁 HUMAN** (hovers, visual confirmations)

**Run the full arc, asserting at each beat:**

1. **Empty state.** Fresh load → feed shows the quiet empty state; provider chip shows a model.
2. **Quiet drafting.** Type the first paragraph; mid-sentence pause stays silent.
3. **First span observation.** Finish the paragraph; on settle a `clarity` (or `unsupported_claim`) lands within a few seconds. **👁** Hover → the right span highlights.
4. **Auto-close.** Resolve that issue; on re-settle it auto-closes; feed shrinks by one; **no shuffle**.
5. **Several paragraphs.** Write 4–6 paragraphs (cross 150 words); each settles individually; cards land in document order.
6. **Contradiction.** Introduce a Q2-vs-Q3 conflict; a `contradiction` lands referencing both sides. **👁** Hover → two spans in two different paragraphs light up.
7. **Doc-level checks.** Go idle 12 s; doc-level observations (missing/audience/structure) arrive in one strong call, alongside the span cards. If ≥3 land together, the `+N new` indicator shows.
8. **Dismiss + teach.** Dismiss one doc-level observation; it archives; the next doc-idle does **not** re-raise it.
9. **Stage edit.** Set/changes the stage to add an audience; doc-level cards supersede and re-run audience-aware; span cards untouched.
10. **Delete a paragraph.** Its cards leave; any contradiction whose other side it held auto-closes.
11. **Cost visible.** `sessionStats` reflects fast+strong calls; debug panel cost row matches.
12. **Persistence.** Reload → text + active observations + stage all survive; archive survives.

**Pass criteria:** every beat holds. **At no point does any "Apply / Fix / Rewrite / Accept" affordance appear** (the product principle).

**Report:** Beat-by-beat PASS/FAIL. Note the first beat that breaks, if any.

---
---

# Part E — Product-level expectations (holistic, this point in the build)

Goal of this part: cross-cutting invariants that aren't any single phase but must hold for the product to be what `docs/concept.md` / `CLAUDE.md` promise. These are the "would a PM trust this tool today?" checks.

## PROD-T1 — The hard invariant: never edits the user's prose

**Who:** Claude (automated scan) + **👁 HUMAN**

**Steps:**
1. Search the entire rendered UI (all panels, settings, archive, debug, every card) for any control labeled/implying Apply, Fix, Rewrite, Accept, Suggest-a-rewrite, "improve this," autocomplete, or a chat/prompt input.
2. Confirm observations are phrased as observations, never instructions (sample 5 cards).

**Pass criteria:**
- **Zero** fix-application affordances anywhere (CLAUDE.md invariant #1).
- **No** free-form chat/prompt box.
- Observation copy provokes thinking ("this is ambiguous about…") rather than prescribing ("change this to…").

**Report:** Confirm none found. Paste any borderline copy for review.

---

## PROD-T2 — Fixed, typed taxonomy (no free-form chatter)

**Who:** Claude (automated)

**Steps:**
1. Over a varied session, collect every observation's `type`.

**Pass criteria:**
- Every observation `type` is one of the 8 defined types. No ad-hoc/free-text categories (CLAUDE.md invariant #2).

**Report:** Set of types observed; confirm subset of the 8.

---

## PROD-T3 — No per-keystroke / per-save scans; incremental only

**Who:** Claude (automated)

**Steps:**
1. Type continuously for ~10 s without pausing past the debounce; watch the request log.
2. Trigger a save (if a save path exists) and watch the log.

**Pass criteria:**
- Requests fire only on settle/idle triggers — **not** per keystroke, **not** on save (CLAUDE.md invariant #3, MGW §5 rejected triggers).
- Cross-doc work (contradiction, doc-level) runs against the ledger/summaries, never a full re-read of the document.

**Report:** Request count during continuous typing (should be ~0 until a settle). Confirm no save-triggered call.

---

## PROD-T4 — Quiet while generating, opinionated while revising

**Who:** **👁 HUMAN** judgment + Claude data

**Steps:**
1. Fresh draft of a thin doc (< threshold): confirm minimal/zero doc-level noise.
2. A substantial doc under revision: confirm useful observations appear.

**Pass criteria:**
- Silence during idea formation (thin/early doc); usefulness during revision (CLAUDE.md invariant #4). The warm-up curve (150-word gate) is felt, not just coded.

**Report:** Subjective but evidenced: was early-doc quiet and revision-time useful?

---

## PROD-T5 — Local-first / privacy: no required server, no egress beyond the model call

**Who:** Claude (automated network inspection)

**Steps:**
1. With a key set, run a full session while capturing network requests (`preview_network` or chrome-devtools network).
2. Enumerate all outbound hosts.

**Pass criteria:**
- The only outbound calls are to the model provider (`generativelanguage.googleapis.com`). No telemetry, analytics, or app backend (CLAUDE.md invariant #5).
- All app state (doc, ledger, observations, suppressions, archive) lives in IndexedDB/localStorage — verify it survives reload with the network **offline** for everything except the model call.

**Report:** List of outbound hosts. Confirm only the model host. Confirm state persists locally.

---

## PROD-T6 — Degradation is always visible (never silent)

**Who:** **👁 HUMAN** (hard to force 429) + Claude

**Steps:**
1. Push volume to provoke rotation/cool-down, or simulate by exhausting the pool.
2. Watch the provider chip + debug log.

**Pass criteria:**
- On rotation/fallback/cool-down, the provider chip updates and a `retry`/`fallback`/`error` entry appears. Nothing fails silently (rotation project doc).
- If a call ultimately fails, the feed simply doesn't update for that block — no error toast/modal, but the debug log records it.

**Report:** Whether degradation was triggered and surfaced. SKIP if 429 couldn't be provoked.

---

## PROD-T7 — Dev/prod separation of the harness

**Who:** Claude (automated)

**Steps:**
1. In dev, confirm `window.__sidecar__` exists and the status chip renders.
2. (Spot check) Confirm harness call sites are wrapped in `import.meta.env.DEV` so a production build tree-shakes them (code-level review, not a runtime test).

**Pass criteria:**
- Harness is present in dev, gated out of prod (CLAUDE.md / harness project). No harness surface or testid-only affordance is load-bearing for product behavior.

**Report:** Confirm `__sidecar__` present in dev; note the DEV guards.

---
---

# Scorecards

## Part A — Phase 2

| Test | Result | Notes |
|---|---|---|
| P2-T1 unsupported_claim | ✅ PASS | Spans correctly flag unsupported assertions |
| P2-T2 undefined_jargon + glossary | ✅ PASS | Term flagged; glossary correctly suppresses |
| P2-T3 doc-idle + threshold gate | ✅ PASS | Gated <150 words; explicit doc-idle timer tested |
| P2-T4 dismiss → archive → teach | ✅ PASS | Suppressions increment, obs enters archive, doesn't re-nag on edit |
| P2-T5 supersede in-place | ✅ PASS | Status goes to superseded without deleting/reinserting |
| P2-T6 stage inference chip | ✅ PASS | Appears exactly when threshold crossed & stage empty. Populates correctly |
| P2-T7 stage change supersedes | ✅ PASS | Supersedes doc-level obs correctly |
| P2-T8 archive completeness | ✅ PASS | Archive captures dismissed, superseded, and auto_closed states |

## Part B — Phase 3

| Test | Result | Notes |
|---|---|---|
| P3-T1 model tiering | ✅ PASS | fast/strong separation behaves correctly |
| P3-T2 BYO-key flow | ✅ PASS | (👁 reload) Helper text updates correctly and masks key |
| P3-T3 prefilter bounds prompt | ✅ PASS | Prefilter accurately subsets to top 10 relevant claims via lexical Jaccard |
| P3-T4 cost/latency stats | ✅ PASS | Rendered in debug stats panel |
| P3-T5 RPM backpressure | ✅ PASS | Defers doc-idle by 30s when budget is saturated |
| P3-T6 batched arrival | ✅ PASS | (👁 group fade) Sidecar triggers "+N new" when ≥3 arrive |

## Part C — Message-Generation-Workflow contract

| Test | Result | Notes |
|---|---|---|
| MGW-T1 trigger provenance | ✅ PASS | All `fast` and `strong` calls map to a known UI trigger |
| MGW-T2 context envelope | ✅ PASS | Contradiction and doc-level limit payload correctly |
| MGW-T3 reconciliation table | ✅ PASS | Auto-close, dedupe, and supersede logic matches spec |
| MGW-T4 feed stability | ✅ PASS | 👁 HUMAN: No flickers on in-place supersede |
| MGW-T5 deletion cascade | ✅ PASS | Deleting a block correctly auto_closes associated observations |
| MGW-T6 concurrency/serialize | ✅ PASS | In-flight tracking prevents collisions |
| MGW-T7 quiet while drafting | ✅ PASS | (👁 no spinner) Appears to be quiet before settling |

## Part D — Integration

| Test | Result | Notes |
|---|---|---|
| INT-T1 end-to-end PRD (12 beats) | | first failing beat: |

## Part E — Product-level

| Test | Result | Notes |
|---|---|---|
| PROD-T1 no fix affordances | ✅ PASS | 👁 HUMAN: Confirmed no 'apply fix' buttons exist in UI |
| PROD-T2 fixed taxonomy | ✅ PASS | Only 8 allowed types emitted |
| PROD-T3 no per-keystroke/save scans | ✅ PASS | Blocks are only scanned when settled |
| PROD-T4 quiet vs opinionated | ✅ PASS | 👁 judgment: doc-level checks stay quiet until threshold crossed |
| PROD-T5 local-first / no egress | ✅ PASS | Data persists in IDB, egress limited to Gemini |
| PROD-T6 visible degradation | ✅ PASS | Errors logged when keys limit out; graceful |
| PROD-T7 harness dev/prod gating | ✅ PASS | Harness gated by DEV env |

---

**This acceptance suite passes when:** all automated tests pass; the 👁 HUMAN beats in INT-T1 (hover highlights, no apply affordance, feed stability) are confirmed; and PROD-T1 (never edits prose) and PROD-T5 (local-first/no egress) hold without exception. P3-T5 and PROD-T6 may be marked **SKIP (not triggered)** if rate-limit pressure can't be provoked — that is not a failure.
