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

| Phase | Work |
|---|---|
| 5 (or 6) | Scheduled remediation sprint: batch-fix accumulated failure patterns, update affected prompts, add regression fixtures to `src/services/eval-fixtures/` (see evaluator quality ratchet). |
| Ongoing | Any session — add observations as they are found. No code change; just append an entry. |

---

## Todo

### Next remediation sprint

- [ ] **Attributed-claim carve-out** — add one sentence to the fast-call `unsupported_claim` instructions: claims explicitly attributed to a named source, team, or study are not unsupported. Pattern: "per X's analysis", "according to the data team", "X research shows". (See OBS-001.)
- [ ] **Claim kind disambiguation** — the fast model consistently conflates `commitment`/`constraint` with `metric`. Add per-kind one-line examples to the claims instruction. (See OBS-002.)
- [ ] **Jargon allow-list** — foundational domain vocabulary should not be flagged as undefined. Two preset layers: a general PM/product-process preset on by default, plus per-sub-domain presets and a user dictionary. Tie into the jargon allow-list Phase 4 milestone. (See OBS-003, OBS-005.)
- [x] **Tension vs. contradiction** — reserve the `contradiction` type for genuine logical incompatibility; route strategic tradeoffs to the `strategic_tension` type and tighten the contradiction prompt accordingly. (See OBS-004.) **Done 2026-06-04**
- [ ] **Re-evaluation context** — Update the evaluation orchestrator to inject a block's active observations into the LLM prompt when re-evaluating a modified block, enabling targeted verification of user fixes. (See OBS-021.)

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

**Date:** 2026-06-04  
**Prompt tier:** fast (gemini-3.1-flash-lite)  
**Type flag:** unsupported_claim  
**Input excerpt:** *"The root cause, per the fraud team's analysis, is that legitimate users are being blocked by overly aggressive rules with no way to dispute in real time."*  
**Expected:** No flag — the claim is explicitly attributed to the fraud team's analysis. Attribution IS the support.  
**Actual:** Flagged as unsupported: *"The assertion that the root cause of the decline rate increase is specifically due to overly aggressive rules lacks supporting data."*  
**Failure mode:** false-positive  
**Notes:** The fast-call prompt already carves out success targets ("Do NOT flag opinions, plans, goals, or success targets"). It needs a second carve-out: claims attributed to a named source/team. Pattern: "per X's analysis", "according to X", "X's research shows", "the data shows". This is the most trust-damaging false-positive class — the author explicitly cited evidence and the tool ignores it.

---

### OBS-002 — Goal/constraint statements misclassified as metrics

**Date:** 2026-06-04  
**Prompt tier:** fast (gemini-3.1-flash-lite)  
**Type flag:** claims extraction (claim kind)  
**Input excerpt:** Section "Goal": *"Reduce false-positive friction for legitimate transactions while maintaining our fraud block rate at or above current levels."*  
**Expected:** `"Reduce false-positive friction…"` → kind: `commitment`; `"maintaining our fraud block rate at or above current levels"` → kind: `constraint`.  
**Actual:** Both tagged as `kind: "metric"`.  
**Failure mode:** misclassification  
**Notes:** Wrong kind breaks downstream escalation. The `computePriority` commitment×commitment rule fires only when two `commitment`-kind claims contradict each other — if goal statements are typed as `metric`, the escalation to `high` severity never triggers. The fix is per-kind examples in the claims instruction, not a structural change:
- `commitment`: "We will ship X", "The team will reduce Y"
- `constraint`: "must not exceed", "requires approval from", "at or above current levels"
- `metric`: a numbered target or measurement, "drops by 30%", "latency under 200ms"
- `fact_claim`: an assertion about the world that could be verified or cited

---

### OBS-003 — Standard domain vocabulary flagged as undefined jargon

**Date:** 2026-06-04  
**Prompt tier:** fast (gemini-3.1-flash-lite)  
**Type flag:** undefined_jargon  
**Input excerpt:** *"Reduce false-positive friction for legitimate transactions"*  
**Expected:** No jargon flag — "false-positive" is standard payments/fraud vocabulary.  
**Actual:** Flagged: *"The term 'false-positive' is used without defining the specific criteria for what constitutes a false positive in this transaction system."*  
**Failure mode:** false-positive  
**Notes:** This is the driving motivating example for the jargon allow-list (Phase 4 milestone). Other terms from the same doc that should be in a payments/fraud domain preset: "dispute rate", "fraud block rate", "declined transactions", "false-positive friction". The allow-list needs both a user-configurable layer and sensible domain presets seeded from real PM sub-domains. Until the allow-list ships, this will keep producing noise on any payment-domain document.

---

### OBS-004 — Strategic tradeoff flagged as a hard contradiction

**Date:** 2026-06-03  
**Prompt tier:** strong (contradiction check)  
**Type flag:** contradiction  
**Input excerpt:** A strategic tradeoff in a fraud PRD — notifying users on a fraud block creates friction, *vs.* not notifying trains bad behaviour. (Two desirable goals in tension, not a factual paradox.)  
**Expected:** Either no contradiction flag, or a softer "tension" observation. The two statements are not logically incompatible — they describe a deliberate tradeoff the author is reasoning about.  
**Actual:** Flagged as a hard logical contradiction by the contradiction check.  
**Failure mode:** misclassification (false-positive contradiction)  
**Notes:** Captured from the 2026-06-03 evaluation signal-quality review (`docs/snapshots/2026-06-03_evaluation_signal_quality_review.md`). The remedy is the planned `strategic_tension` observation type (Phase 4 milestone) — give the model a bucket for philosophical/strategic conflicts that aren't factual paradoxes, and tighten the contradiction prompt to reserve `contradiction` for genuine logical incompatibility. Until then the un-hedged contradiction prompt presents these tradeoffs with unwarranted confidence, which is trust-damaging on exactly the kind of nuanced reasoning PMs value.

---

### OBS-005 — Tech / product-process vocabulary flagged as undefined jargon

**Date:** 2026-06-03  
**Prompt tier:** fast  
**Type flag:** undefined_jargon  
**Input excerpt:** *"soft launch"*, *"rollout cohort"* (standard product-rollout vocabulary in a PRD).  
**Expected:** No jargon flag — these are foundational product/release-process terms, not undefined domain jargon.  
**Actual:** Both flagged as undefined jargon.  
**Failure mode:** false-positive  
**Notes:** Captured from the 2026-06-03 evaluation signal-quality review. **Clusters with OBS-003** into a single Failure Pattern: the fast `undefined_jargon` check has no notion of "foundational vocabulary the target persona already shares." OBS-003 is payments/fraud domain terms; OBS-005 is general product/release-process terms. Both resolve via the jargon allow-list (Phase 4 milestone) — but they argue for *two* preset layers: (1) a general PM/product-process preset ("soft launch", "rollout cohort", "cohort", "GA", "MVP") that ships on by default, and (2) per-sub-domain presets (payments/fraud, etc.) plus the user dictionary. The general preset is the higher-leverage fix since process terms appear in nearly every PRD.

---

### OBS-006 — Premature warnings on early document sections (Background/Intro)

**Date:** 2026-06-04  
**Prompt tier:** fast (gemini-3.1-flash-lite)  
**Type flag:** unsupported_claim, clarity  
**Input excerpt:** *"Background... Our transaction decline rate has been climbing..."* (first section of a new document)  
**Expected:** The system should wait until the document is more fully formed before surfacing missing support/clarity as hard warnings, OR surface them as softer "opportunities".  
**Actual:** Surfaced immediately as in-your-face warnings right after the first section was pasted.  
**Failure mode:** wrong-severity / premature-flagging  
**Notes:** While the logic is technically correct, the *timing* violates the spirit of Invariant #4 ("Quiet while generating, opinionated while revising"). A user just starting a document shouldn't immediately be hit with "unsupported claim" warnings before they've had a chance to write the supporting sections. We likely need to differentiate behavior between opportunities and warnings based on document length, or defer expectations (like missing evidence) until a later state. This touches on broader product philosophy (`docs/product-requirements.md` and `docs/features.md`) and should be evaluated as a systemic timing/severity issue, not just a prompt tweak.

---

### OBS-007 — Highlighting spans across block boundaries due to text extraction formatting

**Date:** 2026-06-04  
**Prompt tier:** strong (gemini-2.5-pro) / anchoring system  
**Type flag:** strategic_tension (claim anchoring)  
**Input excerpt:** Multiple bullets in the editor.  
**Expected:** The highlight for the tension observation should cleanly wrap only the specific claim (`"Zero increase in confirmed fraud loss rate."`).  
**Actual:** The highlight bleeds across block boundaries, starting at the end of the previous bullet (`"20%."`) and ending halfway through the target bullet.  
**Failure mode:** visual-bug / text-extraction-misalignment  
**Notes:** Looking at the payload sent to the LLM, the text from the bullets is being concatenated without spaces or newlines: `...decreases by 20%.Zero increase...`. Because the raw text stream fed to the model drops the block boundaries, the character offsets or substring-matching used for the ProseMirror decorations get misaligned. This is an architecture/editor-integration bug rather than a prompt failure, but it degrades the trust in the text analysis. The document text extraction logic needs to safely join blocks (e.g., with spaces or line breaks) so that anchoring decorations map back precisely.

---

### OBS-008 — Unanchored observations (missing topics) lack distinct visual treatment

> *Migrated to `docs/projects/ux_quality_observations.md` as UX-001*

---

### OBS-009 — Doc-level "missing topic" checks trigger prematurely during drafting

**Date:** 2026-06-04  
**Prompt tier:** doc-level / strong (gemini-2.5-pro)  
**Type flag:** missing_topic  
**Input excerpt:** User pasting section-by-section (e.g., just reached "Proposed solution").  
**Expected:** The system should wait until the document has a complete structure (or the user stops writing for a significant period) before asserting that major sections (like "scope" or "timeline") are missing.  
**Actual:** "Missing topic" warnings triggered while the user was still actively drafting early sections of the document.  
**Failure mode:** wrong-severity / premature-flagging  
**Notes:** This strongly reinforces **OBS-006**. The timing issue applies not only to fast-tier `unsupported_claim` checks but also to doc-level `missing_topic` checks. Flagging that a proposal lacks a timeline when the user has only just written the objective is a "too early warning" that violates Invariant #4 ("Quiet while generating, opinionated while revising"). Doc-level checks should likely be suppressed or downgraded to "opportunities" until the document reaches a certain length or structural completeness.

---

### OBS-010 — Tone of "missing topic" observations feels abrasive, conflicting with "Register Discipline"

**Date:** 2026-06-04  
**Prompt tier:** doc-level / strong (gemini-2.5-pro)  
**Type flag:** missing_topic  
**Input excerpt:** *"Potential risks, such as new fraud vectors or technical hurdles, are not identified or mitigated."*  
**Expected (by user):** A softer suggestion to "think about adding a section about potential risks."  
**Actual:** A blunt, factual statement that the structural gap exists.  
**Failure mode:** philosophy-tension / register-discipline  
**Notes:** The user felt the current phrasing was a bit grading/rubric-like and desired a prescriptive suggestion ("think about adding..."). However, `CLAUDE.md` strictly forbids patronizing therapist language ("It might be helpful to...") and leading questions. The model is actually correctly adhering to the "Point out the structural gap... and get out of the way" directive. This highlights a fundamental tension in the product: strictly holding the "provoke, don't prescribe" line can feel abrasive to users accustomed to traditional AI assistants. We must hold the line on the register, but solving the **timing** issue (OBS-009) might naturally soften the blow—blunt feedback is much easier to accept on a "finished" draft than when you're still writing the first paragraph.

---

### OBS-011 — Archived messages lack document context

> *Migrated to `docs/projects/ux_quality_observations.md` as UX-002*

---

### OBS-012 — Observation lifecycle (supersede logic) is noisy, inaccurate, and creates duplicates

**Date:** 2026-06-04  
**Prompt tier:** N/A (Lifecycle logic)  
**Type flag:** all (specifically structure_flow, missing_topic, underexposed_topic)  
**Input excerpt:** Multiple evaluation cycles during drafting.  
**Expected:** The system should reliably track observations across evaluations. A message should only be superseded if the user actually addressed it. The user should not see "ghost" messages in the archive that never appeared in the active feed, nor should they see duplicates split across active/archive.  
**Actual:** Three distinct lifecycle bugs observed:
1. **Ghost archiving:** Messages (like `structure_flow`) are generated and superseded in the background before the user ever sees them in the active feed.
2. **False resolution:** Messages are marked as `superseded` even when the text was never actually updated to address the issue (e.g., an `underexposed_topic` archiving itself).
3. **Duplication:** Very similar messages (e.g., two variants of "missing risks") exist simultaneously—one in the active feed and one in the archive.
**Failure mode:** lifecycle-logic / deduplication-failure  
**Notes:** This indicates that the cross-run observation deduplication and reconciliation logic (which compares old vs. new observations between eval runs) is failing. It's churning the feed, erroneously retiring valid feedback, and clogging the archive with noise. This requires a structural fix to the observation reconciliation engine (`docs/architecture.md` / `docs/features.md`), not a prompt tweak.

---

### OBS-013 — Opaque prioritization between primary feed and "also noticed"

> *Migrated to `docs/projects/ux_quality_observations.md` as UX-003*

---

### OBS-014 — `window-blurred` triggers spam the event stream and cause premature settling

**Date:** 2026-06-04  
**Prompt tier:** N/A (Client/Editor Architecture)  
**Type flag:** N/A  
**Input excerpt:** Event stream flooded with `settle-blur:window-blurred` triggers.  
**Expected:** Alt-tabbing away from the editor to reference another document should not immediately trigger a hard "settle" or force a document evaluation, as the user is likely still in the middle of drafting.  
**Actual:** The event log shows dozens of `window-blurred` events firing in rapid succession.  
**Failure mode:** architecture-logic / premature-settle  
**Notes:** You were likely alt-tabbing to copy text from `phase1-test-text.md`. Each time the window blurred, the system registered a `settle-blur` trigger. If the architecture uses a window-blur event to force the debounce timer to "settle" and trigger an evaluation, this perfectly explains **OBS-009** (premature warnings) and **OBS-012** (noisy lifecycles). The system erroneously assumes you are "done" writing every time you switch windows to look at reference material. The client-side logic needs to decouple window focus from document completeness. We likely need a longer idle timer or structural completeness check before triggering expensive doc-level evaluations.

---

### OBS-015 — Doc-level checks (like `structure_flow`) lack anchoring data for highlights

**Date:** 2026-06-04  
**Prompt tier:** doc-level / strong (gemini-2.5-pro)  
**Type flag:** structure_flow (also affects underexposed_topic)  
**Input excerpt:** *"The project's objective is stated redundantly across different sections."*  
**Expected:** The observation should highlight the redundant sections when hovered, just like standard fast-tier observations do.  
**Actual:** No highlight appears on hover because the doc-level JSON schema only returns a text string, without any substring or block references.  
**Failure mode:** schema-limitation / missing-context  
**Notes:** Unlike `missing_topic` (which can't be anchored because the text isn't there), `structure_flow` and `underexposed_topic` critiques almost always refer to text that *does* exist in the document. However, the doc-level prompt schema only asks the model to return `{"text": "..."}`. Because the model isn't asked to provide anchoring data (e.g., block IDs or substrings), the UI has no idea what to highlight. The doc-level JSON schema needs to be updated to optionally return anchoring targets so these observations don't feel disconnected.

---

### OBS-016 — `structure_flow` phrasing conflates ordering issues with topic depth

**Date:** 2026-06-04  
**Prompt tier:** doc-level / strong (gemini-2.5-pro)  
**Type flag:** structure_flow  
**Input excerpt:** *"The document opens with solution specifics before fully defining the problem it addresses."*  
**Expected:** The message should clearly distinguish whether the issue is strictly about *structural ordering* (e.g., "The solution is presented before the problem") or about *topic depth* (e.g., "The problem is not fully defined").  
**Actual:** The phrasing blurred the lines between categories. The user interpreted the feedback as an `underexposed_topic` ("I need to explain the problem better"), while the model was primarily flagging that the blocks were out of logical order.  
**Failure mode:** phrasing-ambiguity / category-blurring  
**Notes:** Looking at the earlier logs, block [1] was indeed the "Proposed solution" and block [2] was the "objective." The model was technically correct that they were out of order. However, the phrase "before *fully defining* the problem" introduced ambiguity, making it sound like a critique on depth rather than structure. The prompt should instruct the model to keep `structure_flow` feedback strictly focused on the *ordering* and *flow* of information to prevent users from misinterpreting the core issue.

---

### OBS-017 — Visual corroboration of text extraction misalignment (offset bug)

**Date:** 2026-06-04  
**Prompt tier:** N/A (Client/Editor Architecture)  
**Type flag:** CONTRADICTION  
**Input excerpt:** Highlight bleeds from the end of one bullet point `.` to the middle of the next word `infrastru`.  
**Expected:** The highlight should strictly cover the new claim: *"One-tap biometric challenge using existing auth infrastructure."*  
**Actual:** The highlight captures the period at the end of the previous bullet, skips the list formatting entirely, and truncates the final word ("infrastru").  
**Failure mode:** visual-bug / text-extraction-misalignment  
**Notes:** This screenshot provides direct visual proof of the underlying architectural bug identified in **OBS-007**. Because the text extracted from the ProseMirror editor strips block boundaries (like newlines and list elements), the string offsets the UI uses to anchor the highlight get misaligned. It shifts the highlight backwards, catching the period of the preceding line and chopping off the end of the intended target. This confirms that fixing the text extraction/anchoring logic is an absolute necessity for visual trust.

---

### OBS-018 — `audience_mismatch` used as a catch-all for unsupported claims (and lacks anchoring)

**Date:** 2026-06-04  
**Prompt tier:** doc-level / strong (gemini-2.5-pro)  
**Type flag:** audience_mismatch  
**Input excerpt:** *"The justification for excluding web flows is an unsupported technical assertion."*  
**Expected:** First, unsupported claims should be handled by the fast tier (`unsupported_claim`), not stuffed into `audience_mismatch`. Second, if an observation critiques specific text, it needs a hover highlight.  
**Actual:** The model flagged an unsupported technical claim under `audience_mismatch`. Because it's a doc-level check, it has no highlight anchoring.  
**Failure mode:** category-blurring / schema-limitation  
**Notes:** This is a compound failure. First, it perfectly reinforces **OBS-015**: all doc-level observations (`structure_flow`, `underexposed_topic`, `audience_mismatch`) lack the JSON schema fields to return a highlight substring, rendering them disconnected. Second, the model is using `audience_mismatch` (which is meant for jargon/tone) as a catch-all to complain about a technical claim (Claim [17]: *"Browser does not support this... reliably"*). The fast-tier is responsible for evaluating unsupported claims; the strong-tier doc prompt needs to be tightened to explicitly forbid evaluating claim evidence under the guise of "audience assumptions."

---

### OBS-019 — Model flags success metrics as unsupported claims despite explicit negative constraints

**Date:** 2026-06-04  
**Prompt tier:** fast (gemini-3.1-flash-lite)  
**Type flag:** unsupported_claim  
**Input excerpt:** *"30% of blocks that are false positives..."* (User confirms this was part of the success metric: *"False-positive dispute rate drops by at least 30%..."*)  
**Expected:** The model should ignore success metrics and forward-looking goals, as explicitly instructed in the prompt.  
**Actual:** The model flagged a forward-looking success metric as an unsupported statement of fact.  
**Failure mode:** false-positive / instruction-ignore  
**Notes:** The fast-tier prompt explicitly contains this exact negative constraint: *"Do NOT flag... success targets and measurable objectives (e.g. 'false positives drop by ≥30%')"*. Despite having a literal example of this exact metric in the negative constraint, the `flash-lite` model still got confused by the phrasing and flagged it. This proves that the fast-tier model struggles to distinguish between a prescriptive goal and a descriptive fact when the sentence structure varies slightly, even with direct prompt instructions. We may need to provide few-shot examples rather than just a zero-shot instruction, or simplify the negative constraint.

---

### OBS-020 — Double-invocation of paid models + trigger spam causes massive cost amplification

**Date:** 2026-06-04  
**Prompt tier:** N/A (Architecture / Cost)  
**Type flag:** N/A  
**Input excerpt:** Multiple simultaneous calls to `gemini-2.5-pro` in the debug log for a single editing phase.  
**Expected:** The system should efficiently manage expensive LLM calls, batching requests or heavily debouncing them to control costs.  
**Actual:** The system makes *two separate calls* to the expensive `strong` tier (`gemini-2.5-pro`) on every single "settle" event.  
**Failure mode:** architecture-efficiency / cost-amplification  
**Notes:** One paid call evaluates the claim ledger (`contradictions`, `tensions`), and a second simultaneous paid call evaluates the doc-level structure (`missing_topic`, etc.). Because of the `window-blurred` bug (**OBS-014**), a single copy-paste action by an alt-tabbing user can generate multiple "settle" events. This means the user is burning 4-6 paid-tier invocations just to paste a paragraph! Furthermore, the logs show the fast-tier (`flash-lite`) *is* actually running and finding valid issues (`clarity`, `undefined_jargon`), but you noted you aren't seeing them in the main UI. This means the fast-tier feedback is likely being buried by the opaque sorting algorithm (**OBS-013**) or aggressively archived by the thrashing deduplication engine (**OBS-012**). The current architecture burns expensive tokens while hiding the output of the free tokens.

---

### OBS-021 — Missing context of prior observations during block re-evaluation

**Date:** 2026-06-04  
**Prompt tier:** fast / strong (eval orchestrator)  
**Type flag:** all  
**Input excerpt:** A text block that was previously flagged is edited by the user.  
**Expected:** The re-evaluation prompt should include the existing active observations for that block, instructing the model to verify if the new edit successfully addressed the specific issues previously raised.  
**Actual:** The block is evaluated completely fresh (zero-shot). The system relies entirely on client-side reconciliation logic to determine if the new observations supersede the old ones.  
**Failure mode:** architecture-efficiency / context-loss  
**Notes:** By not passing the existing observations as context during a re-evaluation, the model loses the ability to perform targeted verification ("Did the user fix X?"). Providing this context could dramatically improve the accuracy of the supersede/resolve lifecycle, as the LLM could explicitly confirm if the edit resolved the prior critique.
