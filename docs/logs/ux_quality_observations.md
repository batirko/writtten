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
- [ ] **Observation quotes** — Add a small snippet of the referenced text as a subtitle to observation cards to improve scanning speed without requiring a hover interaction. (See UX-008)
- [ ] **Observation auto-scroll & split-context** — Implement auto-scrolling the editor when focusing a card, and design a solution (e.g., floating portal) for viewing distant spans simultaneously in a contradiction. (See UX-009)
- [ ] **Smart Feed vs Manual Control (Design Project)** — Draft a new project spec to explore lightweight user controls for the feed (sorting, filtering, warnings vs. suggestions) that respect the "lean/smart interface" philosophy without becoming a traditional settings-heavy dashboard. (See UX-010)
- [ ] **Archive closure reasoning** — Add explanatory context (e.g., a "Reason" field or tooltip) to auto-archived messages indicating exactly why the system decided to retire them. (See UX-011)

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
**Notes:** This is the `stage-changed` counterpart to the bug fixed for `doc-idle` in `docs/projects/doc_scope_reconciliation.md` (Tier 1 best-match + grace; Tier 2 / D2 resolution-aware regeneration). That work repaired the `doc-idle` reconcile path but **left `handleStageChanged` on the original Phase-2 "supersede everything, regenerate blind" mechanism** (`docs/projects/message_generation_workflow.md`, L51/L210). The wipe is defensible for its intended case — the user *meaningfully re-scopes the audience* (e.g. "PRD" → "PRD for payments eng+design") so old notes are genuinely mis-graded — but wrong for the case that actually fires most: accepting the model's *own first* stage suggestion (none → inferred PRD), where content is unchanged. Two fix directions: (1) **route stage-changed through the same resolution-aware doc reconciler** (inject priors, keep-by-id where still true, only close what the model says is resolved) instead of a blanket supersede; (2) **skip the wipe entirely when the stage transition is none→suggested** (auto-applied, not hand-edited) and just let the next `doc-idle` reconcile. Also a paid-cost smell: the wipe forces two back-to-back strong/paid doc-quality calls (~16s then ~24s) for near-identical output. Clusters with UX-002/UX-011 (archive honesty) and `doc_scope_reconciliation` D2.
