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
- [x] **Tension vs. contradiction** — reserve the `contradiction` type for genuine logical incompatibility; route strategic tradeoffs to the `strategic_tension` type and tighten the contradiction prompt accordingly. (See OBS-004.) **Done 2026-06-04** — both contradiction prompts (confident + hedged) now sort conflicts into `contradictions` vs `tensions`; `strategic_tension` ships as an `opportunity`-kind span observation (priority 1.5, never floored). Commit in the Phase 4 `strategic_tension` work.

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
