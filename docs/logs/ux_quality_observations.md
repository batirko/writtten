---
status: idea
phases: [5]
summary: Living log of observed UX quality issues (interfaces, behaviors, actions, workflows, etc.) — accumulates across test sessions until a dedicated UI/UX remediation sprint is warranted.
---

# UX Quality Observations

## Status

> Canonical status lives in the frontmatter. This is an accumulation file, not a feature spec. It is never "done" — new observations get appended as testing reveals them; the status flips to `in-progress` when a remediation sprint is scheduled.

**How to use this file:** Any time a test session or manual evaluation reveals a UX issue—such as a confusing interface element, an unexpected behavior, a clunky workflow, or an action lacking proper affordance—add an entry to the **Observation Log** section below. Include: the area or component involved, the user's interaction context, the expected behavior, and what actually happened. Brief is fine — the goal is accumulation, not polish.

When enough entries cluster around the same failure mode or interface area, pull them into a **Failure Pattern** and eventually into the remediation Todo.

> **Synthesis:** several of these UX issues share a root cause with prompt/architecture issues (e.g. archive context and choreography depend on the reconciliation-engine fix). The cross-cutting analysis lives in `docs/projects/quality_remediation_synthesis.md`. New raw observations still land here; the synthesis is where they get grouped and sequenced.

---

## Phased Plan

| Phase   | Work                                                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5       | Scheduled UX remediation sprint: batch-fix accumulated UX failure patterns, update UI components, and refine workflows (e.g., interaction mechanics, visual style, empty states). |
| Ongoing | Any session — add UX observations as they are found. No code change; just append an entry.                                                                                        |

---

## Todo

### Next remediation sprint

- [ ] **Unanchored observations visual treatment** — Design a pattern for "document-level" feedback so it feels intentional, rather than like a broken highlight. (See UX-001)
- [ ] **Archive context** — Design a UX pattern to show the "ghost" of what text triggered an archived observation, so they aren't disconnected from the document. (See UX-002)
- [ ] **Feed prioritization transparency** — Add visual cues (like severity badges or confidence scores) to explain why certain messages are promoted to the primary feed while others go to the "also noticed" drawer. (See UX-003)
- [ ] **Editor formatting affordances** — Add visible text formatting controls (e.g., a floating selection toolbar, a slash-command menu, or a fixed formatting panel) to improve discoverability of editor capabilities. (See UX-004)
- [ ] **Jargon allowlist scope** — Remove the user-facing "Suppress jargon alerts" control from the settings panel for now, as it belongs in a future account/project-level settings scope. (See UX-005)
- [ ] **Reverse-hover affordance** — Implement a bi-directional link so hovering highlighted text in the editor surfaces or summarizes the corresponding observation(s) from the sidecar. (See UX-006)
- [ ] **Feed choreography** — Implement visual transitions (animations, highlights, or "new" states) when the feed updates so users don't have to manually rescan to spot changes. (See UX-007)
- [x] **No evaluator-internal IDs in message copy** — forbid `Claim #N`-style index references in contradiction/tension `message` text; the model should quote or restate the claim's own words instead. Prompt-level fix, pairs with OBS-031's paraphrase-fidelity fix. (See UX-017.) **Done 2026-07-06:** all four contradiction prompts forbid index/label references in `message`; guarded by a numbered-label lint (`/\bclaim\s*#?\s*\d+/i`) over every produced contradiction/tension message in `evalRatchet.test.ts`. Shipped together with OBS-031's fidelity fix.
- [ ] **Observation quotes** — Add a small snippet of the referenced text as a subtitle to observation cards to improve scanning speed without requiring a hover interaction. (See UX-008)
- [ ] **Observation auto-scroll & split-context** — Implement auto-scrolling the editor when focusing a card, and design a solution (e.g., floating portal) for viewing distant spans simultaneously in a contradiction. (See UX-009)
- [ ] **Smart Feed vs Manual Control (Design Project)** — Draft a new project spec to explore lightweight user controls for the feed (sorting, filtering, warnings vs. suggestions) that respect the "lean/smart interface" philosophy without becoming a traditional settings-heavy dashboard. (See UX-010)
- [ ] **Archive closure reasoning** — Add explanatory context (e.g., a "Reason" field or tooltip) to auto-archived messages indicating exactly why the system decided to retire them. (See UX-011)
- [x] **Parallel block-completion trigger** — fire a section eval on paragraph completion (Enter after a settled block), in parallel with the 3s pause timer, so finished paragraphs are picked up promptly. Shipped 2026-07-02 as the `block-settle-completion` trigger; `docs/mechanics/evaluation-triggers.md` §2 updated. (See UX-013; `docs/plan.md` Phase 6.)
- [ ] **Doc-level fit on short drafts** — let structurally-complete short drafts earn gentle doc-level "how it fits" observations via maturity-aware severity (R2) rather than the hard 150-word `doc-idle` gate. (See UX-013; rides `docs/projects/maturity_aware_severity.md`.)
- [x] **Revert-aware evaluation** — content-hash snapshot/restore (Mechanism 2, 2026-07-04) so a change-and-revert (or Ctrl-Z, or no-op formatting) leaves zero net observation churn, plus a section-boundary commit debounce (Mechanism 1, 2026-07-06) so the transient re-sectioning never reaches the model — a toggle→revert now fires zero calls. (See UX-014; spec `docs/projects/revert_aware_evaluation.md`.)
- [x] **Blend priority into feed display order** — high-priority observations (incl. unanchored doc-scoped ones) should rise toward the top instead of being pinned to the bottom by document order. Realize as priority bands with document-order within each band, re-ranked only on eval-settle. Revises `message_generation_workflow.md` §8. (See UX-015; composes with R2c/R2/R4.) **Shipped 2026-07-03:** `partitionFeed` "Key issues" band (`KEY_BAND_MIN_PRIORITY` 1.0) above the low-severity band, document-order within each; move-animation + band divider deferred to Visual/R2c.

---

## Observation Log

Each entry follows the format:

```
### UX-NNN — <short title>
**Date:** YYYY-MM-DD
**Area/Component:** editor | sidecar | archive | modal | ...
**Interaction:** (what the user was trying to do)
**Expected:** (what should have happened visually/behaviorally)
**Actual:** (what happened)
**Failure mode:** visual-glitch | confusing-affordance | jarring-transition | accessibility | ...
**Notes:** (any context or related constraints)
```

---

### UX-001 — Unanchored observations (missing topics) lack distinct visual treatment

**Date:** 2026-06-04\
**Area/Component:** sidecar / editor\
**Interaction:** Viewing doc-level `missing_topic` observations.\
**Expected:** Observations about _missing_ content should be visually distinct from span-level observations, clearly communicating to the user that this feedback applies to the whole document rather than a specific highlighted phrase.\
**Actual:** The observation is presented, but without highlighted text it may look like a broken highlight rather than an intentionally unanchored doc-level observation.\
**Failure mode:** ux-confusion / missing-affordance\
**Notes:** Migrated from OBS-008. Because `missing_topic` evaluates what _isn't_ there, it cannot anchor to text. If these look exactly like standard observations but just lack a highlight, it feels like a bug to the user. We need a design pattern for "document-level" or "unanchored" feedback so it feels intentional.

---

### UX-002 — Archived messages lack document context

**Date:** 2026-06-04\
**Area/Component:** archive\
**Interaction:** Viewing the Archive tab to understand past observations.\
**Expected:** An archived message should provide context about what text it originally highlighted or what state the document was in when it fired, so the user can understand why it was flagged.\
**Actual:** Archived messages are disconnected from the document. The user cannot figure out what parts of the document they were about.\
**Failure mode:** ux-confusion / missing-context\
**Notes:** Migrated from OBS-011. When an observation is superseded or dismissed, the archive just shows the message. Without the original anchored text or a snapshot of the document state, the archive becomes a confusing list of disembodied critiques. We need a UX pattern to show the "ghost" of what text triggered the archived observation.

---

### UX-003 — Opaque prioritization between primary feed and "also noticed"

**Date:** 2026-06-04\
**Resolved:** 2026-06-04 (R7a — `impact-badge` dot in `SidecarFeed.tsx`)\
**Area/Component:** sidecar\
**Interaction:** Viewing the active observation feed.\
**Expected:** The user should intuitively understand why certain messages are promoted to the primary feed and others are demoted to an overflow ("also noticed") section.\
**Actual:** The sorting logic is entirely opaque. There is no UX transparency or visual indicator to explain the prioritization.\
**Failure mode:** ux-confusion / missing-affordance\
**Notes:** Fixed by adding a 6px severity/confidence dot (`data-testid="impact-badge"`) between the type tag and dismiss button on each card. Colour matches the existing kind×severity border-left palette. Tooltip explains "High severity · high confidence — surfaced in main feed" vs "lower priority — shown below budget" for cards in the "also noticed" drawer.

---

### UX-004 — Lack of formatting controls for text

**Date:** 2026-06-04\
**Area/Component:** editor\
**Interaction:** Trying to format text (e.g., bold, headings, lists) while drafting or revising.\
**Expected:** The user should have clear affordances to format text, either via a global formatting panel, a slash-command menu (like Notion's `/`), or a floating toolbar upon text selection.\
**Actual:** There are no visible formatting controls, leaving users reliant entirely on invisible markdown shortcuts or assuming formatting isn't supported.\
**Failure mode:** missing-affordance / feature-gap\
**Notes:** Rich text formatting is essential for PRDs. While the underlying TipTap editor may support markdown shortcuts, the lack of visible UI controls creates a steep learning curve and limits discoverability of supported formatting options.

---

### UX-005 — Jargon allowlist control feels out of scope for a single-session tool

**Date:** 2026-06-04\
**Area/Component:** sidecar (settings panel)\
**Interaction:** Discovering or using the "Suppress jargon alerts for" textarea in the settings.\
**Expected:** The settings panel should only contain controls that make sense for an ephemeral, single-session workspace.\
**Actual:** The jargon allowlist feels like an account-level or project-level setting. Because the app currently has no concept of saved documents or accounts, configuring a custom dictionary here feels like "too much" cognitive load for the current scope.\
**Failure mode:** feature-bloat / scope-mismatch\
**Notes:** While suppressing jargon false-positives is functionally important, surfacing the user-dictionary control right now is premature. It makes more sense to rely entirely on the hardcoded presets for this phase, and reintroduce the user-facing control later when there is a proper concept of accounts, saved projects, or workspace-level settings.

---

### UX-006 — Missing reverse-hover affordance from text to observation

**Date:** 2026-06-04\
**Area/Component:** editor / sidecar\
**Interaction:** Hovering over highlighted text in the editor to see why it was flagged.\
**Expected:** The user should see a summary of the messages relevant to that text (e.g., a tooltip, or scrolling/highlighting the relevant card in the sidecar feed).\
**Actual:** The flow only works one way (hovering the sidecar card highlights the text). Hovering the text does nothing to indicate _which_ observation caused the highlight, forcing the user to visually hunt for the corresponding card in the feed.\
**Failure mode:** missing-affordance / interaction-gap\
**Notes:** This bidirectional link is crucial for long documents where the relevant observation card might be scrolled out of view. We need to implement a hover state on the text decorations that either triggers a visual popover summary or scrolls the relevant feed card into view.

---

### UX-007 — Feed updates lack visual choreography (change blindness)

**Date:** 2026-06-04\
**Area/Component:** sidecar (feed)\
**Interaction:** Watching the observation feed update after a draft evaluation.\
**Expected:** The UI should provide visual indications (animations, highlights) of what exactly changed—which messages are new, which were archived, and which moved due to priority changes.\
**Actual:** The feed updates instantly. Because there is no motion or highlight choreography, the user experiences change blindness and must manually rescan the entire feed to figure out what is different.\
**Failure mode:** visual-transition / cognitive-load\
**Notes:** We need to implement entering/exiting animations and perhaps a temporary "new" or "updated" visual state (like a subtle flash or a badge) for freshly modified cards to guide the user's eye.

---

### UX-008 — Observation cards lack quoted text context for fast scanning

**Date:** 2026-06-04\
**Area/Component:** sidecar (observation card)\
**Interaction:** Reading observation cards in the feed.\
**Expected:** The user should be able to instantly understand what text the observation refers to without having to hover and look over at the main editor.\
**Actual:** The card only contains the feedback text. The user has to trigger the hover state and move their eyes to the editor to know what the feedback is talking about.\
**Failure mode:** missing-context / scanning-friction\
**Notes:** Adding a small, stylized quote of the target text as a subtitle on the observation card would drastically improve scanning speed and reduce eye travel.

---

### UX-009 — Missing auto-scroll and split-context for out-of-view highlights

**Date:** 2026-06-04\
**Area/Component:** editor / sidecar\
**Interaction:** Hovering or clicking on an observation card when the referenced text is scrolled out of view.\
**Expected:** The editor should automatically scroll smoothly to bring the referenced text into view. Furthermore, for cross-document checks (like contradictions) where the two spans are far apart, there should be a UI affordance to see both simultaneously.\
**Actual:** The user must manually scroll the editor while keeping their mouse hovered over the card to find the highlighted text. For distant contradictions, it is impossible to see both sides of the conflict at the same time.\
**Failure mode:** missing-affordance / interaction-gap\
**Notes:**

1. **Basic fix:** Implement an auto-scroll or "jump to" mechanic when focusing an observation card.
2. **Complex edge-case:** For contradictions with distant spans, sliding to one span and showing the other in a floating portal, or rendering a split-view, is necessary to actually compare the conflicting text.

---

### UX-010 — Tension between "smart feed" budgeting and user desire for manual control

**Date:** 2026-06-04\
**Area/Component:** sidecar (feed logic / philosophy)\
**Interaction:** Managing cognitive load when viewing many observations.\
**Expected:** The "smart feed" budgeting (priority ranking, truncating to a budget, "also noticed" overflow) should effortlessly present the most relevant information without requiring manual configuration.\
**Actual:** The user desires more manual control—filtering out certain types, sorting, toggling between "warnings" (always visible) and "suggestions" (hidden but accessible), or explicit limits like "just show me the top 5". There's a growing friction between the product's zero-config "smart" philosophy and practical usability needs.\
**Failure mode:** philosophy-tension / feature-gap\
**Notes:** This touches on the core UX philosophy of the app. Maintaining a lean interface that avoids manual tweaking is a goal, but we may need to introduce lightweight, opinionated controls (e.g., a "top 5 only" toggle or explicit warning vs. suggestion groupings) to give users agency without overwhelming them with complex filters. This requires a dedicated design project to resolve the tension between smart curation and user control.

---

### UX-011 — Opaque reasoning for auto-archived messages

**Date:** 2026-06-04\
**Area/Component:** archive / feed lifecycle\
**Interaction:** An active observation is automatically moved to the archive.\
**Expected:** The user (and a developer debugging the system) should understand _why_ the message was archived. Was it because the user's edit successfully resolved the issue? Was the underlying text deleted? Or was it superseded by a newer, similar observation?\
**Actual:** The message simply disappears from the active feed and lands in the archive marked as `auto_closed` or `superseded` without any explanatory context or reasoning.\
**Failure mode:** ux-confusion / missing-context\
**Notes:** To build trust, the system needs to explain its lifecycle decisions. A small tooltip or subtitle in the archive explaining the closure reason (e.g., "Resolved by edit", "Superseded by newer observation", "Underlying text removed") would drastically improve both the user experience and developer debuggability.

---

### UX-012 — Stage-change wipes all document-level observations as `superseded`, even on first stage suggestion

**Date:** 2026-06-25\
**Area/Component:** sidecar / feed lifecycle (`handleStageChanged`)\
**Interaction:** Accepting the model's auto-suggested stage. The first `doc-idle` graded the doc with no stage set, produced ~10 document-level observations, and returned `suggested_stage: "Product Requirements Document for internal stakeholders"`. The user accepted that suggested stage.\
**Expected:** Accepting a stage the model just inferred from the current content should not invalidate observations that were graded against that same content. At most, the notes refresh in place (kept by id where still true), the way the `doc-idle` reconciler does.\
**Actual:** The `stage-changed` trigger fired and `handleStageChanged` ([`src/services/orchestrator.ts:381`](../../src/services/orchestrator.ts)) blindly marked **all 10** active `scope: "document"` observations `superseded` (`actor: system`), then re-ran doc-quality from scratch. The follow-up call carried **no** "Prior document-level observations" block (the priors had just been archived 1ms earlier), so the resolution-aware dedup had nothing to match — and re-emitted essentially the same set ("out of scope not defined", "rollout plan absent", "metrics before problem", "objective stated redundantly", …) as brand-new cards with new ids. From the user's seat: ~10 cards appeared and vanished within ~65s without any edit, and the archive filled with `superseded` notes that were never addressed.\
**Failure mode:** false-supersession / churn / jarring-transition\
**Notes:** This is the `stage-changed` counterpart to the bug fixed for `doc-idle` in `docs/projects/doc_scope_reconciliation.md` (Tier 1 best-match + grace; Tier 2 / D2 resolution-aware regeneration). That work repaired the `doc-idle` reconcile path but **left `handleStageChanged` on the original Phase-2 "supersede everything, regenerate blind" mechanism** (`docs/projects/message_generation_workflow.md`, L51/L210). The wipe is defensible for its intended case — the user _meaningfully re-scopes the audience_ (e.g. "PRD" → "PRD for payments eng+design") so old notes are genuinely mis-graded — but wrong for the case that actually fires most: accepting the model's _own first_ stage suggestion (none → inferred PRD), where content is unchanged. Two fix directions: (1) **route stage-changed through the same resolution-aware doc reconciler** (inject priors, keep-by-id where still true, only close what the model says is resolved) instead of a blanket supersede; (2) **skip the wipe entirely when the stage transition is none→suggested** (auto-applied, not hand-edited) and just let the next `doc-idle` reconcile. Also a paid-cost smell: the wipe forces two back-to-back strong/paid doc-quality calls (~16s then ~24s) for near-identical output. Clusters with UX-002/UX-011 (archive honesty) and `doc_scope_reconciliation` D2.

---

### UX-013 — Block assessment only fires on the 3s pause; no paragraph-completion trigger, and doc-level "fit" never runs on short drafts

**Date:** 2026-07-02\
**Area/Component:** editor / eval triggers (`src/editor/Editor.tsx`, `docs/mechanics/evaluation-triggers.md`)\
**Interaction:** Writing a draft ("Writing in age of AI") paragraph by paragraph under a single heading — finishing a paragraph, pressing Enter, and starting the next.\
**Expected:** Finishing a paragraph and starting a new line should assess that block promptly — and, ideally, show how it fits the overall document — rather than only reacting after the user stops typing.\
**Actual:** Only the 3s typing-pause settle (`settle-pause`) ever fired (confirmed in the session log: every section call is `settle-pause` on the same `sectionId`). Two structural reasons: (1) a "section" is a heading + all its body blocks, so pressing Enter to start a new paragraph **stays inside the same section** and never trips the cursor-departure trigger — there is no paragraph-/block-completion trigger, so nothing fires until the pause; (2) the doc-level "how it fits overall" pass (`doc-idle`) is gated behind **≥150 words**, and the draft was under that, so it never ran at all.\
**Failure mode:** trigger-latency / unreachable-feedback (feels unresponsive; the "fit" affordance is invisible on short docs)\
**Notes:** Current config: `EVAL_DEBOUNCE_MS` 3s (typing-pause), cursor-departure (only across sections), `DOC_IDLE_MS` 12s gated at `CONTENT_THRESHOLD_WORDS` 150. **Decisions (2026-07-02, with the user):** (a) **add a parallel block-completion trigger** — on Enter after a settled paragraph (terminal punctuation + min length gates preserved, to respect Invariant #4), fire the section eval immediately, in parallel with the 3s pause timer (coalescing + hash short-circuit keep it cheap). (b) The doc-level "fit" half is **tied to document maturity, not a hard word gate** — a structurally-complete short draft should earn gentle doc-level fit observations via the maturity-aware severity (R2) work, rather than being silenced by the 150-word cliff. Both scheduled in `docs/plan.md` Phase 6; the trigger addition must update `docs/mechanics/evaluation-triggers.md` on build.

---

### UX-014 — A change-and-revert (no-op edit) triggers a full eval cascade, churn, and wasted paid calls

**Date:** 2026-07-02\
**Area/Component:** editor / eval orchestrator + lifecycle (`src/editor/Editor.tsx`, `src/services/orchestrator.ts`, `src/services/evaluator.ts`)\
**Interaction:** Toggled the first paragraph to H1 and immediately reverted it back — a net-zero change to the document text.\
**Expected:** A change that is undone should cost (near-)nothing: pending analysis for the intermediate state cancelled, and anything already produced for it unwound when the document returns to its prior state. Toggling a block type and reverting should leave the feed exactly as it was.\
**Actual:** The toggle split the single section into two (a heading opens a new section), which fired a cascade: cursor-departure evals on both sections, a **hallucinated** heading-only section eval (OBS-029) that fabricated PRD claims, a **paid `gemini-2.5-pro`** contradiction call that surfaced a garbage `strategic_tension` card, then on revert a teardown that `auto_closed` 5 observations, followed by a full **paid** doc-quality pass (6 doc-level cards + a stage auto-suggestion). Meta counts for the session: 27 calls, ~3 paid strong calls, 5 archives — for an edit that changed nothing.\
**Failure mode:** no-op churn / wasted-cost / jarring-transition\
**Notes:** Two root causes, addressed separately. **(A) the hallucination** is OBS-029 (`docs/logs/prompt_quality_observations.md` / `docs/projects/section_eval_precision.md`) — independent, must-fix. **(B) the revert-churn** is this observation: the pipeline has no notion of a _transient_ state that gets undone. **Decisions (2026-07-02, with the user): both mechanisms.** (1) **Coalesce transient structural edits** — treat a block-type toggle like typing (subject to the settle debounce), so a fast toggle→revert nets to zero and never dispatches; a _sustained_ heading still re-sections and evaluates. (2) **Content-hash snapshot + restore** — cache each section/doc eval result by its text hash; when the document returns to an already-evaluated hash (manual revert, Ctrl-Z, no-op formatting), restore the cached observation set and skip re-eval, and cancel any in-flight eval whose triggering state is no longer current. Both scheduled in `docs/plan.md` Phase 6 → see `docs/projects/revert_aware_evaluation.md`. Also a cost signal (this ran on a paid key): revert-churn wastes RPD/paid budget, links `model_rotation_and_debugging`.

---

### UX-015 — Feed display order buries the highest-priority observations (priority selects, document-order displays)

**Date:** 2026-07-02\
**Area/Component:** sidecar feed ordering (`src/sidecar/feedBudget.ts`, `partitionFeed`)\
**Interaction:** Reading the feed at the end of the 2026-07-02 session and asking whether the order is meaningful.\
**Expected:** The order the user reads should track importance — the observations most worth acting on near the top.\
**Actual:** The feed uses a **two-stage** model: **priority governs membership** (budget 7, contradiction floor/ceiling 3) but **document position governs display** (`blockId` index → `startOffset`), and **doc-scoped observations (no anchor) are pinned to the bottom** (`Infinity` index). In this session that inverted the ranking: the three `missing_topic` notes (priority **1.5** — "no user problem/audience", "no features", "no competitor positioning") rendered **last**, beneath 0.75 `clarity` nits ("non-invasive way", "native way"), because they are doc-scoped. The single highest-value cluster in the doc sat at the bottom of the feed.\
**Failure mode:** ordering / buried-signal (priority-selection correct, display inverts it)\
**Notes:** Three compounding reasons the list read as not-meaningful: (1) **budget barely bites** — ~9 groups vs budget 7, so priority-selection is nearly inert and the user effectively sees raw document order; (2) **doc-scoped observations pinned to the bottom** regardless of priority, and in this doc those were the most important; (3) **contents were mostly noise** anyway (the top `unsupported_claim` is a false positive per OBS-028), so no sort could rescue it — ordering is downstream of signal quality. Also "occurrence": the doc-scope tail (all `Infinity`/`startOffset 0`) falls back to insertion order, so that segment is occurrence-ordered while the span items above are position-ordered — a mix, which is part of why it doesn't read as intentional. **Decision (2026-07-02, with the user): blend priority into display order** — high-priority items (including unanchored doc-scoped ones) rise toward the top rather than sorting to the bottom. **This knowingly revises the Phase-4 "resolved" feed contract** (`message_generation_workflow.md` §8, resolved 2026-06-03: document-order display; "feed stability is sacred / nothing shuffles"). To preserve the stability the old rule protected, realize the blend as **priority _bands_, document-order within each band** (a "Key issues" band that high-priority doc-scoped notes rise into; within-band order stays stable document-order) — which composes with the already-scheduled "Key issues" band in `smart_feed_curation.md` (R2c) and `maturity_aware_severity.md` (R2), and re-rank only on eval-settle (not per keystroke) with move-animation, so it never shuffles under the reader's eyes. Partly mitigated independently by R4 (`doc_level_anchoring`), which gives `structure_flow`/`underexposed_topic` real anchors so they stop defaulting to the bottom; `missing_topic` stays unanchorable and is exactly what the banding is for. → scheduled in `docs/plan.md` Phase 6; revises `message_generation_workflow.md` §8.

---

### UX-016 — Strong-tier contradiction sweep silences early-draft "wow" moments due to doc-maturity gates

**Resolved:** 2026-07-18 (UX-016 residual / Phase 8A) — the editor-side word gate (`CONTENT_THRESHOLD_WORDS`, the raw 150-word cliff at `Editor.tsx:479`/`:1344`) that silenced the bulk-paste sweep on short drafts was **removed entirely**. The sweep now runs on every paste/import and gates only on its own intrinsic guards (`< 2 claims` → no model call, ledger dirty-check, RPM defer) — the sweep's real precondition, where word count was a proxy that was precisely wrong here (a short, punchy outline with a blatant conflict is low-word-count *and* high-claim-density). The exact repro string above now surfaces the contradiction on paste. Sequencing guard satisfied: OBS-030's scope-excluded tagging had already shipped (#205), so the widened sweep runs on the repaired prompt. Cost: at most one strong call per user-initiated paste yielding ≥ 2 claims (pasted sections run `skipContradiction`, so the sweep replaces per-section strong calls). Guarded by the `contradiction-short-paste` ratchet fixture + the existing `< 2 claims` no-call unit test (`evaluator.test.ts`). `src/editor/Editor.tsx`; → see `docs/projects/contradiction_coverage.md` (§ Phase 8A) · `docs/mechanics/evaluation-triggers.md` (§ "Sweep gating"). The intra-section facet was already closed by OBS-033 mechanism A (#161).\
**Date:** 2026-07-02\
**Area/Component:** sidecar / eval triggers (`src/services/evaluator.ts`)\
**Interaction:** Testing the OBS-026 intra-block contradiction fix in the browser harness by pasting a short, blatantly contradictory sentence ("The challenge window is 60 seconds. The challenge window expires in 30 seconds.") into a fresh document.\
**Expected:** The system immediately flags the obvious contradiction, providing a strong "wow" moment and confirming the fix is active.\
**Actual:** The contradiction check never ran (`strongCalls: 0`). The contradiction sweep is a document-level check, and document-level checks are gated behind a 150-word maturity threshold (`CONTENT_THRESHOLD_WORDS`) to save LLM quota on early, incomplete drafts. Because the test string was short, it never crossed the threshold, so the check was skipped silently. The user only saw a weak-tier `clarity` nit.\
**Failure mode:** unreachable-feedback / missing-hero-moment\
**Notes:** While gating strong/doc-level checks on word count saves money and reduces noise on empty drafts, it completely silences the most impressive (and structurally critical) feedback early in the drafting process when users are laying out their core arguments. If a user drops in a short, punchy outline with a blatant logical flaw, we miss the chance to catch it. This clusters with UX-013 (doc-level fit on short drafts) and suggests the maturity heuristic needs to be smarter than a hard word-count cliff—perhaps allowing certain high-signal sweeps (like contradiction) to bypass the length gate entirely when the ledger contains clear conflicts.

---

### UX-017 — "Claim #N" evaluator-internal index leaks into user-facing contradiction/tension message text

**Date:** 2026-07-05\
**Resolved:** 2026-07-06 — every message-bearing contradiction prompt (both sweep variants + both per-section variants) now explicitly forbids naming a claim by its `[Claim #N]`/`Existing Claim #N` index or bookkeeping label in `message`; it must quote/restate the claim's own words. Guarded by a numbered-label lint over all produced contradiction/tension messages in `evalRatchet.test.ts` (verified to fail on an injected `Claim #0` leak), and pre-fix leaked labels in two ratchet recordings were sanitized. Shipped with OBS-031's paraphrase-fidelity fix. `src/services/evaluatorPrompts.ts`.\
**Area/Component:** contradiction/tension card copy (`src/services/evaluatorPrompts.ts:127,145`, sweep contradiction prompt)\
**Interaction:** Reading two contradiction/tension cards on a rollout spec; one message read _"...while Claim #0 gates the feature to a specific user segment"_ and another _"...which the concurrent device retries in Claim #1 could exceed."_\
**Expected:** A message that refers back to the user's own document — a quote, a paraphrase, or a pointer to the section/sentence — never an opaque internal identifier the user has no way to decode without inspecting the ledger.\
**Actual:** The prompts (`CONTRADICTION_SWEEP_SYSTEM_PROMPT` and its hedged variant) label claims `[Claim #N]` for the model's own bookkeeping (so it can return `claimAId`/`claimBId` as structured fields) — but nothing stops the model from echoing that same `Claim #N` label inside the free-text `message` field it writes for the user. The example given in the prompt ("This contradicts the Q3 target date set earlier.") doesn't use index phrasing, but no instruction explicitly forbids it, so the model sometimes reaches for the label that's right in front of it.\
**Failure mode:** internal-implementation leak into user-facing copy (register violation — evaluator's-eye-view instead of the user's-eye-view)\
**Notes:** Purely a prompt fix: add an explicit instruction that the `message` field must never reference a claim by its index/label — it should quote or closely restate the claim's own words instead. Same session also surfaced OBS-031 (paraphrase drift) on one of these two messages — worth fixing together since both are about what the `message` field is allowed to say about a compared claim. → see `docs/logs/prompt_quality_observations.md` (OBS-031).

---

### UX-018 — A blatant contradiction between two same-section paragraphs never produces a contradiction card while typing

**Date:** 2026-07-09\
**Area/Component:** eval pipeline — contradiction detection (`src/services/evaluator.ts` per-section check, `src/services/orchestrator.ts` sweep trigger)\
**Interaction:** Typing (not pasting) a two-paragraph, heading-less doc whose two paragraphs directly contradict each other — ¶1 _"We will launch the redesigned checkout to 100% of users in Q2."_ and ¶2 _"We will not launch the redesigned checkout to any users before Q4."_ — then waiting for the feed to settle.\
**Expected:** The product's hero moment — a `contradiction` card linking the two claims, hover highlighting both spans. The whole reason to use the tool is _"it caught a contradiction I wrote."_\
**Actual:** No contradiction card. The conflict surfaced only as a weak `clarity` nit (see OBS-033 for the model trace). With no heading the doc is one intro section, so both claims are keyed under the same representative id; the per-section contradiction check excludes same-section pairs, and the all-pairs ledger sweep runs only on `block-paste`, so nothing compared them.\
**Failure mode:** missing-hero-moment / coverage-by-entry-path — the sharpest signal is silently unreachable unless the user happens to paste (long enough) or split the claims across sections.\
**Notes:** Directly clusters with **UX-016** (contradiction sweep silenced on short drafts by the maturity/word-count gate) — same "the impressive, structurally-critical check doesn't run when you'd most want it" failure, different cause. Distinct from OBS-026 (which fixed _anchoring_ of a found intra-section conflict, not detection). Design options + decision tracked in `docs/projects/contradiction_coverage.md`; prompt-side trace in `docs/logs/prompt_quality_observations.md` (OBS-033). Not to be patched inline — needs an owner decision on cost/noise/taxonomy.

---

### UX-019 — Prepending a paragraph does NOT auto-archive existing notes (verified non-repro, 2026-07-09)

**Date:** 2026-07-09\
**Verified:** 2026-07-09 — **could not reproduce; closed as expected behavior (not a bug).** Ran three clean live repros against `main` (Gemini, isolated slate, harness event stream): (1) prepending a line to the intro while an observation lived in a separate `## Details` section — the Details note stayed **active**, and the Details section's re-eval trigger dirty-checked to a no-op (untouched); (2) a same-section prepend by keyboard — the note stayed active; (3) a clean structural prepend of a brand-new first paragraph (via `insertContentAt(0, …)`) into the observed section — the re-eval fired (`pending` blipped) but reconcile **kept the observation by its anchor** (same id, still `active`). Across all three: **zero `archive` events**, no `resolved_by_edit`, no close→reactivate churn. The observation survives a prepend because `reconcileObservations` re-pairs it by `(blockId + anchorText)` and the anchor text ("significantly faster") is still present after the edit.\
**Area/Component:** section reconciliation / observation lifecycle on structural edits (`src/services/evaluator.ts` restore/reconcile, `src/editor/Editor.tsx` re-sectioning)\
**Interaction:** With active observations on an intro section, placing the cursor at the very start of the first paragraph, pressing **Enter**, and typing a new leading line ("A quick note on timing before the details.").\
**Expected:** Prepending an unrelated leading line shouldn't retire the section's still-valid observations; at most they re-anchor.\
**Actual (user-perceived, now explained):** Existing notes _appeared_ to get auto-archived on the Enter/prepend — but the harness disagrees. The original session's only archive was a legitimate `resolved_prior` (the model marking a "lacks a specific date" clarity as addressed) that fired **before** the prepend; the perceived "disappear" is the transient re-render of the card while the section re-evaluates, after which the same card returns. No note is actually retired by a prepend.\
**Failure mode:** none — expected reconcile behavior; the original report was a transient-render / timing perception, not a lifecycle defect.\
**Notes:** Kept in the log as a **verified non-repro** so the same perception doesn't get re-filed. Tangential finding from the same investigation (still true and useful): pressing Enter at the very start does **not** migrate a section's representative id (`sourceBlockId` unchanged, `orphaned: 0`) — ProseMirror keeps the original block id on the top line and gives the pushed-down content a new id — so "Enter at the start" is _not_ a reliable way to trigger a representative-id migration (the reliable trigger is a heading↔paragraph toggle; see the #146 live verification). If a future session _does_ see a note genuinely retired by a pure prepend, reopen with the harness `archive` events attached.

### UX-020 — A connecting agent can't see the app attach, so it asks the user (BYOA)

**Date:** 2026-07-20\
**Area/Component:** connect handshake — `docs/skills/writtten-agent.md` § Setup; bridge `GET /doc` (`{ connected: false }` before the first push)\
**Interaction:** Pasted the connect prompt into a Claude Code session. The agent wrote and started the bridge, confirmed the listening line, then stopped and asked the user to confirm the app had connected: _"let me know once it shows Connected and I'll pull the document"_ — and again on the next turn, _"Understood — waiting for the writtten app to flip to Connected."_\
**Expected:** Once the bridge is listening, the agent proceeds under its own steam; the connect is one paste, not a conversation.\
**Actual:** The agent has no way to _observe_ the app attaching. The skill tells it the app "will flip to Connected within a couple of seconds" but hands it nothing to check, so the safe move is to ask. Cost: an extra human round trip on every connect, and it makes a working connection feel manual and uncertain.\
**Failure mode:** missing observability on the agent side of the handshake — the fact exists (`/doc` returns `{ connected: false }` until the first snapshot push, and the bridge knows when an SSE client attached), it just isn't surfaced as something the skill tells the agent to poll.\
**Notes:** Cheap fix, prompt-side and free: the Setup section should say _poll `GET /doc` until it returns a snapshot, then begin_ — instead of "confirm the listening line" followed by nothing. That also removes a paragraph of prose, which suits the prompt-slimming milestone (`docs/plan.md` Phase 8). A bridge-side `appConnected` field on `/doc` would be the more explicit version if polling proves ambiguous. Found in the same dogfood session as the debug-log blindness and the snapshot-materiality gap.

### UX-021 — Every agent-submitted card lands at the same weight (BYOA)

**Date:** 2026-07-20\
**Area/Component:** `computePriority` (`src/services/priority.ts`) via `submitExternalObservation`\
**Interaction:** A single agent review pass submitted 7 observations across 5 taxonomy types (`unsupported_claim` ×2, `strategic_tension`, `missing_topic`, `clarity`, `underexposed_topic` ×2).\
**Expected:** Some triage signal across seven cards — the doc-scope "no success metric is set" and a low-severity wording gap should not read as equally weighted.\
**Actual:** All seven rendered **MED or LOW severity at "Medium confidence"** — visually flat. `computePriority` hardcodes `medium` except for tier-calibrated contradictions, and PR1 made the agent's own `confidence` a **downward-only clamp** (it can quiet a card, never raise it), so an external source has no path to a high-confidence card at all.\
**Failure mode:** not a defect so much as an unexamined consequence of two deliberate decisions meeting. The clamp is right — an agent must not inflate its own volume — but the floor means external output is uniformly mid, and a feed of seven mid cards is harder to triage than a feed with shape.\
**Notes:** Deliberately **not** proposing that agent confidence be trusted upward. The open question is whether the *type* should still earn its tier for external cards the way it does for ours (a `contradiction` is a Tier-A trust cost regardless of who found it), which would restore shape without handing the agent a volume knob. Interacts with the engine-exclusivity milestone: once the agent is the only engine, this flatness is the *entire* feed's shape, not a subset's. Revisit with the first real precision read on external output.

### UX-022 — A connected agent going away is silent; you have to open Settings to find out (BYOA) (fixed 2026-07-20)

**Date:** 2026-07-20\
**Status:** **fixed 2026-07-20** — `AgentDroppedNote` (`src/sidecar/SidecarFeed.tsx`) is a standing strip in the feed, exactly the recommended affordance: derived from `agentSourceSignal`, so it appears once the grace expires and clears itself the instant a background retry reconnects (verified live — bridge killed, note appeared; bridge restarted, note gone, with no user action either way). Copy adapts to whether anything else is reading: keyed, "its observations stay in your feed; writtten's own checks keep running"; keyless, "nothing is reading your document" — the statement that becomes the only one under engine exclusivity. Rendered in **system voice** (the `.trunc-note` grey rule) rather than the accent-tinted `.keyless-banner` the entry suggested: the banner's tint carries a CTA, and this state has no action to offer since the client retries unattended. `disconnected` only, never `revoked` — telling someone their agent is gone right after they disconnected it is noise, not honesty. → see `docs/mechanics/agent-bridge.md` § When the agent goes away\
**Area/Component:** connection lifecycle surfacing — `agent-chip` in `ControlCenter.tsx:1161`, inside `.control-center` (`is-open` only on `forceOpen || tapOpen`)\
**Interaction:** Ended the Claude Code session and killed its bridge process mid-document. The app detected it correctly — but the user only discovered it by opening Settings to look.\
**Expected:** Losing the thing that reads your document is a state change worth being told about, once, where you already are.\
**Actual:** The detection is right and the surfacing is missing. `dropToDisconnected` fires after `DISCONNECT_GRACE_MS = 8_000` and the client retries every `RECONNECT_INTERVAL_MS = 10_000`, so the state is accurate and blip-resistant. But the only readout is the `agent-chip`, which sits inside the hover/tap-gated control center — the code comment calls it "the always-on readout", and it is only always-on _once you open it_.\
**Failure mode:** silence about the **tool's own broken state**, which is a different thing from the product's deliberate quiet. writtten is quiet about _observations_; that is the philosophy. It must not be quiet about not working — the standing keyless banner exists for exactly this reason ("keyless the evaluator does nothing on the user's own text, and the quiet empty state would otherwise mask that"). A dropped agent is the same class: the author believes a critic is reading and it isn't.\
**Severity rises under engine exclusivity.** Today a keyed user still has the built-in evaluator running, so a dropped agent degrades the feed. Once the agent is the _only_ engine (`docs/plan.md` Phase 8), a silent disconnect means the document is being written with **nothing reading it at all** and no indication of that anywhere on screen.\
**Notes:** Recommended affordance is the standing strip, **not a toast** — same treatment as `.keyless-banner`, appearing after the grace expires and clearing itself the moment a background retry reconnects (which it already does unattended, so the notice must be self-clearing or it will outlive the problem). A toast would be an interruption for a state that persists, and would be missed by anyone not looking at that moment. The app cannot distinguish "user shut the session down" from "bridge crashed" — and does not need to: the honest message is the same either way.

### UX-023 — Pasting line-separated text into a bullet makes one item, not N items (fixed 2026-07-20)

**Date:** 2026-07-20\
**Fixed:** 2026-07-20 — `src/editor/extensions/ListPaste.ts`, guarded by `src/editor/extensions/listBehaviour.test.ts`.\
**Area/Component:** paste pipeline into list items — `listItem` content is `paragraph block*` (`@tiptap/extension-list-item`), downstream of `Markdown.configure({ transformPastedText: true })` in `src/editor/Editor.tsx`\
**Interaction:** Started a bullet, then pasted three newline-separated lines (`beta\ngamma\ndelta`) into it.\
**Expected:** Three bullets — one per line. This is what every list-bearing editor does, and what a PM pasting a list of requirements out of a doc or ticket assumes.\
**Actual:** One bullet holding three stacked paragraphs: `<ul><li><p>alphabeta</p><p>gamma</p><p>delta</p></li></ul>`. Verified live on a clean build of `origin/main` (isolated worktree, port 5199). Visually it reads as one bullet followed by unbulleted indented lines, and the block structure is wrong for eval sectioning too.\
**Failure mode:** `listItem`'s content expression legitimately admits multiple blocks, so the pasted paragraphs nest _inside_ the current item rather than splitting it into siblings. Nothing was intercepting that case; the markdown transform had already produced the right N paragraphs by then.\
**Notes:** Fixed with a `transformPasted` plugin that rewraps a run of ≥2 bare paragraphs as sibling `listItem`s when the cursor is inside a list, returned open at depth 2 so the first line merges into the current item (matching Notion) and the rest become siblings. Deliberately narrow: a single paragraph, or a slice carrying headings/tables/nested lists, passes through untouched so richer pastes keep degrading predictably per the `canvas_content_types.md` degradation contract. Type-agnostic — works for ordered lists too, since the items carry no list type of their own.

### UX-024 — Backspace can't get you out of a bullet list (fixed 2026-07-20)

**Date:** 2026-07-20\
**Fixed:** 2026-07-20 — added `@tiptap/extension-list-keymap` plus `src/editor/extensions/ListEscape.ts`, guarded by `src/editor/extensions/listBehaviour.test.ts`.\
**Area/Component:** list keymap — StarterKit's `ListItem` binds only `Enter`/`Tab`/`Shift-Tab` (verified in `node_modules/@tiptap/extension-list-item/dist/index.js:28`); `@tiptap/extension-list-keymap` was never installed\
**Interaction:** On the nth bullet, pressed **Backspace** to get back to a normal paragraph — first on an emptied item, then (second report, same day) at the **start of an item that still had text**.\
**Expected:** Backspace at the start of a bullet leaves the list. With text in the item, that text comes with it as its own paragraph — what Notion, Google Docs and Word all do.\
**Actual (before fix):** Two distinct failures. On an **empty** item, Backspace merged it into the **previous** item as a second paragraph — `<li><p>two</p><p></p></li>` — an invisible stray block; a second Backspace removed it and left the cursor at the end of the previous item, still inside the list. There was no way out via Backspace at all; you cycled. On an item **with text**, Backspace at its start appended that text to the previous bullet, destroying the line as a separate block.\
**Failure mode:** three layers, found in two passes. Without `ListKeymap` there is no Backspace list handling whatsoever (the stray nested paragraph). Adding `ListKeymap` fixed that but still doesn't **leave** the list — it drops the cursor at the end of the previous item. And a first-cut `ListEscape` keyed on _emptiness_ only covered the empty case, leaving ListKeymap's join-backward to swallow items that still had text — the second report. The rule has to be **positional**, not emptiness-based.\
**Notes:** Enter on an empty item already exited correctly the whole time — that's `splitListItem`'s built-in behaviour — so the list had exactly one exit, and it wasn't the key most people reach for. `ListEscape` (priority 1000, above ListKeymap's 100) lifts via `liftListItem` when the cursor sits at the very start of the item's first block: top-level → paragraph (before or after the list, depending where the item sat); nested → outdent one level. One rule covers both the empty and the has-text case. It declines mid-text, in a later block of a multi-block item, across a selection, and outside a list, so ordinary Backspace is untouched. Worth noting the guard tests are **unit** tests rather than browser ones on purpose: plain character deletion and caret keys like Home are native editing rather than keymap handlers, and synthetic key events don't reach ProseMirror for them — the browser harness cannot exercise this class of behaviour. The two decline cases are pinned by differential assertion (same document with and without the extension) because their outcome is really ListKeymap's and the base keymap's, which is pre-existing behaviour and not ours to pin.

### UX-025 — Formatting hotkeys reported dead; verified working, closed as non-repro

**Date:** 2026-07-20\
**Status:** **closed 2026-07-20 — non-repro, no code change.** The investigation below found the bindings intact; the reporter then confirmed the hotkeys work, Cmd+Shift+8 included, on the branch build. Nothing was changed that would explain the difference (the two fixes shipped alongside touch paste and Backspace only), so the original failure was environmental and transient. Kept as a record so the same report doesn't get re-investigated from scratch — and because the diagnostic below is the fast path if it recurs.\
**Area/Component:** editor keymap — StarterKit shortcuts (`Mod-Shift-8` bullet, `Mod-Shift-7` ordered, `Mod-Alt-N` heading), `src/editor/Editor.tsx`\
**Interaction:** Reported that transformation hotkeys don't work, e.g. **Cmd+Shift+8** for a bullet list.\
**Expected:** Cmd+Shift+8 converts the current paragraph to a bullet list.\
**Actual:** No conversion for the reporter. But the bindings are present and they fire: dispatching the exact event macOS produces for Cmd+Shift+8 (`key:'*'`, `code:'Digit8'`, `keyCode:56`, meta+shift) onto the editor converted the paragraph to `<ul>` and returned `defaultPrevented: true`; `Cmd+Alt+1` likewise produced `<h1>`. So `prosemirror-keymap`'s `keyCode` fallback resolves the chord correctly and no app-level handler is swallowing it.\
**Failure mode:** unknown, and **probably not app-side.** The strongest clue is that when the real chord was pressed through browser automation, no `keydown` reached the page at all — a capture-phase listener on `.tiptap` recorded nothing. Something between the keyboard and the document is consuming Cmd+Shift+8. Candidates: an OS/browser/extension grab, or a non-US keyboard layout where the `keyCode` fallback misses. (The same automation could not deliver a bare `Backspace` either, so some of this is a harness limitation rather than evidence about the reporter's machine.)\
**Notes:** If this recurs, the diagnostic is: does **Cmd+B** (bold) also fail? If bold works and Cmd+Shift+8 doesn't, it's layout or interception and the fix is an alternate binding, not a keymap repair; if all fail, it's focus or something app-side. Overlaps **UX-004** (_Editor formatting affordances_, already in the remediation Todo): there are no visible formatting controls, so hotkeys are the only path to these transforms and their failure is both invisible and unrecoverable. Whatever the root cause here, UX-004 is the thing that would have made it a non-event — the slash menu exists but doesn't cover list/heading transforms of an existing paragraph.

### UX-026 — Backspace in a multi-block list item lifted the whole item out of the list (regression from UX-024, fixed 2026-07-20)

**Date:** 2026-07-20\
**Fixed:** 2026-07-20 — `src/editor/extensions/ListEscape.ts`, guarded by `src/editor/extensions/listBehaviour.test.ts`.\
**Provenance:** **a regression introduced by the UX-024 fix (#224), not a pre-existing defect.** It was reported in that PR's writeup as pre-existing and out of scope; that was wrong, and the bisect below is what corrected it. Recorded here because the mistake is the instructive part: the differential tests written for UX-024 compared against a baseline that _already had `ListKeymap` registered_, so they confirmed "ListEscape doesn't change this" while the real damage came from the new dependency sitting underneath. **A control that includes the thing you just added is not a control.**\
**Area/Component:** `@tiptap/extension-list-keymap`'s `handleBackspace` catch-all (`node_modules/@tiptap/extension-list-keymap/dist/index.js` — `return editor.chain().liftListItem(name).run()`), added to `src/editor/Editor.tsx` in #224\
**Interaction:** In a list item holding more than one paragraph (which pasted content readily produces), placing the cursor at the start of the item's **second** paragraph and pressing Backspace.\
**Expected:** The second paragraph merges into the first, the item stays in the list — what every other editor does, and what this app did before #224.\
**Actual:** The entire item was yanked out of the list: `<ul><li><p>one</p><p>second block</p></li></ul>` became `<p>one</p><p>second block</p>`.\
**Failure mode:** ListKeymap's Backspace path checks `isAtStartOfNode`, which is true at the start of _any_ block in the item — it never verifies the block is the item's **first**. When its join branches don't apply (`hasListItemBefore` is false here), it falls through to an unconditional `liftListItem`. StarterKit alone gets this right via the base keymap's `joinBackward`; registering ListKeymap is what broke it. Confirmed by bisecting the extension list: StarterKit only → `<ul><li><p>onesecond block</p></li></ul>` (correct); +ListKeymap → the lift.\
**Notes:** The tempting fix was to drop `ListKeymap` entirely — with the now-positional `ListEscape` in place, a five-case matrix showed the two configurations **identical** on every Backspace case, differing only here, where dropping it is correct. But it earns its place on **Delete**: at the end of an item with a following item, ListKeymap merges the two items where the base keymap leaves one item holding two paragraphs. So it stays, and `ListEscape` pre-empts its bad Backspace fallback — at the start of a non-first block it now runs `joinBackward` explicitly. A dedicated test pins the Delete case _and says why_, so a future session doesn't remove the dependency as unused and silently reintroduce the multi-paragraph merge bug.

### UX-027 — Safari spins forever on a limitation knowable before the first probe (BYOA)

**Date:** 2026-07-20\
**Status:** **fixed 2026-07-20.**\
**Area/Component:** connect-panel gating — `useAgentBridge.connect` → `startAgentBridge` probe loop (`agentBridgeClient.ts`, `PROBE_INTERVAL_MS = 2_000`), panel states in `ConnectAgent.tsx`\
**Interaction:** Opened writtten in Safari, pressed **Connect your agent**, pasted the prompt, ran the bridge.\
**Expected:** Either it connects, or the product says why it can't.\
**Actual:** "Waiting for your agent…" with a pulsing dot, forever. The probe can never succeed: the bridge is plain HTTP on loopback, and WebKit on Apple platforms refuses that from an HTTPS page as mixed content — with no permission prompt to grant it (Chrome and Firefox both prompt for local-network access; Safari has nothing to prompt with).\
**Failure mode:** the product **already knew** and said it in passing — `ConnectAgent.tsx` carried "Chrome, Edge, or Firefox. Safari can't reach a local bridge." as help text under the button, and the skill's Troubleshooting section says the same. It then offered the button anyway and started an unbounded poll. Knowing a thing, printing it in small type, and proceeding as though you didn't is worse than not knowing: the spinner actively contradicts the help text, and the spinner is the louder signal. Same family as UX-022 and the activity-indicator milestone — the product holds the information and doesn't act on it.\
**Fix:** `src/services/agentBrowserSupport.ts`, checked **before the first probe**. The panel states the limit, names the working route, and notes that a key still works — with no CTA into a dead end and no spinner. Predicate is `navigator.vendor === "Apple Computer, Inc."` **and** an `https:` origin: vendor rather than a UA substring, because that catches iOS Chrome and iOS Firefox (WebKit underneath, equally blocked) and doesn't false-positive on desktop Chrome, whose UA carries a `Safari` token; scoped to HTTPS because from an `http://localhost` origin the request is same-scheme and unblocked, so refusing there would deny the self-hoster a path that works.\
**Notes:** Filed at 027 because 023–026 were taken by a concurrent session while this was in flight. The one thing this does **not** do is verify the block empirically — permission and mixed-content behaviour is browser chrome, invisible to automation, so the predicate rests on the documented WebKit behaviour and the earlier field report, not on an observed prompt.

### UX-028 — `POST /retract` was acknowledged and then discarded; the card never left the feed (BYOA)

**Date:** 2026-07-20\
**Status:** **fixed 2026-07-20.**\
**Area/Component:** `useAgentBridge.start` (`src/sidecar/useAgentBridge.ts`) → `startAgentBridge` deps; the guard at `agentBridgeClient.ts` `if (env.observationId && onRetract)`\
**Interaction:** A connected agent withdrew observations it had submitted, per the skill's documented `POST /retract`.\
**Expected:** The card closes with reason `retracted`, as `docs/mechanics/agent-bridge.md` describes.\
**Actual:** Nothing happened. `retractExternalObservation` had **zero production call sites** — `useAgentBridge` constructed the bridge with `pairing` / `readSnapshot` / `onSubmission` and no `onRetract`, so the SSE `retract` listener's guard was permanently false and every frame was dropped. Found by reading, not by report, while instrumenting the debug log.\
**Failure mode:** **the agent was told it succeeded.** The bridge answers `POST /retract` with `{ok:true}` before the app has done anything, so the agent reports a withdrawal to the user, the user looks at the feed, and the card is still there. Worse than a visible failure, because both sides believe different things and neither has a signal. The mechanics doc and the skill both documented behaviour that did not exist — the tests covered the bridge's relay and the lifecycle function independently, and nothing covered the wire between them.\
**Fix:** `onRetract` wired to `retractExternalObservation`, scoped by `sessionId` as designed (a source may only close its own). The handler returns a **boolean** rather than `void`: the bridge acks unconditionally, so "applied" and "refused" are indistinguishable from the agent's side, and the debug log is the only place that can tell them apart. A *missing* handler now logs `applied: false` instead of silently returning, so the same class of gap surfaces next time.\
**Notes:** This is also the true root of the `archives: 0` in the milestone's dogfood export. That was read as a logging gap; the retractions had additionally never happened. Verified live end-to-end: submit → card in feed → `POST /retract` → card gone from DOM and from `__sidecar__` state, with an `archive` record carrying reason `retracted`.

### UX-029 — A connected agent found a near-empty document and invented its own "wait until it settles" rule (BYOA)

**Date:** 2026-07-20\
**Area/Component:** `docs/skills/writtten-agent.md` — the skill has no instruction for *"the document is too thin to review yet"*. Not an app defect; nothing in `src/` behaves incorrectly.\
**Interaction:** Connected a real Claude Code session **before writing anything**, then typed a full document live while the agent watched.\
**Expected:** The agent reviews once there is something to review, and says what it is doing meanwhile.\
**Actual:** ~6 minutes of `/wait` → `/doc` → `/wait` with no submissions, then *"The document has settled (no changes in the last 60s), so I'll do the review pass now"* — followed by 5 observations. Its intermediate reports were accurate at the time (*"empty so far"*, *"still just one opening sentence"*, *"the author is actively typing"*).\
**Root cause — an invented policy, not a bug.** Nothing tells the agent to wait for a settle; the skill was diffed across every change to it. The 60 s is the bridge's own `WAIT_TIMEOUT_MS`, which the skill documents as plumbing (*"or `{timeout: true}` after ~60 s (just call it again)"*). The agent read that timeout as *"the draft has stopped changing"* and built a policy on it. Confirmed non-regression: a second session on the same build, asked explicitly for watch mode, reviewed on every version change and submitted normally.\
**Why it is worth fixing anyway.** The rule the agent reinvented is **writtten's own invariant 4** — *quiet while generating, opinionated while revising*. It reached the right principle by accident, slowly, and invisibly. We already own this judgement in `documentMaturity.ts` and apply it to our own engine; the agent is left to guess it. Giving it the rule explicitly — and telling it to say once that it is holding off — converts six minutes of unexplained silence into one sentence.\
**Secondary, lower confidence:** in the first session the agent appears to have entered watch mode **without being asked**, which the skill states is opt-in (*"only if asked"*). The second session asked explicitly, so this is unconfirmed — worth watching for rather than acting on.\
**Notes:** Made *visible* by the PR #228 readout, not caused by it: the status row now distinguishes `watching` from `idle`, so a future occurrence reads as a parked agent at a glance instead of as silence. Filed at 029 because 023–026 were taken by a concurrent session and 027–028 by #228.\
**Resolved 2026-07-20.** The snapshot now carries `maturity` (`unformed | forming | mature`) from the same `documentMaturity()` the built-in engine gates on, and the skill states the rule per band: on `unformed`, say so once and park — deferring the single pass that was asked for, not entering watch mode — then review when the band moves. Two things found while building that the report could not have known. **(1)** The band had to be folded into the wake gate (`stableContentHash`), because `blockCount` is a re-partition signal and `agentPushFingerprint` exists to flatten those away: splitting a paragraph moves `unformed → forming` with the prose fingerprinting identically, so a parked agent would have slept through the exact event it was waiting for (worse for tables, whose text never reaches `sections[]` at all). The guard was verified to fail against the un-folded hash. **(2)** The skill now also states that `{"timeout": true}` is plumbing and never a cue to review — naming the specific misreading, not only supplying the correct rule. The secondary watch-mode-unasked note was **not** acted on, per the owner; note the deferral does render as `watching`, since it parks on the same endpoint (recorded as a known reading in `docs/mechanics/agent-bridge.md`).

### UX-030 — The Engine strip and the connect section read as two panels stacked, not one decision (BYOA)

**Date:** 2026-07-20\
**Status:** open — reinforces the scheduled Settings rework (`docs/plan.md` Phase 8).\
**Area/Component:** `ControlCenter.tsx` Engine strip (`ENGINE_OPTIONS`, `engineHelp`) immediately above `ConnectAgent.tsx`'s `setting-section connect-agent`.\
**Interaction:** Opened Settings with `?agent=1`, selected **Your agent**.\
**Expected:** One coherent surface: pick an engine, then set that engine up.\
**Actual:** Three stacked text blocks with no hierarchy between them — the engine help line ("Your agent reads it. No key, no quota…"), then a `CONNECT YOUR AGENT` section title in caps, then a lede repeating nearly the same claim ("No API key, and your document never leaves this machine"). The engine help and the connect lede are **the same sentence twice**, ~60px apart, which is what makes the stack read as two unrelated panels that happen to be adjacent. Compounding it, the primary button and its help text share a line: `<button class="connect-btn">` is followed by an inline `<span class="setting-help">` (`ConnectAgent.tsx:120-130`), so the browser-support sentence wraps around the button rather than sitting under it.\
**Failure mode:** the section title is doing work the engine selection already did. Once **Your agent** is the selected engine, "CONNECT YOUR AGENT" is not a new topic — it is the body of the choice just made, and titling it as a peer section flattens the relationship. The duplicated sentence is the visible symptom of two components each introducing the same feature because neither knows the other rendered.\
**Notes:** Not a new milestone — the **Settings screen rework** (`docs/plan.md` Phase 8) already owns this, and was explicitly sequenced *after* engine exclusivity precisely because the key-vs-agent slot had to settle first. It has now settled, so this entry is the concrete brief that milestone was waiting for: the strip and the connect section want to be one progressive-disclosure surface, and the duplicate lede plus the inline-help collision are the two smallest fixes inside it.

### UX-031 — The connect panel lectures every browser about Safari, in the one branch Safari never reaches (BYOA)

**Date:** 2026-07-20\
**Status:** open\
**Area/Component:** `ConnectAgent.tsx:128-130` — the `setting-help` under the connect CTA; `agentBrowserSupport.ts`.\
**Interaction:** Opened the connect panel in Chrome.\
**Expected:** Copy that reflects the browser I am actually in — or says nothing, since it works here.\
**Actual:** "Chrome, Edge, or Firefox. Safari can't reach a local bridge." — static text under the button, addressed to a user who is by construction not in Safari.\
**Failure mode:** the line renders **only inside the `support.supported` branch**. UX-027 already added `agentBrowserSupport.ts` and a dedicated unsupported branch (`ConnectAgent.tsx:98-112`) that states the Safari limit properly, with no CTA and no spinner — so by the time this help text renders, the app has *already determined the browser can connect*. It is residue from before the detection existed: a generic disclaimer surviving next to the specific check that superseded it. Same family as UX-027 itself (the product holds the information and doesn't act on it), one layer up: there we knew and proceeded anyway; here we know and still hedge.\
**Direction (owner, 2026-07-20):** make it browser-aware with an explicit **unknown** fallback. The predicate is `navigator.vendor === "Apple Computer, Inc."` && `https:` — everything else is "supported", which lumps *known-good* (Chrome, Edge, Firefox) together with *unrecognized*. Those deserve different copy: known-good needs none, unknown wants a short "this may not work in your browser" hedge. The current line is the unknown-case copy shown to everyone.\
**Notes:** Worth checking the local-network sentence in the waiting state at the same time. ~~Chrome may prompt for local network access, Firefox doesn't~~ — **struck 2026-07-21: that claim was wrong, and wrong in exactly the way this entry is about.** Both Chrome and Firefox prompt. It had already been measured against the deployed origin on 2026-07-20 and corrected — on a branch that never merged, while `main` kept shipping "Chrome may ask." Written from the spec's assumption instead of the measurement, which is how the copy shipped wrong the first time and how this note repeated it. Fixed in the same PR as this correction, and the copy is now deliberately **browser-agnostic**: a per-browser claim rots with every release, and there is no way to observe a permission prompt from automation to catch the rot.

### UX-032 — The connect prompt can only be copied, never read (BYOA)

**Date:** 2026-07-20\
**Status:** open\
**Area/Component:** `ConnectAgent.tsx` connect CTA → `agentPrompt.ts`; canonical skill at `docs/skills/writtten-agent.md`, served at writtten.com/agent.\
**Interaction:** Pressed **Connect your agent** and looked for what I was about to hand my agent.\
**Expected:** Some way to see what the thing does before pasting ~27k characters of instructions and an executable script into an agent session.\
**Actual:** A copy button. The prompt is generated, copied to the clipboard, and never shown — there is no expand, no preview, and no link to the published explanation, even though one exists and is public.\
**Failure mode:** this is the **trust half** of the prompt-slimming milestone, showing up in the UI rather than in the agent's reaction. That milestone is about the paste being too big and too self-authorizing for an agent to accept; this is the same paste being opaque to the *user*, who is asked to relay instructions they cannot inspect. A user who won't read 27k characters would still read a two-line summary of what their agent is being asked to do — and the person most likely to want that is exactly the security-conscious dev the GTM spike targets. Withholding it while asking for trust is backwards.\
**Direction:** surface the existing explanation rather than write a new one — a link to writtten.com/agent (or the in-repo skill) beside the copy button, and/or a disclosure that reveals the prompt inline. Cheap, and it gets cheaper after slimming, when there is a ~20-line prompt genuinely worth showing in place.\
**Notes:** Folds naturally into the **prompt slimming** milestone (`docs/plan.md` Phase 8), which is already rewriting this surface and already has "move review guidance behind a URL" as one of its five directions — this is the same URL, pointed at the user instead of the agent. Note `public/agent/index.html` currently carries a `noindex` that comes off at launch.

### UX-033 — A connected agent was never sent the document; it reviewed the empty snapshot from connect, forever (BYOA)

**Date:** 2026-07-20\
**Status:** **fixed 2026-07-20.**\
**Area/Component:** `agentBridgeClient.subscribeSettled` ← `activitySignal`; `orchestrator.scheduleEval` engine gate; new `src/model/docSettleSignal.ts`.\
**Interaction:** Selected **Your agent**, connected a real Claude Code session, then wrote a full article in the editor.\
**Expected:** The agent is woken on each settle and reviews what was written.\
**Actual:** The agent polled `/wait` → `/doc` → `/wait` for the whole session against `docVersion: 1` and an empty `sections[]`, correctly reported the document as empty, and asked the author to check whether writtten was really connected. It was: the bridge was healthy, the panel read **Connected · Claude Code**, and the status row read `watching`. Every edit the author made reached nothing.\
**Failure mode:** `pushSnapshot` has two triggers — once on connect, and thereafter on settle. "Settle" was defined as the falling edge of the orchestrator's outstanding-work count: `pending` reaching 0 meant nothing was debouncing, queued, or in flight, so the document had by implication settled. **Engine exclusivity (#234) broke the implication.** It gated `scheduleEval` so the built-in evaluator arms nothing while an agent holds the slot — deliberately, and the code comment names the readout benefit: "no coalesce timer is created, so `recomputePending()` stays at 0 and the activity dot rests." Correct for the dot. But with the count pinned at 0 there is no rising edge and therefore no falling edge, so the settle callback never fired again after connect. The bridge went blind in precisely the mode it exists for.\
**Why nothing caught it:** the bridge's own tests inject `subscribeSettled`, so they proved the wiring while stubbing the mechanism that broke; the orchestrator's engine tests asserted the *absence* of evals, which is what the gate was for. Both lanes were green and neither owned the seam. The lanes were also cleared as parallel-safe on a **file** analysis — they share no files — while the coupling was semantic: one lane's wake signal was derived from the other lane's counter.\
**Fix:** separate the conflated facts. `notifyDocSettled` / `subscribeDocSettled` (`src/model/docSettleSignal.ts`) carry *the document settled*; `activitySignal` keeps carrying *writtten has outstanding work*. The orchestrator announces the settle from its own coalescer, sharing `COALESCE_MS` so there is one window, armed **above** the engine gate and counted by nothing. `pending` was deliberately not reused: `processStatusView` treats a non-zero count under the agent engine as a real pre-switch call and prints `evaluating · N`, so arming a counter for work that will never run would make the readout lie.\
**Verified live against a real spawned bridge**, not only in unit tests: baseline pull reproduced the bug exactly (`docVersion 1`, 0 chars, `maturity: unformed`); typing then drove `docVersion` 2 → 3 → 4 with the prose arriving each time, the delta hint reading `changedSections [0] since 2`, and `maturity` progressing `unformed` → `forming` at 186 words (the 150-word bar). Throughout, `data-pending` stayed `0` and `dotTier` stayed null — lane A's property intact.\
**Guard:** `orchestrator.engine.test.ts` now pins "still announces the settle" and "never raises the pending count" **side by side**, because they are in direct tension and a future change that satisfies one by breaking the other is exactly how this shipped. Plus burst-collapse coverage and, in `agentBridgeClient.test.ts`, an agent-engine case asserting the wake does not depend on the activity count.

### UX-034 — An agent that ends its session stays "watching" for up to 90 seconds; the bridge already knows and says nothing (BYOA)

**Date:** 2026-07-20\
**Status:** open\
**Area/Component:** `writtten-bridge.mjs` `handleWait` (the `res.on("close")` cleanup); `agentActivityView.ts` `AGENT_PASS_IDLE_MS = 90_000`.\
**Interaction:** The agent finished and stopped polling. The status row read `reading` for about another minute, then flipped to `watching`.\
**Expected:** Some earlier signal that the agent has gone.\
**Actual:** Both phases are technically accurate and both are stale. The agent's last act was a `GET /wait`, so `lastWaitAt` became the most recent signal and `watching` is what the phase derivation returns — for a full `AGENT_PASS_IDLE_MS` after the agent is gone. Nothing distinguishes an agent parked in a live watch loop from one whose session ended.\
**Failure mode:** the milestone that built this readout ruled out an agent-side "done" call, correctly — it would grow the prompt the slimming milestone is shrinking, and it would be unenforceable anyway. But it concluded from that that decay was the *only* available answer, and **that inference skipped a signal the bridge already observes**: `handleWait` registers `res.on("close")` to clean up a parked waiter, so the bridge learns immediately when a watching agent's connection drops (session ended, process killed, Ctrl-C). It cleans up silently and tells the app nothing.\
**Direction:** broadcast when a *parked* waiter's response closes without having been answered — distinguishing a client abort from the bridge's own `WAIT_TIMEOUT_MS` reply. Same additive shape as `pulled` and `waiting`: one `broadcast()` in the bridge, one named `addEventListener` in the client, no `protocolVersion` bump, and an older pasted bridge simply never sends it.\
**Known limit, worth stating so it isn't mistaken for a full fix:** this catches the agent's *connection* going away, not the agent *deciding to stop*. An agent whose process is alive but which never calls `/wait` again after a normal timeout leaves no connection to close, and only decay can catch that. The win is turning "session ended" from a 90-second lie into an instant transition — which is the case the user actually hit.

### UX-035 — The reading counter measures time since the last pull, not how long the pass has been running (BYOA)

**Date:** 2026-07-20\
**Status:** open\
**Area/Component:** `agentActivityView.ts:108` — `reading · ${formatElapsed(now - pass.lastPullAt)}`.\
**Interaction:** Watched the status row during an active review. The counter sat at `0:00` for a stretch, then began ticking normally, and never did it again in that session.\
**Expected:** A counter that goes up while the agent is reading.\
**Actual:** Frozen at `0:00`, then healthy.\
**Failure mode:** not a stuck timer — the tick is fine (`ControlCenter.tsx:566`, a 1 s interval gated on the `reading` phase). The counter is `now - lastPullAt`, and **every `GET /doc` resets `lastPullAt`**. An agent polling in a tight loop therefore re-zeroes the counter on each pull, so it reads `0:00` continuously while a pass that is genuinely minutes old is under way; it "starts working" the moment the agent stops re-pulling. The non-reproducibility is the tell — it needs a burst of rapid pulls, which only some agent behaviours produce.\
**Why it matters more than a cosmetic tick:** the readout's stated contract is *report facts, not progress* — elapsed time was chosen precisely because it is something writtten knows. But the label says `reading` (a pass) while the number measures *since last pull* (an event). Under a polling agent those diverge, and the row reports the smaller number, which understates how long the user has been waiting. It is the readout's own honesty rule broken by a subtler mechanism than the one it was written to prevent.\
**Direction:** anchor the counter to the start of the current reading stretch rather than the latest pull — i.e. the first pull since the last `watching`/`quiet`/push — so consecutive pulls extend a pass instead of restarting it. Pure change to `agentActivityView.ts` plus one field on `AgentPass`; no protocol change.

### UX-036 — Submissions are invisible in the status row: the agent is only ever "reading" or "watching" (BYOA)

**Date:** 2026-07-20\
**Status:** open\
**Area/Component:** `agentActivityView.ts` `agentPassPhase` — `lastSubmissionAt` is folded into the `reading` phase (line 85) and surfaced nowhere.\
**Interaction:** The agent submitted several observations. The status row said `reading` throughout, exactly as it had while the agent was only reading.\
**Expected:** Some visible difference between an agent that is reading and one that is producing.\
**Actual:** Two phase words for the whole lifecycle. Submissions re-arm the decay window and change nothing the user can see.\
**Failure mode:** deliberate — the comment states that a submission keeps the phase `reading` because the agent has not gone back to waiting. That is defensible for *phase*, but it means the one signal that proves the agent is doing the work it was asked to do never reaches the row. Compounding it, the earlier `N submitted` counter was dropped on the correct reasoning that it counted **submissions, not acceptances**, so a register-lint burst could read `5 submitted` over a feed that gained nothing. Both decisions are individually right and together they leave production entirely unreported.\
**Direction:** report **acceptances**, which is the honest version of the number the earlier decision rejected — the cards are already the ground truth, so a phase or suffix keyed on accepted-this-pass says something true and non-redundant. Cheap: the boundary's verdict is already known at the point the pass facts are updated. Worth deciding alongside UX-034, since both change what the status row can say.\
**Second half of the report:** *"watching even when not polling"* — that is UX-034, filed separately because its fix is bridge-side.

### UX-037 — A contradiction from an agent highlights only one of the two passages it is about (BYOA)

**Date:** 2026-07-20\
**Status:** open — **design consequence, not a defect in the code as written.**\
**Area/Component:** `externalObservations.ts:61` (external conflict cards are single-anchor by construction); `App.tsx:571` (dual highlight requires `obs.conflictingBlockId != null`).\
**Interaction:** Several sessions with a connected agent. Every `contradiction` card highlighted one passage; the passage it contradicts was never marked.\
**Expected:** Both sides lit, as the built-in engine does.\
**Actual:** One anchor, always — and it is unreachable, not intermittent: the boundary accepts a single `anchorText` and never populates `conflictingBlockId`, and the dual-highlight path requires it. Decision 4 of the BYOA design record chose this ("external conflict-type cards are single-anchor, no `conflictingBlockId` machinery") and explicitly accepted the hero-type trust risk, with the source chip named as the containment.\
**Failure mode — what changed under it:** **both halves of that rationale are now gone.** The chip was removed outright by engine exclusivity, and, more seriously, an agent is no longer a *second* source whose weaker cards sit beside precision-guarded ones — it is **the** engine. So for every BYOA user the product's hero observation type is permanently degraded, with no stronger version available anywhere in the app and nothing on the card admitting it. A contradiction names a relationship between two passages; showing one of them makes the reader hunt for the other, which is the specific work the anchoring machinery exists to remove.\
**Direction:** let a conflict-type submission carry a second verbatim quote, resolved locally by the same substring machinery as the first, and populate `conflictingBlockId` when both resolve. The invariant that matters is *the agent never learns block identity* — quotes preserve that, since resolution stays app-side. Rejection semantics follow decision (a): if the second quote does not resolve, hard-reject with a hint rather than silently degrading to one anchor, which is what taught sloppy anchoring in the first place. The conflict **lifecycle** exemptions stay as they are; this is about what the card shows, not about who may close it.\
**Notes:** re-opens a settled decision, so it wants an explicit owner call rather than a quiet fix. Sequence with the engine-exclusivity follow-ups — this is the second thing that decision made more expensive than it looked (the first being the stale-copy sweep).

### UX-038 — The first load after any deploy serves the previous build (service worker), so "just shipped, go look" shows stale content once

**Date:** 2026-07-20 (recovered 2026-07-21 from the unmerged `docs/byoa-landing-verified` branch, where it was filed as UX-023 — a number since taken on `main`)\
**Status:** open — **no fix proposed; this is a habit, not a defect.**\
**Area/Component:** PWA service worker — `VitePWA({ registerType: 'autoUpdate' })` in `vite.config.ts`\
**Interaction:** Immediately after the `writtten-v0.8.0` deploy succeeded, opened `https://writtten.com/?agent=1` in a browser that had visited the site before. The new surface did not appear.\
**Expected:** A deploy that has completed is what a returning visitor sees.\
**Actual:** The page ran `/assets/index-BFSyNTJ1.js` from the SW cache while the network was already serving `/assets/index-4IEfKoDF.js`. Diagnosed by comparing the loaded `<script src>` against a `fetch('/index.html', { cache: 'reload' })`. `registration.update()` followed by a navigation picked up the new bundle and everything worked.\
**Failure mode:** none in the product — this is how `autoUpdate` is specified to behave (install in the background, take effect on a later navigation). It is a **verification and comms hazard**, not a bug: the first person to check a fresh release — including us — can reasonably conclude the deploy failed or the feature is missing.\
**Notes:** Deliberately not proposing a fix. Forcing `skipWaiting` + immediate reload has its own cost — a page reloading under someone mid-sentence is worse than a delayed update, and this is a writing tool. What this needs is a habit, recorded so it is not re-diagnosed: after any deploy, verify with a hard reload or a second navigation, and confirm the loaded asset hash matches the network's before concluding anything. Cost of not knowing it, measured: ~10 minutes chasing a phantom "the gate didn't ship" during the 0.8.0 verification. **Generalizes to every release, not just BYOA** — which is why it was worth recovering rather than letting it die with the branch.

### UX-039 — Connecting writes a 465-line script into the user's working directory, unannounced and never cleaned up (BYOA)

**Date:** 2026-07-20 (recovered 2026-07-21 from the unmerged `docs/byoa-landing-verified` branch, where it was filed as UX-024 — a number since taken on `main`)\
**Status:** open\
**Area/Component:** `docs/skills/writtten-agent.md` § Setup — _"Write the script at the end of this document to `writtten-bridge.mjs`"_\
**Interaction:** Connected an agent from writtten.com. Only afterwards did the owner notice a new `writtten-bridge.mjs` sitting in the directory the agent happened to be running in.\
**Expected:** Either the file is announced before it appears, or it goes somewhere disposable and is cleaned up.\
**Actual:** Neither. The skill instructs a bare relative filename, so it lands in the agent's CWD — **usually the user's own project repo**. Nothing in the app, the prompt, or the agent's own report mentions that a file will be created, and nothing removes it afterwards.\
**Failure mode:** three, in increasing severity. (1) Surprise — an unexplained 465-line file appears in a project the user did not expect writtten to touch. (2) Persistence — it outlives the session, so a *later* session finds an unexplained script and has no idea what it is. (3) **A stray `writtten-bridge.mjs` in a git repo can be committed and pushed.** That is the one with real teeth: our tool leaving an artifact in someone else's published history.\
**Notes:** A third argument for the direction already recorded on the prompt-slimming milestone (`docs/plan.md` Phase 8) — the fixes converge. Under "serve the script from the app's origin" the agent fetches to a temp path or pipes straight into `node`, and nothing durable lands in the repo; under "the user runs the bridge" the agent writes nothing at all. Interim mitigations, both cheap and independent: have the skill write to the OS temp directory rather than CWD, and have it **tell the user the path** in the report it already gives at the end of a pass. The connect UI's "Not working?" disclosure names the file as of #237, so it is at least discoverable from inside the app.
