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
- [ ] **No evaluator-internal IDs in message copy** — forbid `Claim #N`-style index references in contradiction/tension `message` text; the model should quote or restate the claim's own words instead. Prompt-level fix, pairs with OBS-031's paraphrase-fidelity fix. (See UX-017.)
- [ ] **Observation quotes** — Add a small snippet of the referenced text as a subtitle to observation cards to improve scanning speed without requiring a hover interaction. (See UX-008)
- [ ] **Observation auto-scroll & split-context** — Implement auto-scrolling the editor when focusing a card, and design a solution (e.g., floating portal) for viewing distant spans simultaneously in a contradiction. (See UX-009)
- [ ] **Smart Feed vs Manual Control (Design Project)** — Draft a new project spec to explore lightweight user controls for the feed (sorting, filtering, warnings vs. suggestions) that respect the "lean/smart interface" philosophy without becoming a traditional settings-heavy dashboard. (See UX-010)
- [ ] **Archive closure reasoning** — Add explanatory context (e.g., a "Reason" field or tooltip) to auto-archived messages indicating exactly why the system decided to retire them. (See UX-011)
- [x] **Parallel block-completion trigger** — fire a section eval on paragraph completion (Enter after a settled block), in parallel with the 3s pause timer, so finished paragraphs are picked up promptly. Shipped 2026-07-02 as the `block-settle-completion` trigger; `docs/mechanics/evaluation-triggers.md` §2 updated. (See UX-013; `docs/plan.md` Phase 6.)
- [ ] **Doc-level fit on short drafts** — let structurally-complete short drafts earn gentle doc-level "how it fits" observations via maturity-aware severity (R2) rather than the hard 150-word `doc-idle` gate. (See UX-013; rides `docs/projects/maturity_aware_severity.md`.)
- [ ] **Revert-aware evaluation** — coalesce transient structural edits (debounce block-type toggles) and content-hash snapshot/restore so a change-and-revert (or Ctrl-Z, or no-op formatting) doesn't trigger a full eval cascade + churn + wasted paid calls. (See UX-014; spec `docs/projects/revert_aware_evaluation.md`.)
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
**Area/Component:** contradiction/tension card copy (`src/services/evaluatorPrompts.ts:127,145`, sweep contradiction prompt)\
**Interaction:** Reading two contradiction/tension cards on a rollout spec; one message read _"...while Claim #0 gates the feature to a specific user segment"_ and another _"...which the concurrent device retries in Claim #1 could exceed."_\
**Expected:** A message that refers back to the user's own document — a quote, a paraphrase, or a pointer to the section/sentence — never an opaque internal identifier the user has no way to decode without inspecting the ledger.\
**Actual:** The prompts (`CONTRADICTION_SWEEP_SYSTEM_PROMPT` and its hedged variant) label claims `[Claim #N]` for the model's own bookkeeping (so it can return `claimAId`/`claimBId` as structured fields) — but nothing stops the model from echoing that same `Claim #N` label inside the free-text `message` field it writes for the user. The example given in the prompt ("This contradicts the Q3 target date set earlier.") doesn't use index phrasing, but no instruction explicitly forbids it, so the model sometimes reaches for the label that's right in front of it.\
**Failure mode:** internal-implementation leak into user-facing copy (register violation — evaluator's-eye-view instead of the user's-eye-view)\
**Notes:** Purely a prompt fix: add an explicit instruction that the `message` field must never reference a claim by its index/label — it should quote or closely restate the claim's own words instead. Same session also surfaced OBS-031 (paraphrase drift) on one of these two messages — worth fixing together since both are about what the `message` field is allowed to say about a compared claim. → see `docs/logs/prompt_quality_observations.md` (OBS-031).
