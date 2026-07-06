---
status: idea
phases: [5, 6]
summary: Living log of observed prompt quality issues (false positives, misclassifications, missed signals) — accumulates across test sessions until a dedicated remediation sprint is warranted.
---

# Prompt Quality Observations

## Status

> Canonical status lives in the frontmatter. This is an accumulation file, not a feature spec. It is never "done" — new observations get appended as testing reveals them; the status flips to `in-progress` when a remediation sprint is scheduled.

**How to use this file:** Any time a test session, harness run, or manual evaluation reveals a prompt producing a false positive, a false negative (missed real issue), or a systematic misclassification, add an entry to the **Observation Log** section below. Include: the offending prompt tier (fast / strong), the type flag involved, the input excerpt, the expected behaviour, and what actually happened. Brief is fine — the goal is accumulation, not polish.

When enough entries cluster around the same failure mode, pull them into a **Failure Pattern** and eventually into the remediation Todo.

> **Synthesis:** the cross-cutting root-cause analysis of these observations (which collapse into ~6 shared root causes, several of them architecture rather than prompt issues) lives in `docs/projects/quality_remediation_synthesis.md`. New raw observations still land here; the synthesis is where they get grouped and sequenced.

**Register/anti-taxonomy violations belong here too.** Beyond false positives/negatives, log any message that prescribes a fix, asks a leading/Socratic question, or surfaces a surface/style nit (the anti-taxonomy) — these are register failures (R2.2–R2.4, R4.3). They are structurally guarded by `docs/projects/philosophy_guardrails.md` (G2/G3), but field-observed leaks get recorded here and feed the remediation sprint.

---

## Phased Plan

| Phase    | Work                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5 (or 6) | Scheduled remediation sprint: batch-fix accumulated failure patterns, update affected prompts, add regression fixtures to `src/services/eval-fixtures/` (see evaluator quality ratchet). |
| Ongoing  | Any session — add observations as they are found. No code change; just append an entry.                                                                                                  |

---

## Todo

### Next remediation sprint

- [ ] **Attributed-claim carve-out** — add one sentence to the fast-call `unsupported_claim` instructions: claims explicitly attributed to a named source, team, or study are not unsupported. Pattern: "per X's analysis", "according to the data team", "X research shows". (See OBS-001.)
- [ ] **Claim kind disambiguation** — the fast model consistently conflates `commitment`/`constraint` with `metric`. Add per-kind one-line examples to the claims instruction. (See OBS-002.)
- [ ] **Jargon allow-list** — foundational domain vocabulary should not be flagged as undefined. Two preset layers: a general PM/product-process preset on by default, plus per-sub-domain presets and a user dictionary. Tie into the jargon allow-list Phase 4 milestone. (See OBS-003, OBS-005.)
- [x] **Tension vs. contradiction** — reserve the `contradiction` type for genuine logical incompatibility; route strategic tradeoffs to the `strategic_tension` type and tighten the contradiction prompt accordingly. (See OBS-004.) **Done 2026-06-04**
- [ ] **Re-evaluation context** — Update the evaluation orchestrator to inject a block's active observations into the LLM prompt when re-evaluating a modified block, enabling targeted verification of user fixes. (See OBS-021.)
- [ ] **Scope-excluded claim tagging** — tag claims extracted from "Out of scope" / "Non-goals" sections (e.g. `scope: excluded`) at extraction time, and have the contradiction prompts skip or heavily downweight conflicts where either side is `scope: excluded`. Extends OBS-027's heading-governs-intent fix beyond the span-check prompt into claim extraction and the contradiction prompts. (See OBS-030.) **Scheduled 2026-07-06 → `docs/plan.md` Phase 7** (split out of the OBS-031/UX-017 message-fidelity PR, which is prompt-only; this needs extraction-time schema/tagging).
- [x] **Faithful claim restatement in contradiction/tension messages** — instruct the contradiction/tension prompts to quote or closely restate a compared claim's own language rather than freely re-describing it, to stop paraphrase drift from inventing details (e.g. a stated "threshold" becoming an invented "user segment"). Also decide whether a third bucket (or a doc-level clarity flag) is needed for two claims that are compatible but whose interaction is simply unspecified — today it gets force-fit into `strategic_tension`. (See OBS-031.) **Done 2026-07-06:** all four contradiction prompts (`CONTRADICTION_SYSTEM_PROMPT[_HEDGED]`, `CONTRADICTION_SWEEP_SYSTEM_PROMPT[_HEDGED]`) now require quoting/restating the compared claim's own words + forbid `[Claim #N]` labels in `message` (UX-017); **bucket decision: suppress in sweep** — compatible-but-underspecified pairs report in neither bucket ("that is a clarity gap"), the section-level `clarity` check catches them (no new type). Guarded by the `contradiction-sweep-fidelity` ratchet fixture (first sweep-path coverage) + a label-leak lint in `evalRatchet.test.ts`.
- [ ] **Opinion / apprehension carve-out** — add to the fast-tier `unsupported_claim` instructions: first-person hedged opinions and apprehensions ("I fear…", "I'm concerned that…", "I worry…") are not unsupported factual claims. Tactical stopgap ahead of document-type calibration. (See OBS-028; strategic fix is `docs/projects/document_type_calibration.md`.)
- [ ] **Document-type calibration** — make the `Document context`/stage field actually recalibrate eval strictness and which checks apply, so PRD-grade citation/structure expectations don't fire on essays/blogs/memos. Root fix for OBS-028 facet 1 and OBS-023. (See `docs/projects/document_type_calibration.md`.)
- [ ] **Same-block re-anchor dedup** — the reconciler should treat a same-type observation re-anchored to a different substring within the same block as the same card (keep-by-id on high text similarity), not a new emission. Fixes the single-growing-section churn. (See OBS-028 facet 2; clusters OBS-012/R3.)
- [ ] **Heading-only sections must be inert** — short-circuit section-eval before the model call when a section has a heading but no body text, so a bodyless heading never hallucinates. Regression guard for the `section_as_eval_unit` hallucination class. (See OBS-029; design in `docs/projects/section_eval_precision.md`.)

---

## Observation Log

Each entry follows the format:

```
### OBS-NNN — <short title>
**Date:** YYYY-MM-DD
**Prompt tier:** fast | strong | doc-level
**Type flag:** clarity | contradiction | unsupported_claim | undefined_jargon | ...
**Input excerpt:** (the text that triggered the issue)
**Expected:** (what should have happened)
**Actual:** (what happened)
**Failure mode:** false-positive | false-negative | misclassification | wrong-severity | ...
**Notes:** (any context; escalation rule impact if relevant)
```

---

### OBS-001 — Attributed claim flagged as unsupported

**Date:** 2026-06-04\
**Prompt tier:** fast (gemini-3.1-flash-lite)\
**Type flag:** unsupported*claim\
**Input excerpt:** *"The root cause, per the fraud team's analysis, is that legitimate users are being blocked by overly aggressive rules with no way to dispute in real time."_\
**Expected:** No flag — the claim is explicitly attributed to the fraud team's analysis. Attribution IS the support.\
**Actual:** Flagged as unsupported: _"The assertion that the root cause of the decline rate increase is specifically due to overly aggressive rules lacks supporting data."\_\
**Failure mode:** false-positive\
**Notes:** The fast-call prompt already carves out success targets ("Do NOT flag opinions, plans, goals, or success targets"). It needs a second carve-out: claims attributed to a named source/team. Pattern: "per X's analysis", "according to X", "X's research shows", "the data shows". This is the most trust-damaging false-positive class — the author explicitly cited evidence and the tool ignores it.

---

### OBS-002 — Goal/constraint statements misclassified as metrics

**Date:** 2026-06-04\
**Prompt tier:** fast (gemini-3.1-flash-lite)\
**Type flag:** claims extraction (claim kind)\
**Input excerpt:** Section "Goal": _"Reduce false-positive friction for legitimate transactions while maintaining our fraud block rate at or above current levels."_\
**Expected:** `"Reduce false-positive friction…"` → kind: `commitment`; `"maintaining our fraud block rate at or above current levels"` → kind: `constraint`.\
**Actual:** Both tagged as `kind: "metric"`.\
**Failure mode:** misclassification\
**Notes:** Wrong kind breaks downstream escalation. The `computePriority` commitment×commitment rule fires only when two `commitment`-kind claims contradict each other — if goal statements are typed as `metric`, the escalation to `high` severity never triggers. The fix is per-kind examples in the claims instruction, not a structural change:

- `commitment`: "We will ship X", "The team will reduce Y"
- `constraint`: "must not exceed", "requires approval from", "at or above current levels"
- `metric`: a numbered target or measurement, "drops by 30%", "latency under 200ms"
- `fact_claim`: an assertion about the world that could be verified or cited

---

### OBS-003 — Standard domain vocabulary flagged as undefined jargon

**Date:** 2026-06-04\
**Prompt tier:** fast (gemini-3.1-flash-lite)\
**Type flag:** undefined*jargon\
**Input excerpt:** *"Reduce false-positive friction for legitimate transactions"_\
**Expected:** No jargon flag — "false-positive" is standard payments/fraud vocabulary.\
**Actual:** Flagged: _"The term 'false-positive' is used without defining the specific criteria for what constitutes a false positive in this transaction system."\_\
**Failure mode:** false-positive\
**Notes:** This is the driving motivating example for the jargon allow-list (Phase 4 milestone). Other terms from the same doc that should be in a payments/fraud domain preset: "dispute rate", "fraud block rate", "declined transactions", "false-positive friction". The allow-list needs both a user-configurable layer and sensible domain presets seeded from real PM sub-domains. Until the allow-list ships, this will keep producing noise on any payment-domain document.

---

### OBS-004 — Strategic tradeoff flagged as a hard contradiction

**Date:** 2026-06-03\
**Prompt tier:** strong (contradiction check)\
**Type flag:** contradiction\
**Input excerpt:** A strategic tradeoff in a fraud PRD — notifying users on a fraud block creates friction, _vs._ not notifying trains bad behaviour. (Two desirable goals in tension, not a factual paradox.)\
**Expected:** Either no contradiction flag, or a softer "tension" observation. The two statements are not logically incompatible — they describe a deliberate tradeoff the author is reasoning about.\
**Actual:** Flagged as a hard logical contradiction by the contradiction check.\
**Failure mode:** misclassification (false-positive contradiction)\
**Notes:** Captured from the 2026-06-03 evaluation signal-quality review (`docs/snapshots/2026-06-03_evaluation_signal_quality_review.md`). The remedy is the planned `strategic_tension` observation type (Phase 4 milestone) — give the model a bucket for philosophical/strategic conflicts that aren't factual paradoxes, and tighten the contradiction prompt to reserve `contradiction` for genuine logical incompatibility. Until then the un-hedged contradiction prompt presents these tradeoffs with unwarranted confidence, which is trust-damaging on exactly the kind of nuanced reasoning PMs value.

---

### OBS-005 — Tech / product-process vocabulary flagged as undefined jargon

**Date:** 2026-06-03\
**Prompt tier:** fast\
**Type flag:** undefined*jargon\
**Input excerpt:** *"soft launch"_, _"rollout cohort"_ (standard product-rollout vocabulary in a PRD).\
**Expected:** No jargon flag — these are foundational product/release-process terms, not undefined domain jargon.\
**Actual:** Both flagged as undefined jargon.\
**Failure mode:** false-positive\
**Notes:** Captured from the 2026-06-03 evaluation signal-quality review. **Clusters with OBS-003** into a single Failure Pattern: the fast `undefined_jargon` check has no notion of "foundational vocabulary the target persona already shares." OBS-003 is payments/fraud domain terms; OBS-005 is general product/release-process terms. Both resolve via the jargon allow-list (Phase 4 milestone) — but they argue for \_two_ preset layers: (1) a general PM/product-process preset ("soft launch", "rollout cohort", "cohort", "GA", "MVP") that ships on by default, and (2) per-sub-domain presets (payments/fraud, etc.) plus the user dictionary. The general preset is the higher-leverage fix since process terms appear in nearly every PRD.

---

### OBS-006 — Premature warnings on early document sections (Background/Intro)

**Date:** 2026-06-04\
**Prompt tier:** fast (gemini-3.1-flash-lite)\
**Type flag:** unsupported*claim, clarity\
**Input excerpt:** *"Background... Our transaction decline rate has been climbing..."_ (first section of a new document)\
**Expected:** The system should wait until the document is more fully formed before surfacing missing support/clarity as hard warnings, OR surface them as softer "opportunities".\
**Actual:** Surfaced immediately as in-your-face warnings right after the first section was pasted.\
**Failure mode:** wrong-severity / premature-flagging\
**Notes:** While the logic is technically correct, the \_timing_ violates the spirit of Invariant #4 ("Quiet while generating, opinionated while revising"). A user just starting a document shouldn't immediately be hit with "unsupported claim" warnings before they've had a chance to write the supporting sections. We likely need to differentiate behavior between opportunities and warnings based on document length, or defer expectations (like missing evidence) until a later state. This touches on broader product philosophy (`docs/product-requirements.md` and `docs/features.md`) and should be evaluated as a systemic timing/severity issue, not just a prompt tweak.

---

### OBS-007 — Highlighting spans across block boundaries due to text extraction formatting

**Date:** 2026-06-04\
**Resolved:** 2026-06-04 (R5 — `charOffsetToPmPos` in `ObservationHighlighter.ts`)\
**Prompt tier:** strong (gemini-2.5-pro) / anchoring system\
**Type flag:** strategic_tension (claim anchoring)\
**Input excerpt:** Multiple bullets in the editor.\
**Expected:** The highlight for the tension observation should cleanly wrap only the specific claim (`"Zero increase in confirmed fraud loss rate."`).\
**Actual:** The highlight bleeds across block boundaries, starting at the end of the previous bullet (`"20%."`) and ending halfway through the target bullet.\
**Failure mode:** visual-bug / text-extraction-misalignment\
**Notes:** Fixed by replacing the flat `blockPos + 1 + offset` mapping in `ObservationHighlighter.ts` with `charOffsetToPmPos`, which walks the block's actual text node structure and correctly accounts for list-item/paragraph node boundaries.

---

### OBS-008 — Unanchored observations (missing topics) lack distinct visual treatment

> _Migrated to `docs/logs/ux_quality_observations.md` as UX-001_

---

### OBS-009 — Doc-level "missing topic" checks trigger prematurely during drafting

**Date:** 2026-06-04\
**Prompt tier:** doc-level / strong (gemini-2.5-pro)\
**Type flag:** missing_topic\
**Input excerpt:** User pasting section-by-section (e.g., just reached "Proposed solution").\
**Expected:** The system should wait until the document has a complete structure (or the user stops writing for a significant period) before asserting that major sections (like "scope" or "timeline") are missing.\
**Actual:** "Missing topic" warnings triggered while the user was still actively drafting early sections of the document.\
**Failure mode:** wrong-severity / premature-flagging\
**Notes:** This strongly reinforces **OBS-006**. The timing issue applies not only to fast-tier `unsupported_claim` checks but also to doc-level `missing_topic` checks. Flagging that a proposal lacks a timeline when the user has only just written the objective is a "too early warning" that violates Invariant #4 ("Quiet while generating, opinionated while revising"). Doc-level checks should likely be suppressed or downgraded to "opportunities" until the document reaches a certain length or structural completeness.

---

### OBS-010 — Tone of "missing topic" observations feels abrasive, conflicting with "Register Discipline"

**Date:** 2026-06-04\
**Prompt tier:** doc-level / strong (gemini-2.5-pro)\
**Type flag:** missing*topic\
**Input excerpt:** *"Potential risks, such as new fraud vectors or technical hurdles, are not identified or mitigated."\_\
**Expected (by user):** A softer suggestion to "think about adding a section about potential risks."\
**Actual:** A blunt, factual statement that the structural gap exists.\
**Failure mode:** philosophy-tension / register-discipline\
**Notes:** The user felt the current phrasing was a bit grading/rubric-like and desired a prescriptive suggestion ("think about adding..."). However, `CLAUDE.md` strictly forbids patronizing therapist language ("It might be helpful to...") and leading questions. The model is actually correctly adhering to the "Point out the structural gap... and get out of the way" directive. This highlights a fundamental tension in the product: strictly holding the "provoke, don't prescribe" line can feel abrasive to users accustomed to traditional AI assistants. We must hold the line on the register, but solving the **timing** issue (OBS-009) might naturally soften the blow—blunt feedback is much easier to accept on a "finished" draft than when you're still writing the first paragraph.

---

### OBS-011 — Archived messages lack document context

> _Migrated to `docs/logs/ux_quality_observations.md` as UX-002_

---

### OBS-012 — Observation lifecycle (supersede logic) is noisy, inaccurate, and creates duplicates

**Date:** 2026-06-04\
**Resolved (partial):** 2026-06-04 (R3 — reconciliation improvements in `evaluator.ts`)\
**Prompt tier:** N/A (Lifecycle logic)\
**Type flag:** all (specifically structure_flow, missing_topic, underexposed_topic)\
**Input excerpt:** Multiple evaluation cycles during drafting.\
**Expected:** The system should reliably track observations across evaluations. A message should only be superseded if the user actually addressed it. The user should not see "ghost" messages in the archive that never appeared in the active feed, nor should they see duplicates split across active/archive.\
**Actual:** Three distinct lifecycle bugs observed:

1. **Ghost archiving:** Messages (like `structure_flow`) are generated and superseded in the background before the user ever sees them in the active feed.
2. **False resolution:** Messages are marked as `superseded` even when the text was never actually updated to address the issue (e.g., an `underexposed_topic` archiving itself).
3. **Duplication:** Very similar messages (e.g., two variants of "missing risks") exist simultaneously—one in the active feed and one in the archive. **Failure mode:** lifecycle-logic / deduplication-failure\
   **Notes (updated 2026-06-04):** R1a (remove window-blur cascade) addresses most ghost-archiving by reducing rapid re-eval frequency. R3 adds: full-text `contentSig` (removes 60-char truncation), Jaccard similarity dedup for doc-level observations (stops false-supersede on rephrased text), and prior-observation injection into re-eval prompts (OBS-021 complement). The archive-context UX layer (R3b/R3c) is deferred to Phase 5.

---

### OBS-013 — Opaque prioritization between primary feed and "also noticed"

> _Migrated to `docs/logs/ux_quality_observations.md` as UX-003_

---

### OBS-014 — `window-blurred` triggers spam the event stream and cause premature settling

**Date:** 2026-06-04\
**Resolved:** 2026-06-04 (R1a — removed `handleWindowBlur` settle path from `Editor.tsx`)\
**Prompt tier:** N/A (Client/Editor Architecture)\
**Type flag:** N/A\
**Input excerpt:** Event stream flooded with `settle-blur:window-blurred` triggers.\
**Expected:** Alt-tabbing away from the editor to reference another document should not immediately trigger a hard "settle" or force a document evaluation, as the user is likely still in the middle of drafting.\
**Actual:** The event log shows dozens of `window-blurred` events firing in rapid succession.\
**Failure mode:** architecture-logic / premature-settle\
**Notes:** Fixed by removing the window-blur settle handler entirely. Alt-tab is now a no-op. Settles fire only on cursor-departure, 3s typing pause, and 12s doc-idle. The `"window-blurred"` reason was also removed from the `EvalTrigger` union to prevent re-introduction.

---

### OBS-015 — Doc-level checks (like `structure_flow`) lack anchoring data for highlights

**Date:** 2026-06-04\
**Prompt tier:** doc-level / strong (gemini-2.5-pro)\
**Type flag:** structure*flow (also affects underexposed_topic)\
**Input excerpt:** *"The project's objective is stated redundantly across different sections."_\
**Expected:** The observation should highlight the redundant sections when hovered, just like standard fast-tier observations do.\
**Actual:** No highlight appears on hover because the doc-level JSON schema only returns a text string, without any substring or block references.\
**Failure mode:** schema-limitation / missing-context\
**Notes:** Unlike `missing_topic` (which can't be anchored because the text isn't there), `structure_flow` and `underexposed_topic` critiques almost always refer to text that \_does_ exist in the document. However, the doc-level prompt schema only asks the model to return `{"text": "..."}`. Because the model isn't asked to provide anchoring data (e.g., block IDs or substrings), the UI has no idea what to highlight. The doc-level JSON schema needs to be updated to optionally return anchoring targets so these observations don't feel disconnected.

---

### OBS-016 — `structure_flow` phrasing conflates ordering issues with topic depth

**Date:** 2026-06-04\
**Prompt tier:** doc-level / strong (gemini-2.5-pro)\
**Type flag:** structure*flow\
**Input excerpt:** *"The document opens with solution specifics before fully defining the problem it addresses."_\
**Expected:** The message should clearly distinguish whether the issue is strictly about \_structural ordering_ (e.g., "The solution is presented before the problem") or about _topic depth_ (e.g., "The problem is not fully defined").\
**Actual:** The phrasing blurred the lines between categories. The user interpreted the feedback as an `underexposed_topic` ("I need to explain the problem better"), while the model was primarily flagging that the blocks were out of logical order.\
**Failure mode:** phrasing-ambiguity / category-blurring\
**Notes:** Looking at the earlier logs, block [1] was indeed the "Proposed solution" and block [2] was the "objective." The model was technically correct that they were out of order. However, the phrase "before _fully defining_ the problem" introduced ambiguity, making it sound like a critique on depth rather than structure. The prompt should instruct the model to keep `structure_flow` feedback strictly focused on the _ordering_ and _flow_ of information to prevent users from misinterpreting the core issue.

---

### OBS-017 — Visual corroboration of text extraction misalignment (offset bug)

**Date:** 2026-06-04\
**Resolved:** 2026-06-04 (R5 — same fix as OBS-007)\
**Prompt tier:** N/A (Client/Editor Architecture)\
**Type flag:** CONTRADICTION\
**Input excerpt:** Highlight bleeds from the end of one bullet point `.` to the middle of the next word `infrastru`.\
**Expected:** The highlight should strictly cover the new claim: _"One-tap biometric challenge using existing auth infrastructure."_\
**Actual:** The highlight captures the period at the end of the previous bullet, skips the list formatting entirely, and truncates the final word ("infrastru").\
**Failure mode:** visual-bug / text-extraction-misalignment\
**Notes:** Visual corroboration of OBS-007. Resolved by the same `charOffsetToPmPos` fix in `ObservationHighlighter.ts`.

---

### OBS-018 — `audience_mismatch` used as a catch-all for unsupported claims (and lacks anchoring)

**Date:** 2026-06-04\
**Prompt tier:** doc-level / strong (gemini-2.5-pro)\
**Type flag:** audience*mismatch\
**Input excerpt:** *"The justification for excluding web flows is an unsupported technical assertion."_\
**Expected:** First, unsupported claims should be handled by the fast tier (`unsupported_claim`), not stuffed into `audience_mismatch`. Second, if an observation critiques specific text, it needs a hover highlight.\
**Actual:** The model flagged an unsupported technical claim under `audience_mismatch`. Because it's a doc-level check, it has no highlight anchoring.\
**Failure mode:** category-blurring / schema-limitation\
**Notes:** This is a compound failure. First, it perfectly reinforces **OBS-015**: all doc-level observations (`structure_flow`, `underexposed_topic`, `audience_mismatch`) lack the JSON schema fields to return a highlight substring, rendering them disconnected. Second, the model is using `audience_mismatch` (which is meant for jargon/tone) as a catch-all to complain about a technical claim (Claim [17]: _"Browser does not support this... reliably"\_). The fast-tier is responsible for evaluating unsupported claims; the strong-tier doc prompt needs to be tightened to explicitly forbid evaluating claim evidence under the guise of "audience assumptions."

---

### OBS-019 — Model flags success metrics as unsupported claims despite explicit negative constraints

**Date:** 2026-06-04\
**Prompt tier:** fast (gemini-3.1-flash-lite)\
**Type flag:** unsupported*claim\
**Input excerpt:** *"30% of blocks that are false positives..."_ (User confirms this was part of the success metric: _"False-positive dispute rate drops by at least 30%..."_)\
**Expected:** The model should ignore success metrics and forward-looking goals, as explicitly instructed in the prompt.\
**Actual:** The model flagged a forward-looking success metric as an unsupported statement of fact.\
**Failure mode:** false-positive / instruction-ignore\
**Notes:** The fast-tier prompt explicitly contains this exact negative constraint: _"Do NOT flag... success targets and measurable objectives (e.g. 'false positives drop by ≥30%')"\_. Despite having a literal example of this exact metric in the negative constraint, the `flash-lite` model still got confused by the phrasing and flagged it. This proves that the fast-tier model struggles to distinguish between a prescriptive goal and a descriptive fact when the sentence structure varies slightly, even with direct prompt instructions. We may need to provide few-shot examples rather than just a zero-shot instruction, or simplify the negative constraint.

---

### OBS-020 — Double-invocation of paid models + trigger spam causes massive cost amplification

**Date:** 2026-06-04\
**Resolved:** 2026-06-04 (R1a + R1b in `Editor.tsx` / `orchestrator.ts`)\
**Prompt tier:** N/A (Architecture / Cost)\
**Type flag:** N/A\
**Input excerpt:** Multiple simultaneous calls to `gemini-2.5-pro` in the debug log for a single editing phase.\
**Expected:** The system should efficiently manage expensive LLM calls, batching requests or heavily debouncing them to control costs.\
**Actual:** The system makes _two separate calls_ to the expensive `strong` tier (`gemini-2.5-pro`) on every single "settle" event.\
**Failure mode:** architecture-efficiency / cost-amplification\
**Notes:** Fixed in two parts. R1a removes the window-blur cascade that multiplied settles. R1b serialises the doc-idle strong call behind in-flight section evals via `handleDocIdle` deferral + `dispatch` finally-block trigger, ensuring the doc-level and contradiction strong calls never fire simultaneously.

---

### OBS-021 — Missing context of prior observations during block re-evaluation

**Date:** 2026-06-04\
**Resolved:** 2026-06-04 (R3b in `evaluator.ts`)\
**Prompt tier:** fast / strong (eval orchestrator)\
**Type flag:** all\
**Input excerpt:** A text block that was previously flagged is edited by the user.\
**Expected:** The re-evaluation prompt should include the existing active observations for that block, instructing the model to verify if the new edit successfully addressed the specific issues previously raised.\
**Actual:** The block is evaluated completely fresh (zero-shot). The system relies entirely on client-side reconciliation logic to determine if the new observations supersede the old ones.\
**Failure mode:** architecture-efficiency / context-loss\
**Notes:** Fixed in `evaluateSection`: prior active span observations for the section's member blocks are now loaded and injected into the user prompt. The model may return a `resolved_prior` array of indices confirming resolution; these are force-closed in `reconcileObservations` before the normal orphan-close pass.

---

### OBS-022 — Re-evaluation trades abbreviation jargon flag for expanded form jargon flag

**Date:** 2026-06-06\
**Prompt tier:** fast (gemini-3.1-flash-lite)\
**Type flag:** undefined*jargon\
**Input excerpt:** *"Being a Product Manager, I am not sure..."\_ (Edited from "Being a PM...")\
**Expected:** The model correctly resolves the prior observation for `PM` and accepts the expanded form "Product Manager" without flagging it.\
**Actual:** The model correctly added the prior observation to `resolved_prior`, but redundantly flagged the newly expanded term "Product Manager" as `undefined_jargon`.\
**Failure mode:** false-positive\
**Notes:** While the re-evaluation context injection correctly allowed the model to close the previous issue about "PM" (added via the OBS-021 fix), it immediately flagged the expanded term, effectively replacing one jargon observation with a redundant one. This strongly reinforces the need for the general PM/product-process jargon allow-list (see **OBS-003** and **OBS-005**), as the model lacks baseline domain knowledge of standard product roles.

---

### OBS-023 — Narrative/rhetorical devices flagged as unsupported claims

**Date:** 2026-06-06\
**Prompt tier:** fast (gemini-3.1-flash-lite)\
**Type flag:** unsupported*claim\
**Input excerpt:** *"everyone seems to know something about it, used it or at least heard that 'this is happening'"\_\
**Expected:** The model should recognize this as a colloquial narrative device establishing context, rather than a rigorous factual assertion requiring citation or data.\
**Actual:** The model flagged the statement as a generalization lacking supporting data.\
**Failure mode:** false-positive / pedantry\
**Notes:** The user explicitly attempted to soften a previously flagged absolute claim ("everyone knows") into a more rhetorical/narrative statement. The LLM still applied strict PRD-level factual standards to the phrase. Crucially, the prompt explicitly included `Document context: a public communication about a product`. The model failed to use this provided artifact context to adjust its strictness, treating a public narrative piece with the exact same rigidity as a technical PRD. This highlights that the model struggles to differentiate between rigorous claims (which need evidence) and narrative preamble (where demanding citations is pedantic). We need to steer the LLM to better differentiate these contexts, perhaps by explicitly telling it to ignore colloquialisms and use the `Document context` to calibrate its expectations.

---

### OBS-025 — Duplicate strategic tensions from semantically equivalent claims

**Date:** 2026-06-18\
**Prompt tier:** strong (gemini-2.5-pro, contradiction-sweep)\
**Type flag:** strategic*tension\
**Input excerpt:** Claims list includes both: `[Claim #3]` *"Reduce false-positive friction for legitimate transactions"_ (from "Goal" section) and `[Claim #6]` _"This initiative gives users a path to unblock themselves without contacting support."_ (from "Background" section). Both express the same intent; both are paired with `[Claim #7]` _"Zero increase in confirmed fraud loss rate."\_\
**Expected:** One tension observation: "reducing user friction / self-unblocking is in tension with the zero-fraud-loss constraint."\
**Actual:** Two distinct tension observations surfaced:

- `[Claim #3]` × `[Claim #7]`: _"A zero-increase fraud target is in tension with the goal of reducing friction for legitimate users."_
- `[Claim #6]` × `[Claim #7]`: _"This zero-increase fraud target creates tension with the initiative to let users unblock themselves."_

Both end up as visible cards in the feed, saying essentially the same thing.\
**Failure mode:** duplicate / semantic near-match\
**Notes:** The root cause is that the same strategic intent ("reduce friction / let users self-unblock") is stated in two separate sections and is therefore extracted as two distinct claim entries. The contradiction-sweep model reports each pair separately because it sees them as distinct inputs, not as restatements of the same thing. Two fix paths: (1) **prompt-level** — instruct the model to collapse tensions where claim A and claim B are semantically equivalent restatements, reporting only one; (2) **post-processing** — apply the same Jaccard/semantic dedup already used for doc-level observations to tension outputs before surfacing them. The prompt-level fix is simpler; the post-processing fix is more robust against other near-duplicates. Clusters with the dedup work from OBS-012 (R3).\
**Scheduled (2026-06-18):** `docs/plan.md` Phase 6 → Signal quality → **Strategic-tension dedup (OBS-025)**, 🟢. Decision: **post-processing dedup** (route `strategic_tension` outputs through the existing `planDocReconciliation` Jaccard machinery), per the more-robust path above.

---

### OBS-024 — `clarity_observations.text` copies source text verbatim instead of stating the insight

**Date:** 2026-06-18\
**Prompt tier:** fast (gemini-3.1-flash-lite)\
**Type flag:** clarity\
**Input excerpt:** Section "Success metrics" — _"Support ticket volume for declined transactions decreases by 20%. Zero increase in confirmed fraud loss rate."_\
**Expected:** The `text` field of each `clarity_observations` entry should state _what is unclear_, not quote the document. `substring` already points to the offending text; `text` is the observation. Expected something like: _"No timeframe or baseline is specified for the 20% support ticket reduction."_ / _"No measurement period is specified for the fraud loss rate constraint."_\
**Actual:** Both `text` fields are verbatim copies of the respective document sentences:

- `text`: `"Support ticket volume for declined transactions decreases by 20."` / `substring`: `"decreases by 20%"`
- `text`: `"Zero increase in confirmed fraud loss rate."` / `substring`: `"Zero increase"`

The observation card therefore shows only the quoted metric with no insight — identical to what the user already wrote. Zero value added.\
**Failure mode:** format-misuse / copy-paste output\
**Notes:** The two fields have opposite roles: `substring` = the excerpt that is unclear (already in the document); `text` = the observation explaining _why_ it is unclear (the value the model adds). When the model fills `text` with the same sentence it put in `substring`, the card degenerates to a plain quote. The prompt defines the schema correctly (_"text"_ describes the clarity issue; _"substring"_ is the exact literal text) but provides no explicit instruction that the two fields must differ and that `text` must not simply restate the source. A one-line reinforcement in the schema description — e.g. _"text: a sentence explaining what is vague or missing (must NOT repeat the source text verbatim)"_ — would likely prevent this. Also note: at least one of these clarity flags may itself be a false positive — "Zero increase in confirmed fraud loss rate" is a constraint with a clearly-specified target (zero); the claimed clarity gap exists only if no measurement period is stated.\
**Scheduled (2026-06-18):** folded into `docs/plan.md` Phase 6 → Signal quality → **Fast-tier precision hardening (R6)** as the `clarity` schema-field reinforcement (`text` must state the issue, not restate `substring`).

---

### OBS-026 — Contradiction sweep silently drops conflicts between two claims in the same block

**Date:** 2026-06-25\
**Resolved:** 2026-07-05 (OBS-026 — same-block `emit` guard dropped + single-block whole-block highlight; `src/services/evaluator.ts`, `src/editor/extensions/ObservationHighlighter.ts`; self-pair + same-text guard retained. See `docs/projects/section_eval_precision.md` (OBS-026).)\
**Prompt tier:** strong (gemini-2.5-pro, contradiction-sweep) — but the drop is **post-prompt**, in the consumer, not the model\
**Type flag:** contradiction\
**Input excerpt:** Solution / "how it works" section claims, both extracted from the same section block: _"The challenge window is 60 seconds from the time of the block"_ and _"After 60 seconds, the transaction expires and the user must start over at the merchant."_\
**Expected:** A surfaced `contradiction` — the model correctly returned one in two separate sweeps: _"This 60-second challenge window is incompatible with the 60-second transaction expiry"_ (and again _"…leaving no time for a retry"_). This is arguably the single sharpest issue in the document (the timing window leaves zero time to act).\
**Actual:** Zero contradiction observations surfaced across the whole session — no `contradiction` event in the stream, and `produced.observations` for both sweeps shows `["strategic_tension"]` only. The model's output was discarded by the consumer.\
**Failure mode:** silent drop (consumer-side, not a model error)\
**Notes:** **Not a prompt bug — the model got it right.** The `emit` guard in `evaluateLedgerContradictions` ([`src/services/evaluator.ts:727`](../../src/services/evaluator.ts)) returns early when `a.sourceBlockId === b.sourceBlockId`, i.e. it refuses any conflict whose two claims share a source block. Sweep conflicts are anchored whole-block (`startOffset 0`, `endOffset 9999`), so two spans **inside one block** can't be rendered as the cross-span A↔B highlight the contradiction UI expects — the guard avoids a degenerate self-highlight. Side effect: any **intra-section** contradiction is thrown away before it reaches the feed, and `recordProduced` only logs survivors, so the drop is invisible in the debug log too. The guard is in the shared `emit`, so it also drops intra-block _tensions_; in this session only the contradiction happened to be intra-block. This is an **anchoring limitation, not a signal decision** — and the cost is high because related claims that conflict are most likely to live in the same section. Fix directions: (1) allow same-block conflicts and render them with a distinct intra-block treatment (no two-span highlight, or compute real span offsets from the claim text within the block); (2) at minimum, stop _silently_ dropping — surface as a doc-scope note or log the discard. Clusters with `section_as_eval_unit` (one section = one block = one anchor) and `doc_level_anchoring`.

---

### OBS-027 — Section-eval isolation produces false-positive clarity/jargon/unsupported flags for things defined in sibling sections

**Date:** 2026-06-25\
**Resolved:** 2026-07-05 (OBS-027 — `evaluateSection` injects a gated "Established elsewhere in this document" block: sibling-section summaries + other sections' non-`definition` claims, plus scope + heading-intent rules; `src/services/evaluator.ts`. See `docs/projects/section_eval_precision.md` (OBS-027).)\
**Prompt tier:** fast (gemini-3.1-flash-lite, section-eval)\
**Type flag:** clarity (also exposes undefined*jargon, unsupported_claim — any span check)\
**Input excerpt:** The "Out of scope" section was evaluated with this payload only: *"Out of scope\n\nWeb/desktop flows (browser does not support this notification pattern reliably). Multiple retries. Users who fail the challenge are directed to support."_ + `Document context: <stage>` + glossary. **No sibling-section content or claim ledger was included.**\
**Expected:** No clarity flag for _"this notification pattern"\_ — the push-notification challenge flow it refers to is fully defined in the Solution section two sections up. The span check should resolve a reference against terms/claims the document has already established elsewhere.\
**Actual:** Two clarity false positives:

- `text`: _"The specific notification pattern being referenced is not identified."_ / `substring`: _"this notification pattern"_ — it **is** identified, just in another section the eval couldn't see.
- `text`: _"It is unclear if multiple retries are being explicitly excluded or if they are simply not part of the current implementation."_ / `substring`: _"Multiple retries."_ — this sits under an **Out of scope** header (present in the payload), so "explicitly excluded" is the answer the header already gives.

**Failure mode:** false-positive from missing cross-section context (structural) + section-header under-weighting (secondary)\
**Notes:** This is a structural consequence of `section_as_eval_unit` (`docs/projects/section_as_eval_unit.md`): the section is the atomic eval unit and the LLM's view is one section's `combinedText` + stage + glossary. That is correct for _extraction_ (claims, summary) but lossy for _reference-resolution_ span checks (clarity / undefined*jargon / unsupported_claim), which need to know what the rest of the document has already defined or asserted. A term/flow defined in §Solution looks "undefined" when §Out-of-scope is judged alone. The cheap fix reuses artifacts that already exist: inject the **other sections' block summaries** (already computed for the doc-quality call) and/or the **active claim ledger** as a "context the document has already established — do not flag these as undefined/unsupported" block in the section-eval prompt. The secondary facet (the model not weighting its own "Out of scope" header) is prompt-tuning — add an instruction to treat the section heading as governing intent (items under "Out of scope" / "Non-goals" are deliberate exclusions, not gaps). Distinct from OBS-026 (that's the \_cross-block contradiction* anchoring drop; this is _cross-section context_ missing from the span-eval input). Clusters with `section_as_eval_unit` and `doc_level_anchoring`.

---

### OBS-028 — First-person opinion / apprehension flagged as unsupported claim (PRD-strictness on an essay); plus re-anchor churn in a single growing section

**Date:** 2026-07-02\
**Prompt tier:** fast (gemini-3.1-flash-lite, section-eval)\
**Type flag:** unsupported*claim (secondary: lifecycle / dedup)\
**Input excerpt:** A first-person essay draft "Writing in age of AI": *"I have a concern that using AI tools to create documents can hurt my skill to do so. Like any muscle that is getting weaker when not used, I fear that my ability to write documents on my own might be affected…"_\
**Expected:** No unsupported-claim flag. The statement is an explicitly hedged **first-person apprehension** ("I have a concern that…", "I fear that…"), not an unattributed declarative assertion about the current state of the world. The prompt already restricts this check to _"unattributed declarative assertions about the current state of the world."\_ Even as a soft "add evidence" nudge it is redundant on an opinion piece.\
**Actual:** Two distinct defects across the session:

1. **False positive (fit).** The concern was flagged: _"The assertion that AI-assisted writing causes a decline in personal writing ability is presented as a general fact without supporting evidence or research."_ The model read an "I fear…" opinion as a factual claim needing citation.
2. **Churn / duplication.** Because the whole draft is a single section (one heading + several body blocks), each re-eval re-located the _same_ concern to a _different_ substring: `"using AI tools…"` → archived `resolved_prior` → re-emitted → `"Like any muscle…"`. Anchor-identity dedup keys on `(blockId + normalized anchorText)`, so a re-anchored-to-a-different-sentence re-emission looks like a **new** observation and escapes dedup, producing the perceived duplicate/churn.

**Failure mode:** false-positive / pedantry (facet 1) + lifecycle-churn / dedup-miss (facet 2)\
**Notes:** **Facet 1 is the hinge to the scope decision.** The model applied PRD-grade citation strictness to a personal essay; the `Document context` field exists but the eval doesn't use it to relax strictness (identical root cause to OBS-023, where `Document context: a public communication about a product` was ignored). The durable fix is not another negative example — it's making **document type a first-class calibrator of eval strictness/taxonomy** (see the 2026-07-02 scope-broadening decision, `docs/projects/document_type_calibration.md`). A tactical carve-out — "first-person hedged opinions/apprehensions ('I fear…', 'I'm concerned that…') are not unsupported claims" — should land in the fast-tier `unsupported_claim` instructions in the meantime. Clusters with OBS-023 (rhetorical/narrative devices), OBS-006 (premature strictness). **Facet 2** clusters with OBS-012 / R3 (lifecycle dedup) and is aggravated by the single-giant-section shape — the anchor-identity dedup should tolerate a same-observation re-anchoring within one block (same type + high text similarity ⇒ keep-by-id, don't re-emit). Cross-reference the section-growth churn to `docs/projects/section_eval_precision.md` and the reconciler.

---

### OBS-029 — Heading-only section (no body) hallucinates a fabricated PRD; regression of the section_as_eval_unit fix

**Date:** 2026-07-02\
**Resolved:** 2026-07-02 (OBS-029 — bodyless-heading short-circuit in `evaluateSection`: a section with no non-heading body text is inert (retire claims/observations, empty summary + hash, no model call); `src/services/evaluator.ts`. See `docs/projects/section_eval_precision.md` (OBS-029).)\
**Prompt tier:** fast (gemini-3.1-flash-lite, section-eval) — cascading into a paid strong contradiction call\
**Type flag:** claims (extraction), clarity, unsupported_claim, and a downstream strategic_tension\
**Input excerpt:** Section-eval payload was a **heading with no body** — literally `"Writing in age of AI\n"` — produced transiently when the user toggled the first paragraph to H1 (splitting the single section into a heading-only section + a new section). The 20-char heading clears the only guard, `cleanText.length < 10` ([`src/services/evaluator.ts:126`](../../src/services/evaluator.ts)).\
**Expected:** A heading with no body carries no content to extract. The section should be **inert** — no model call, no claims, no observations — exactly the guarantee `section_as_eval_unit` was built to provide ("a heading was evaluated in isolation with no body — producing hallucinations", `src/editor/section.ts:9–11`).\
**Actual:** The model **fabricated an entire PRD that does not exist in the document**:

- claim (metric): _"Generative AI tools reduce the time required for drafting initial content by 50%."_
- claim (constraint): _"All content teams must implement AI-assisted review cycles by the end of Q4."_
- clarity: _"The 50% reduction metric lacks a baseline…"_
- unsupported*claim: *"Generative AI tools improve overall content quality"\_ — a substring that appears **nowhere** in the user's text.

The fabricated claims were written to the ledger, then a **paid `gemini-2.5-pro` contradiction call** ran a real claim ("developing writtten… non-invasive") against the fabricated "AI-assisted review cycle" claim and surfaced a **`strategic_tension` card to the user**: _"The goal of a 'non-invasive' tool is in tension with the mandate for an 'AI-assisted review cycle'."_ — a tension between real text and invention.\
**Failure mode:** hallucination (empty-body extraction) → ledger pollution → false paid contradiction/tension surfaced\
**Notes:** The `section_as_eval_unit` fix removed the _per-block heading-in-isolation_ path, but the section grain can **still** produce a heading-only payload whenever a section has a heading and no body — most easily via a block-type toggle, but also a heading typed before its body, or a body deleted under a heading. The guard is length-only; a heading ≥10 chars sails through. **Fix (Issue A):** treat a section whose non-heading member text is empty as **inert** — short-circuit before the model call (same path as the `<10` case: retire claims/observations, save an empty summary/hash), so a bodyless heading never reaches the LLM. Additionally, the strong contradiction call should not run on claims freshly extracted from a just-restructured section (defense in depth). This episode was triggered by a toggle→revert, which is _also_ the motivating case for revert-aware evaluation (`docs/logs/ux_quality_observations.md` UX-014, `docs/projects/revert_aware_evaluation.md`) — but the hallucination guard is independent and must land regardless. Design + Todo in `docs/projects/section_eval_precision.md` (OBS-029). Minor adjacent artifact: a stray `/` leaked into one payload (`"/I have a concern…"`), likely a slash-menu/toggle residue — low priority.

---

### OBS-030 — "Out of scope" claims treated as live commitments by the cross-claim contradiction check

**Date:** 2026-07-05\
**Prompt tier:** strong (sweep/section contradiction check, `CONTRADICTION_SWEEP_SYSTEM_PROMPT` / `CONTRADICTION_SYSTEM_PROMPT_HEDGED`, `src/services/evaluatorPrompts.ts:103,127,145`)\
**Type flag:** contradiction (High confidence)\
**Input excerpt:** A rollout spec's **Out of scope** section states _"Multiple concurrent retries across devices."_ (a deliberate exclusion) while the Solution section states a payment retry _"up to three times."_ The model returned: _"This sets a limit of three retries, which the concurrent device retries in Claim #1 could exceed."_\
**Expected:** No contradiction (or at most a very soft, low-confidence conditional note). An item under an **Out of scope** header is an explicit non-commitment — there is nothing live to conflict with a stated limit, since the excluded behavior isn't happening at all.\
**Actual:** The check extracted the out-of-scope line as an ordinary claim and compared it against the retry-limit claim with no awareness that its source section was a scope exclusion, surfacing a **High-confidence contradiction** between a real commitment and a claim the document explicitly disclaimed.\
**Failure mode:** false-positive (source-section intent ignored) at inflated confidence\
**Notes:** This is the **same root cause as OBS-027** ("Multiple retries." under an Out-of-scope header misread as an ambiguity by the span/clarity check) recurring in a different check: neither claim extraction nor the contradiction prompts carry any notion that a claim's governing section marks it as excluded rather than asserted. OBS-027's planned fix (heading-governs-intent instruction, "items under Out of scope / Non-goals are deliberate exclusions, not gaps") was scoped to the section-eval span-check prompt only — it needs to **also** reach the claim-extraction step (tag such claims, e.g. `scope: excluded`) and the contradiction prompts (skip or heavily downweight conflicts where either claim is `scope: excluded`). Without that tag, the contradiction check has no signal to distinguish a real commitment from a stated non-goal anywhere in the pipeline. → extends `docs/projects/section_eval_precision.md` (OBS-027).

---

### OBS-031 — Sweep contradiction prompt paraphrases claim content into a fabricated detail, and misclassifies an unresolved ambiguity as `strategic_tension`

**Date:** 2026-07-05\
**Resolved:** 2026-07-06 — all four contradiction prompts now require the `message` to quote/closely restate the compared claim's own words (stops the "threshold" → "user segment" paraphrase drift) and forbid `[Claim #N]` labels (UX-017). **Bucket decision (with the user): suppress in sweep** — a "NOT A CONFLICT" rule tells the model that two compatible claims whose interaction is merely unspecified belong in neither bucket (they are a clarity gap), so they stop being force-fit into `strategic_tension`; the section-level `clarity` check surfaces the underspecification. No new observation type. Guarded by the `contradiction-sweep-fidelity` ratchet fixture (first Tier-1 coverage of the sweep path) + a numbered-label lint in `evalRatchet.test.ts`. `src/services/evaluatorPrompts.ts`. (OBS-030's out-of-scope facet split to Phase 7 — see the "Scope-excluded claim tagging" Todo.)\
**Prompt tier:** strong (sweep contradiction check, `CONTRADICTION_SWEEP_SYSTEM_PROMPT`, `src/services/evaluatorPrompts.ts:127`)\
**Type flag:** strategic_tension (Medium confidence)\
**Input excerpt:** Claims: _"The soft-landing retry ships to 10% of traffic in week one…"_ and _"Gate it behind the FLARE threshold."_ Returned message: _"This commits to a 10% traffic rollout, while Claim #0 gates the feature to a specific user segment."_\
**Expected:** Either no observation, or (if the two rollout-scoping mechanisms are genuinely under-specified together) a flag that the **relationship between the traffic percentage and the threshold gate is unstated** — an ambiguity, since a percentage rollout and a metric threshold aren't inherently opposed; they can compose (threshold-gated, applied within the 10%).\
**Actual:** Two compounding defects: (1) **fabrication** — "gates the feature to a specific user segment" is not a paraphrase of "FLARE threshold," it invents an audience-segmentation meaning for what is stated as a metric condition; (2) **wrong bucket** — the two claims aren't "each intended but pulling in opposite directions" (the `strategic_tension` definition), they're two independent scoping mechanisms whose composition is simply unspecified. Neither prompt example nor instruction covers this middle case (two claims that are compatible but underspecified in how they combine).\
**Failure mode:** hallucinated paraphrase + type misclassification (no bucket exists for "unspecified interaction between two claims")\
**Notes:** The `message` field instruction ("a short observation... phrased about the *later* claim") gives the model latitude to characterize a claim in its own words rather than quote/closely paraphrase it — nothing constrains that characterization to stay faithful to what the claim actually says, which is how "threshold" became "user segment." Tactical fix: instruct the prompt to quote or closely restate the compared claim's own language rather than re-describing it. The type-bucket gap (composable-but-unspecified-interaction) may warrant a third bucket or should route to a doc-level `clarity`/ambiguity flag instead of being forced into `contradiction`/`strategic_tension` — needs a design decision, not just a prompt tweak. Clusters with OBS-004 (bucket precedent) and OBS-018 (catch-all category absorbing an unhandled case).
