---
status: done
kind: spec
phases: [1, 2, 3]
summary: The contract between editor, evaluator, model router, and sidecar feed — when observations are generated, what context the LLM sees, how the feed behaves, and what the user feels.
---

# Message Generation Workflow

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Phase scope:** Phase 1 ✅ · Phase 2 ✅ · Phase 3 ✅ **Summary:** End-to-end model of _when_ observations are generated, _what context_ the LLM sees, _how_ the feed behaves as new messages arrive on top of old ones, and _what the user feels_ sitting in front of it.

This document is the contract between the editor, the evaluator, the model router, and the sidecar feed. If you change anything that breaks the rules below — trigger conditions, context envelope shape, lifecycle transitions, feed ordering — update this file first.

Read alongside:

- `docs/concept.md` (the _why_ — provoke-don't-prescribe, quiet-while-generating).
- `docs/features.md` (the taxonomy and lifecycle states).
- `docs/architecture.md` (the incremental pipeline, claim ledger, model router).
- `docs/projects/model_rotation_and_debugging.md` (cost / rate-limit constraints the queue must respect).

---

## Phased Plan

| Phase       | Contribution                                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1** | Codify the trigger taxonomy; introduce the **context envelope** (stage + master-summary stub + the block); switch the pre-eval "clear and replace" behavior to **supersede / dedupe**; serialize per-block evaluations. |
| **Phase 2** | Add **doc-idle** and **stage-change** triggers; wire **doc-level checks** (`missing_topic`, `audience_mismatch`, `structure_flow`) onto those triggers; integrate `dismissed` and `superseded` archive states.          |
| **Phase 3** | Eval **queue with cost budget** and rate-limit awareness; embedding-based prefilter for contradiction candidates; dismissal-teaches suppression injected into prompts; observation-arrival batching in the UI.          |

---

## Todo

### Phase 1

- [x] Define the **trigger taxonomy** in code (`EvalTrigger` discriminated union) and route `Editor.tsx` through a single `scheduleEval(trigger)` entry point — no more two parallel paths (`onUpdate` debounce + `onSelectionUpdate` departure). → `src/services/types.ts`, `src/services/orchestrator.ts`
- [x] Implement the **context envelope** builder: stage included in fast-call user content; ledger slice passed to contradiction check; `priorSummary` available via `loadBlockSummary`. (Master summary and sibling summaries are Phase 2.) → `src/services/evaluator.ts`
- [x] Replace blanket auto-close-before-eval with **dedupe + supersede** logic so unchanged observations don't flicker out and back in. → `reconcileObservations()` in `src/services/evaluator.ts`
- [x] **Serialize evaluations per block** (in-flight map + pending queue) so a fast second settle while the first call is still pending doesn't produce racing writes and duplicate observations. → `src/services/orchestrator.ts`
- [x] On block deletion, fire a `block-removed` trigger that orphans claims and cascade-closes observations anchored to or conflicting with the removed block. → block-id diff in `Editor.tsx` + `handleBlockRemoved()` in `src/services/orchestrator.ts`
- [x] Append a single-line **trigger log** to the LLM debug panel: `▶ trigger=settle-pause block=abc123`. → `"trigger"` entry type in `src/model/logger.ts`; compact indigo row in `SidecarFeed.tsx`

### Phase 2

- [x] Add a **doc-idle trigger**: no edits anywhere in the document for ~12s → fire doc-level checks (single `router.strong` call covering missing-topic + audience + structure + underexposed_topic). → `DOC_IDLE_MS` in `src/editor/Editor.tsx`; `handleDocIdle()` in `src/services/orchestrator.ts`; `evaluateDocument()` in `src/services/evaluator.ts`
- [x] Add a **stage-change trigger**: when the user edits the stage definition, mark all doc-level observations `superseded` and re-run doc-level checks once the field re-settles. → `handleStageChanged()` in `src/services/orchestrator.ts`; stage-change debounce in `src/App.tsx`
- [x] Wire dismissal-teaches: every dismissal writes a `DismissalSuppression` record (type + spanSignature) that `reconcileObservations` checks before inserting. → `dismissal_suppressions` store in `src/store/db.ts`; suppression check in `src/services/evaluator.ts`
- [x] Move closed/dismissed/superseded out of the live feed and into the archive view; keep the underlying records intact. → archive section in `src/sidecar/SidecarFeed.tsx`; `loadObservationsForDocument` split in `src/App.tsx`
- [ ] Decide and, if warranted, implement **repetition handling for near-identical observations across different blocks** (e.g. the same boilerplate clarity note on two different vague pronouns). Prefer presentation-level grouping over any logic that suppresses a genuinely distinct span. → see [§12 Open Questions #7](#12-open-questions)

### Phase 3

- [x] Introduce an **eval queue** between the editor and the router: triggers enqueue intents, the queue deduplicates and dispatches under an RPM budget. RPM backpressure: `isNearLimit()` check defers `doc-idle` by 30s when ≥12 calls in the last 60s; block-settle and contradiction always go through immediately. → `src/model/rpmBudget.ts`, `src/services/orchestrator.ts`
- [x] Embedding-prefilter for contradiction candidate sets: lexical prefilter (Jaccard token-overlap, top-10) bounds prompt size as documents grow without Python/WASM deps. → `src/services/prefilter.ts`
- [x] **Batched arrival** in the feed: if 3+ observations land within ~600ms, animate them as a group with a "+N new" indicator rather than individual stutter fades. → `src/sidecar/SidecarFeed.tsx`

---

## 1. Principles for message generation

These are the rules everything else in this document derives from. If a proposed behavior violates one of these, the behavior is wrong — not the rule.

1. **Generation is event-driven, never timer-driven on its own.** A timer is only ever the _closing edge_ of a user action (typing → pause). The system never wakes up from an idle background timer and decides to talk.
2. **Generation happens on settled units, not on a stream.** A block must be "settled" (see [§5](#5-the-trigger-taxonomy)) before it's eligible to be evaluated. The pipeline does not see partial sentences. This is the technical realization of _quiet while generating_.
3. **Cross-document work runs on aggregates, not on raw text.** Doc-level checks (contradiction, missing-topic, audience fit) consume the **claim ledger** and **block summaries** — never a re-read of the entire document. The block currently being edited is the only block whose raw text the LLM sees in full.
4. **Persistence is the default state of an observation.** A new evaluation does not invalidate observations from prior evaluations. Each new evaluation may _close_, _supersede_, or _add to_ the existing set — but it never silently drops what came before. The feed has memory.
5. **The user is told nothing they have already waved off.** Dismissal teaches; re-nagging makes the tool feel dumb. ([§7](#7-the-observation-lifecycle-vs-new-generations))
6. **Every LLM call is auditable.** Each call carries a `trigger` reason, a content hash of the block(s) it covers, and lands in the debug log. If we cannot answer "why did this call fire," we cannot trust the system.
7. **The principle that overrides everything else:** _Provoke, don't prescribe._ No prompt in this pipeline ever asks the model for a rewrite, a corrected sentence, or a suggested fix. Prompts ask only for observations.

---

## 2. The happy path (a narrated session)

What a single user session looks like when the whole pipeline works as intended. This is the script the design has to make true.

> Maya opens the app. The editor shows the placeholder "Start writing…". The sidecar is empty: a small icon, the line _"Observations will appear here as you write,"_ and the subtext _"Quiet for now — keep going."_ The provider chip on the sidecar header reads `⚡ gemini-3.5-flash`.

> She types the first paragraph of her Q3 fraud-tooling PRD. Two sentences in, she pauses to think. **Nothing happens.** The sidecar stays quiet. She finishes the paragraph with a period and tabs into the next one.

> As her cursor leaves the first paragraph, a `block-settle-blur` trigger fires. About two seconds later, a `clarity` observation lands in the feed: _"'Improve fraud handling' is broad — what specifically?"_ It appears with a soft fade. The block in the editor is untouched; no inline squiggle, no popover.

> She hovers the observation. The relevant span in the first paragraph highlights faintly. She agrees, edits the sentence to _"Reduce false-positive fraud blocks by 30% by Q3."_ The cursor stays in the block. After ~3 seconds of no further typing, a `block-settle-pause` fires. The existing clarity observation dims to ~70%, then disappears: `auto_closed`. The feed shrinks by one. No celebration, no toast.

> She writes three more paragraphs over the next ten minutes. Each one settles individually; observations land in **document order** — the second paragraph's clarity note slots above the third paragraph's claim observation, both above where the fourth would go. The feed never shuffles.

> In paragraph 4 she writes _"This will ship in Q2."_ About four seconds after she settles that block, a `contradiction` observation lands referencing both her Q3 commitment from paragraph 1 and the new Q2 claim. She hovers it — **both spans light up**, in two different paragraphs. She fixes Q2 → Q3. The observation auto-closes the moment the new block-settle fires.

> She gets a Slack ping and alt-tabs away. The window blurs while her cursor is in paragraph 5. The orchestrator schedules a `block-settle-blur` but **defers dispatch** until the window regains focus, so no work happens against text she's already mentally moved on from. When she comes back two minutes later and the doc regains focus, the eval runs.

> A few minutes in, she hasn't typed for about fifteen seconds. A `doc-idle` trigger fires. One `strong`-tier call covers `missing_topic`, `audience_mismatch`, and `structure_flow` against her summaries + ledger + stage. Two new observations land at the top of the feed, in a pinned "About this document" group: _"No mention of rollout plan — typical for a PRD"_ and _"Section 3 reads more like a status update than a spec."_ Her existing span observations are untouched.

> One of those — the missing-rollout one — she disagrees with. She clicks the dismiss `×`. It animates out. Behind the scenes a suppression record gets written. The next doc-level run will not re-raise it, and the system prompt for that run will include a line: _"User has dismissed missing_topic:rollout_plan — do not re-raise."_

> She deletes paragraph 2 entirely. Its two observations leave the feed quietly. A contradiction in paragraph 5 that referenced a claim from paragraph 2 also auto-closes — its other side is gone.

> She edits the stage field from `"PRD"` to `"PRD for the payments team, audience is eng + design."` The two doc-level observations clear themselves out (they were graded against the old stage). About fifteen seconds later — after the stage field settles and the next `doc-idle` fires — three new doc-level observations arrive, this time _audience-aware_.

> Network drops mid-call. The active provider chip pulses and a small `AI cooldown` indicator appears next to it; no error toast, no modal. The feed doesn't update for that block. When the network returns, the orchestrator silently retries from its queue. She doesn't notice it happened, but the LLM debug panel shows the retry / fallback events.

> She finishes the doc. She exports to Markdown and pastes into Linear. The whole session: she wrote every word herself, the sidecar caught a real contradiction and made her fix it, and at no point did the tool offer to write or rewrite a sentence.

The happy path is the acceptance script. If any step in it doesn't hold, something in [§5](#5-the-trigger-taxonomy)–[§11](#11-edge-cases-worth-getting-right-early) is broken.

---

## 3. Undesired and confusing behaviors

Anti-patterns. Each is something the system **must not do**, with the reason it's harmful framed from the user's seat. Some are corollaries of the principles in [§1](#1-principles-for-message-generation); listing them explicitly here because they're the failure modes we'll drift toward without active resistance.

### Generation timing

- **Observations appearing mid-sentence.** The user is still forming the thought. Critiquing it interrupts thinking and trains the user to wait for AI approval before completing a sentence — the exact offloading we're built to prevent.
- **Observations on a one-line block with three words.** Too thin to be meaningful; the user reads it as the AI grasping for something to say.
- **A spinner over the block being evaluated.** Implies the AI is editing the block. The block belongs to the user; the AI works on the side.
- **A "thinking…" indicator that lingers for many seconds.** Communicates anxiety and pressures the user to wait. The sidecar's stance is _quiet, not busy_.
- **An eval firing while the window is backgrounded.** Wastes a call against text the user has already moved on from; the result may be stale on return.
- **An eval firing on every keystroke or every save.** Violates the hard invariants in `CLAUDE.md`.
- **A background scan with no user-action origin.** No heartbeat. If we can't name a trigger from [§5](#5-the-trigger-taxonomy), the call should not happen.

### Feed behavior

- **The feed reordering itself when an observation arrives or closes.** Reading position is lost; the user has to re-scan to find where they were.
- **A new observation replacing an existing one with no visual continuity.** A clarity note on the same span morphs into a different message and the user wonders whether the original was wrong, fixed, or hallucinated. (Use `superseded` with in-place replacement and a brief highlight, not delete + insert.)
- **An observation disappearing and reappearing across re-evals.** The hash + dedupe path exists specifically to prevent this; if it flickers, the dedupe rule is wrong.
- **Toast popups, banner notifications, or sound for new observations.** The feed is the only channel; anything else makes the tool feel like an inbox.
- **A "(3) new" badge that requires a click to reveal items.** Hidden state. Items land directly; a group fade-in is enough.
- **Loading skeletons in the feed.** The feed is either silent or has content. Skeletons imply an obligation to produce something, which contradicts _quiet by design_.

### Lifecycle & memory

- **A dismissed observation coming back later in the same session.** The fastest way to make the tool feel dumb. (See dismissal-teaches in [§7](#7-the-observation-lifecycle-vs-new-generations) and [§9](#9-llm-economy-batching-and-the-context-envelope).)
- **An observation closing when the user fixes something _adjacent_ but not the issue itself.** Symptom of treating any edit-to-the-block as resolution. Resolution must be tested against the observation, not assumed.
- **An observation referencing a span the user already deleted.** The span anchor was lost. Auto-close on collapse is mandatory — wired via the `ObservationHighlighter` collapse detector (fires `onObservationCollapsed` when a highlighted span's decoration is deleted, without waiting for a re-eval). _(This was dead until `lifecycle_integrity` L2, 2026-06-13: the obs id lived only in the decoration's `attrs`, but the detector reads it off `spec` — so it never fired.)_
- **A contradiction observation whose two sides highlight the same paragraph.** Either the model misread the input or the orchestrator confused focal block with conflicting block. Should never reach the feed.
- **All observations on a block being wiped and regenerated whenever the user types a typo fix.** The blanket-close-then-replace path. The Phase 1 fix in this doc.

### Surface area & affordances

- **An "Apply suggestion," "Rewrite this," "Fix it for me," or "Accept" button anywhere in the UI.** The product principle. Never, in any phase, for any reason.
- **A chat input where the user can ask the AI to write something.** There is no prompt box; the AI is reactive to the document.
- **A "Re-scan document" button.** Kills the sidecar magic, per `docs/architecture.md`. The temptation will return; hold the line.
- **An "AI is now thinking about your whole document…" status banner.** Doc-level checks should land their results, not announce their intent.
- **An "explain this observation in more detail" expansion that calls the LLM again.** Turns the sidecar into a chatbot through the back door.
- **Suggesting the next sentence, autocomplete-style.** The product is the inverse of this.

### Context & cost

- **Sending the entire document as raw text on every call.** The pipeline operates on summaries + ledger for cross-doc work specifically to avoid this.
- **Spending a `strong` call to evaluate a single sentence.** Tier mismatch; signal of an orchestrator bug.
- **Firing identical calls back-to-back because two triggers raced.** The in-flight map and coalescing window exist to prevent it.
- **Silently degrading model quality without surfacing it.** When rotation/fallback fires, the provider chip must reflect it.

### Communication style

- **Observations written as instructions** (_"Rewrite this to be clearer."_) rather than observations (_"This is ambiguous about who 'they' refers to."_). Prompts must produce the latter.
- **Vague non-observations** (_"Consider revising this section."_) — true of any text, therefore useless. If the model can't say _what_ is off, the observation shouldn't fire.
- **Multiple observations of the same type firing on the same span at once.** Pick the strongest; supersede the rest before showing.
- **Hedged language that erodes trust** (_"This might possibly perhaps be unclear?"_). Observations are claims about the text; they should be confident or absent.

---

## 4. The user-perceptible behavior model

What the user should feel, in plain language, before we talk about plumbing:

- **While I'm typing this sentence:** silence. Not "loading," not "thinking" — silence. The sidecar's empty/quiet state should communicate that this is on purpose.
- **The moment I move on** (cursor leaves the paragraph, I hit `.` and pause, I tab away to read what I wrote): the AI starts looking. A subtle inline indicator on the sidecar header (a faint pulse on the active provider chip) signals work is happening. No spinners on the block itself.
- **A few seconds later** observations for that block land in the feed. They appear; they don't _replace_. Anything in the feed from earlier blocks stays where it was. The feed grows; it does not shuffle.
- **I edit something I wrote earlier.** The observations on that block fade visually for ~300ms while a re-eval runs, then either stay (still relevant), disappear (auto-closed), or get visually replaced in-place (superseded — same anchor span, fresher message).
- **I delete a paragraph entirely.** Its observations leave the feed quietly. So do any observations _elsewhere_ whose other side was a claim in that paragraph (contradictions, for example) — they auto-close because their referent is gone.
- **I dismiss a message.** It animates out and never comes back. The same shape of message about the same span or term does not return.
- **I haven't touched anything in 15 seconds and the document is substantial.** The AI takes the opportunity to look at the whole thing — doc-level checks fire in a single batched call. New doc-level observations land in the feed alongside the existing span observations.
- **I edit the stage definition.** All existing doc-level observations clear themselves out (they were graded against the old stage); span-level observations are untouched.

**Feed stability is sacred.** Reordering a list the user is reading is jarring. New items append; closed items animate out; nothing shuffles. (See [§8](#8-the-feed-as-a-surface).)

---

## 5. The trigger taxonomy

Every LLM-bound call originates from exactly one of these triggers. The set is closed; new triggers go here first, with a written reason and an estimated cost. The current `Editor.tsx` mixes two trigger paths (typing-pause debounce in `onUpdate`, cursor-departure in `onSelectionUpdate`) — Phase 1 unifies them behind one `scheduleEval(trigger)` entry point.

```ts
type EvalTrigger =
  | { kind: "block-settle-pause"; blockId: string; reason: "terminal-punc+idle" }
  | { kind: "block-settle-blur";  blockId: string; reason: "cursor-departed-block" }
  | { kind: "block-settle-blur";  blockId: string; reason: "window-blurred" }
  | { kind: "block-removed";      blockId: string }
  | { kind: "block-paste";        blockIds: string[]; reason: "large-paste" }
  | { kind: "doc-idle";           reason: "no-edits-15s+content-threshold" }
  | { kind: "stage-changed" }
  | { kind: "manual-rescan" };          // explicit user gesture, Phase 4+; not now
```

### What each trigger does

| Trigger              | Fires when…                                                                                              | What runs                                                                                                         | Tier           |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| `block-settle-pause` | Block ends in terminal punctuation, meets min length, no typing in this block for `EVAL_DEBOUNCE_MS`.    | Merged fast call (summary + claims + span checks) **on that block only**; contradiction check if claims change.   | fast + strong  |
| `block-settle-blur`  | Cursor leaves the block, or the window blurs while cursor was in a block (catch the user who tabs away). | Same as above. De-duped with any pending `pause` timer for the same block.                                        | fast + strong  |
| `block-removed`      | A previously-known `blockId` no longer exists in the document tree.                                      | Orphan its claims; cascade-close observations that depended on those claims (no LLM call required).               | none           |
| `block-paste`        | A paste introduces N new blocks at once (heuristic: ≥2 new blockIds in one transaction).                 | Enqueue a `block-settle-pause` per new block, but coalesce into a single multi-block fast call.                   | fast (batched) |
| `doc-idle`           | No edits anywhere for `DOC_IDLE_MS` and the doc is past the content threshold (~150 words).              | Single `strong` doc-level call: missing-topic + audience + structure on summaries + ledger.                       | strong (rare)  |
| `stage-changed`      | The stage field re-settles (debounced like a block).                                                     | Mark all doc-level observations `superseded`; queue a `doc-idle` re-run.                                          | strong         |
| `manual-rescan`      | Explicit user gesture. **Not implemented; flagged because we will be tempted.**                          | Same as `doc-idle`. **Avoid building this** — a "rescan" button kills the sidecar magic (`docs/architecture.md`). | strong         |

### Triggers we explicitly reject

- **Per-keystroke evaluation.** Already forbidden by the hard invariants in `CLAUDE.md`.
- **Save-triggered evaluation.** Save is silent and background — surfacing AI work on save trains the user to associate save with "AI thinks now," which is exactly the wrong mental model.
- **Time-of-day / scheduled scans.** The product is reactive to user action. No background heartbeat.

---

## 6. The orchestrator: turning triggers into calls

Today, `Editor.tsx` calls `evaluateBlock()` directly from two places. Phase 1 puts an **orchestrator** in front of the evaluator.

### Responsibilities

1. **Single entry point.** All triggers funnel into `scheduleEval(trigger)`.
2. **In-flight map per block.** If a `block-settle-*` trigger arrives for a block whose evaluation is already running, the orchestrator marks the in-flight call as "stale on completion" and queues exactly one re-run with the latest text. This prevents the race where two settles dispatch two parallel calls and both write observations.
3. **Coalescing window.** Within a short window (~250ms) multiple triggers for the same block collapse to one. The `pause` + `blur` double-fire is the common case.
4. **Cost-aware queueing (Phase 3).** Under rate-limit pressure (cool-down registry from the model rotation project), the orchestrator picks the highest-value trigger to dispatch next: contradiction adjudication > span checks on the most-recently-settled block > doc-level checks.
5. **Trigger provenance.** The dispatched LLM call includes `{trigger, blockId(s), envelopeHash}` in the debug log entry — see [Principles §6](#1-principles-for-message-generation).

### Cancellation rules

- `block-removed` cancels any pending `block-settle-*` for that block.
- `stage-changed` cancels any pending `doc-idle`; it will be re-queued.
- `doc-idle` is cancelled by _any_ new edit, even an edit that doesn't itself trigger a block settle.

---

## 7. The observation lifecycle vs. new generations

This is where today's evaluator src/services/evaluator.ts:75-81 is wrong. It blanket-closes every active observation that touches the block before running the new eval. Three failure modes:

1. **Flicker.** A real, still-valid observation disappears for the duration of the eval and reappears — the feed visibly jitters.
2. **Identity loss.** The "reborn" observation has a new `id`, so hover state, scroll position, any UI affordance pinned to that observation is lost.
3. **Dismissal forgetting.** If the user dismissed an observation, the close-then-regenerate path can produce a fresh observation with a new id that the dismissal suppression list doesn't recognize. (This is also what dismissal-teaches has to defend against — but the root cause is here.)

### The replacement model: dedupe + supersede

For each observation produced by a new evaluation, compare to the active set on the same `blockId`:

| Comparison vs active set                                | Action                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Same `(type, anchor span, normalized message)`          | **Dedupe** — keep the existing one; do not write a new record. |
| Same `(type, anchor span)`, different message           | **Supersede** — mark the old `superseded`; insert the new one. |
| Same `type`, _overlapping_ span, message differs        | **Supersede** the overlapped one; insert the new one.          |
| New type / new span                                     | **Insert** new observation.                                    |
| Active observation has no counterpart in new evaluation | **`auto_closed`** — the issue went away.                       |

The dismissed-suppression list takes precedence over insert: if a new observation's `(type, span signature)` matches a dismissal record, **don't write it**.

### Block deletion cascade

When `block-removed` fires:

- All claims sourced from that block → `orphaned`.
- All observations _anchored to_ that block → `auto_closed`.
- All observations _whose `conflictingBlockId` is this block_ → `auto_closed` (contradiction's other side is gone).
- All observations in other blocks whose _referenced ledger entry_ was sourced here → re-evaluate the holding block on next settle, or `auto_closed` immediately if cheap to determine.

### The "memory" property

The feed accumulates state across many evaluations. The invariant: **the set of observations the user sees is the union over time of `active` observations minus `dismissed`, `auto_closed`, `superseded` — never a per-run snapshot.** This is what makes the sidecar feel like a continuous collaborator rather than a stateless linter.

---

## 8. The feed as a surface

The behavior described in [§4](#4-the-user-perceptible-behavior-model) imposes constraints on the feed renderer.

### Ordering (resolved 2026-06-03, Phase 4 Milestone E)

**Priority governs membership; document-order governs display.** Two separate concerns:

1. **Budget selection (by priority):** `partitionFeed()` in `src/sidecar/feedBudget.ts` sorts all active observations by `priority` descending and takes the top-N (default N=7) as the visible set. This is *selection*, not display — it decides which observations are in the main feed vs. the "also noticed" drawer.

2. **Display (document-order):** within each group (visible or also-noticed), observations are sorted by the document position of their anchor block (top-of-doc first), then by `startOffset`. Document-scoped observations (no `blockId`) sort to the bottom of their group. A newly-arriving observation slots into its natural document position — **the rest of the feed does not shuffle** (feed stability preserved).

3. **Contradiction floor:** every active `type === "contradiction"` observation is always in the visible set regardless of the budget. The user may dismiss it; dismissed observations leave the budget calculation.

4. **"Also noticed" drawer:** overflow observations below the budget live in a collapsed drawer (`data-testid="also-noticed-drawer"`) below the main list. These are real active observations with full hover/dismiss behaviour — they are never dropped, just deprioritised.

Open-Q#1 (*"doc-order or recency?"*) is **resolved**: document-order. Open-Q#2 (pinned "About this document" group for doc-scoped observations) remains a styling refinement for a later phase.

### Arrival animation

- A single observation arrives → 200ms fade-in.
- Multiple arrive within 600ms (Phase 3 batched-arrival) → group fade-in with a brief "+3 new" indicator on the feed header that auto-dismisses.

### Re-evaluation visual

While a block is being re-evaluated, its existing observations dim to ~70% opacity and the corresponding ledger-derived chip (if shown) gets a subtle indeterminate-progress underline. On evaluation completion, the dim lifts. **No spinners**.

### Active-provider chip

Already exists (SidecarFeed.tsx:54-58). Promote it: when the active provider changes mid-session (rotation/fallback fired), pulse the chip briefly so the user notices that quality may have shifted, per the rotation/debugging project doc.

### What never happens in the feed

- No "Apply" / "Fix" / "Rewrite" / "Accept suggestion" button. Ever. (`CLAUDE.md`, the hard invariant.)
- No priority-shuffle on update — existing cards don't move when a new observation arrives or an old one closes. Observations slot into document position; the rest hold their place.
- No global spinner during evaluation.
- No "Re-scan document" button.
- No toast popups for new observations — they live in the feed only.

---

## 9. LLM economy, batching, and the context envelope

The biggest wins in observation quality come from giving the model the _right_ context, and the biggest wins in cost come from _not_ sending context it doesn't need. Today, the evaluator sends only the raw text of the block being evaluated plus, for contradiction, a flat list of other claims. That's enough for Phase 1 — but it's already leaving signal on the floor.

### The context envelope

Every evaluation builds an **envelope** describing what the model gets to see. Envelope shape per trigger:

```ts
interface ContextEnvelope {
  // Always:
  stage?: string;                          // current stage definition, if any

  // Block-scoped triggers add:
  block?: {
    id: string;
    text: string;                          // raw text of the focal block
    priorSummary?: string;                 // last known summary, for diff-aware prompts
  };

  // Cross-document checks add (summaries, not raw text):
  docContext?: {
    masterSummary?: string;                // doc-level rollup, when it exists
    siblingSummaries?: Array<{             // top-N most-relevant other-block summaries
      blockId: string;
      summary: string;
    }>;
    ledgerSlice?: ClaimLedgerEntry[];      // active claims, optionally prefiltered (Phase 3)
  };

  // Always at the tail:
  suppressions?: Array<{                   // dismissal-teaches
    type: ObservationType;
    spanSignature?: string;
    note?: string;
  }>;
}
```

### What goes in for each check

| Check                                                              | What it sees                                                                                               | What it does **not** see                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Block fast pack (summary + claims + clarity)                       | The block (raw) + stage + (Phase 2) one-line _master summary_.                                             | Other blocks' raw text. Other blocks' claims.   |
| `unsupported_claim` (Phase 2)                                      | The block + stage. _Optionally_ the ledger slice in case the support is elsewhere in the doc.              | Other blocks' raw text.                         |
| `undefined_jargon` (Phase 2)                                       | The block + stage + a small running glossary derived from `definition`-kind ledger entries.                | Other blocks' raw text.                         |
| `contradiction`                                                    | New claims from the focal block + the active ledger slice + stage. (Phase 3: embedding-prefiltered slice.) | Raw text of any block other than the focal one. |
| `missing_topic` / `audience_mismatch` / `structure_flow` (Phase 2) | Stage + master summary + sibling summaries + ledger.                                                       | Raw text of any block.                          |

The discipline: **raw text crosses the wire only for the block being evaluated.** Everything else is summary-level. This bounds cost and latency as documents grow, and keeps doc-level checks composable.

### Batching that's worth doing

- **Within a block:** already done (summary + claims + clarity merged into one structured-output call — see `model_rotation_and_debugging.md` §Phase 1).
- **Across doc-level checks:** Phase 2 — `missing_topic`, `audience_mismatch`, `structure_flow` are all looking at the same envelope (summaries + ledger + stage). Run them as one `strong` call returning a structured response with three top-level keys. One call instead of three.
- **Across blocks on paste:** when `block-paste` fires with N new blocks, batch their block-fast-pack calls — _but_ still as N separate prompts (each block needs its own summary/claims/clarity output). Send them on a single rotation cycle to avoid hammering the RPM budget.

### Batching that's not worth doing

- Combining contradiction checks across multiple blocks into one prompt. The model loses focus and the structured output gets noisy. Keep contradiction one-focal-block at a time.
- Sending raw text of multiple blocks in one prompt to "give the model context." Summaries do this job for an order of magnitude less cost.

### Master summary maintenance

A first-class object as soon as Phase 2 begins. Built lazily on the first `doc-idle` trigger after content-threshold, then maintained incrementally: when a block's `priorSummary` changes materially, the master summary is updated by a _small_ fast call that takes the old master summary + the changed block summary and returns the new master summary. The master summary is the cheapest possible mechanism for giving doc-level checks shared context.

### Dismissal-teaches as prompt input

Each `suppressions[]` entry becomes a line in the system prompt: _"The user has previously dismissed clarity observations on the term 'activation' — do not re-raise."_ This is cheap (a few tokens), unambiguous (a fixed sentence pattern), and works for any model.

---

## 10. Concurrency, ordering, and consistency

The pipeline is async and the user keeps editing while calls are in flight. The orchestrator from [§6](#6-the-orchestrator-turning-triggers-into-calls) handles per-block races, but several cross-cutting cases need explicit rules:

1. **Stale evaluation result arrives after the block has been edited again.** Discard the result. Detect via content hash: the envelope carries the block's content hash; on completion, compare against the current hash. Mismatch → drop.
2. **Stale result arrives after the block has been deleted.** Drop and no-op. The cascade from `block-removed` has already cleaned up.
3. **Two doc-level calls scheduled (idle + stage-change in quick succession).** Cancel the earlier one; only the latest envelope dispatches.
4. **Contradiction check using a ledger slice that has changed underneath.** Tolerable: the contradiction either still resolves (the existing claim is still there) or fails to resolve (the referenced existing claim is gone — drop just that contradiction observation).
5. **Persistence ordering.** Always: write claims/summaries first, then write observations. Observations may reference ledger IDs; the inverse ordering is a race.

---

## 11. Edge cases worth getting right early

- **Undo across a settled block.** Undo doesn't fire a fresh `onUpdate` text event in some ProseMirror setups — verify it does, or wire undo/redo to `scheduleEval` explicitly with a `block-settle-pause` trigger.
- **A block's text reverts to a hash we've evaluated before.** The hash short-circuit already handles this: we don't re-call the LLM. We _do_ need to make sure that any observations we had at that hash are restored — currently observations are deleted on auto-close, so a revert won't bring them back. Acceptable for v1; flagged for later.
- **Empty / near-empty block after delete.** Already retire summary + claims and stop; observations on the block cascade-close.
- **Stage definition is the empty string.** Treat as "no stage." Doc-level checks that depend on stage stay silent (`missing_topic`, `audience_mismatch`). Span-level checks still run.
- **Window blur in the middle of typing.** `block-settle-blur` fires; that's correct behavior — the user has left, this is a settle moment.
- **Paste that contains a contradiction _internally_ (the pasted material disagrees with itself).** The orchestrator's per-block ordering will catch it on the second pasted block's settle. No special-case needed.
- **The user pastes the entire doc into a fresh editor.** Treat as N `block-settle-pause` triggers from `block-paste`. The master summary build (first `doc-idle`) will fire shortly afterward and put doc-level checks into play.
- **A block contains only a question** ("What's the right pricing model?"). Today this still meets terminal-punctuation + min-length, so the fast pack runs. Claims extraction should yield nothing; clarity may or may not fire. Acceptable — but a future `question` claim-kind could let the model treat open questions distinctly.

---

## 12. Open questions

These are real disagreements or unknowns. Each should be resolved before the relevant phase ships, not before this doc lands.

1. **Feed ordering: doc-order or recency?** This doc recommends doc-order primary, recency secondary, for feed stability. The cost is that a doc-level observation arriving "now" doesn't visually announce itself as new. Resolve before Phase 2 ships doc-level checks.
2. **Where do document-scoped observations sit in a doc-ordered feed?** Pinned top, pinned bottom, or interleaved at the position of their most-relevant anchor? Recommendation: pinned top in a small "About this document" group, separated by a divider.
3. **`doc-idle` duration.** 10–15s feels right; the right number is "long enough that the user has clearly stopped, short enough that they get useful feedback before context-switching away." Tune in dogfooding.
4. **Should `block-settle-blur` from `window-blurred` actually fire?** Arguments for: catches the user who alt-tabs away without moving the cursor. Arguments against: surfacing observations while the window is _backgrounded_ is wasted work — the user won't see them until they return, and by then the eval may already be stale. **Tentative answer:** schedule the eval, but delay dispatch until the window regains focus. Cheap to implement.
5. **How aggressive should dismissal-teaches be?** Per-exact-span is safe; per-term ("activation") is helpful but might over-suppress; per-type globally is over-suppression. Probably ship per-span + per-term, never per-type-globally.
6. **Manual rescan button.** Forbidden by `docs/architecture.md` as a kill of the sidecar magic. The temptation will come back the first time a user wants to "force a re-check." Hold the line.
7. **Repetitive observations across different spans/blocks.** Because clarity runs independently per block, near-identical notes can surface for genuinely _different_ spans — e.g. two sentences each with a bare pronoun yield _"'This' is vague…"_ and _"'this' is vague…"_, and two bare quarters yield _"'Q2' is ambiguous… no year"_ / _"'Q3' is ambiguous… no year"_. Each is individually correct (distinct block, distinct span), so the within-block dedupe in [§7](#7-the-observation-lifecycle-vs-new-generations) — which only compares against the active set on the _same_ `blockId` — never touches them; to the reader they still feel like the tool repeating itself. (Observed live during Phase 1 T6 verification — see `docs/acceptance-testing/phase1-results.md`.) The tension: cross-block suppression risks hiding a genuinely distinct unclear span, which cuts against _provoke, don't prescribe_; doing nothing lets boilerplate-phrased notes stack up and reads as noise. Candidate levers, none yet chosen: **(a)** collapse/group repeated _same-type, same-template_ notes in the **feed** as a presentation concern only — every anchor still highlights, nothing is dropped; **(b)** diversify clarity-prompt phrasing so identical wording becomes itself a merge signal; **(c)** a soft per-doc cap on how many instances of one clarity pattern surface at once, the rest available on demand. **Recommendation:** prefer (a) — presentation-level grouping that never discards an observation — over any logic that silences a real span. Resolve before Phase 2 hardens the feed/lifecycle.

---

## 13. Acceptance signals

How we know this design is working, end-to-end, without writing a metrics layer:

- During fresh drafting, the feed is silent and the user does not feel watched.
- The moment a paragraph settles, observations arrive within a few seconds and stay put.
- Editing a paragraph never makes the feed shuffle.
- A real contradiction across two paragraphs lights up both spans on hover; resolving one side closes the observation without the user clicking anything.
- A dismissed observation does not come back for the rest of the session.
- After a 15-second pause on a 300-word doc, doc-level observations appear in the feed alongside the existing ones — without re-running any span checks.
- Pulling the network plug and continuing to type produces no errors visible to the user — only a quiet "AI cooldown" indicator on the provider chip.
