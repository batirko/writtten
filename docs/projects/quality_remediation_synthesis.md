---
status: idea
kind: research
phases: [4, 5, 6]
summary: Root-cause synthesis of the prompt-quality and UX-quality observation logs — collapses the ~32 field-observed issues into a handful of cross-cutting root causes, sequences the fixes, and names which are Phase 4 acceptance blockers vs. later remediation.
---

# Quality Remediation Synthesis

> Reads the two living logs — `docs/logs/prompt_quality_observations.md` (OBS-NNN) and `docs/logs/ux_quality_observations.md` (UX-NNN) — as a whole, not a list. The logs keep accumulating raw observations; **this file is the analysis layer** that groups them by shared root cause and turns them into a sequenced remediation plan. Every active observation in both logs is referenced by exactly one theme below (see the **Coverage matrix**).

## Status

> Canonical status lives in the frontmatter. This is the **analysis layer** over the two raw observation logs — it groups raw observations by shared root cause, explains the dependency order, and names which fixes are Phase 4 acceptance blockers vs. later work. Execution (checklists, phase assignment) lives in `docs/plan.md`; update statuses there, not here.

**The thesis.** The two logs read alarming at ~32 items, but most collapse into **six root causes (R1–R6)**, several of which cut _across_ the prompt/UX divide the source files impose. The worst offenders are not prompt problems at all — they are trigger-model, reconciliation, and anchoring bugs. A single principle (**severity ∝ document maturity**, R2) dissolves the only genuine philosophy conflict in the logs. The friction is concentrated, not diffuse — which is good news.

## Phased Plan

| Phase   | Work                                                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4       | R1 (trigger model), R5 (text extraction), R3 (reconciliation), R7a (prioritisation transparency) — acceptance blockers for the calm-feed goal; milestones in `docs/plan.md` Phase 4.    |
| 5       | R4 (doc-level anchoring), R3b/R3c (archive trust + choreography), R7b (scanning affordances), R2c (smart-feed design), R6 (fast-tier precision) — milestones in `docs/plan.md` Phase 5. |
| Ongoing | New raw observations still land in the two source logs; re-run this synthesis when a new cluster forms or a theme is retired.                                                           |

---

## Root causes

### R1 — The trigger model is the master bug

`window-blurred` is read as "user is done," firing a hard settle. A PM alt-tabbing to copy reference text (e.g. from `phase1-test-text.md`) triggers settle after settle. That one mistaken signal **cascades**:

- premature `unsupported_claim` / `clarity` warnings on a half-written doc (**OBS-006**)
- premature doc-level `missing_topic` checks (**OBS-009**)
- much of the _felt_ abrasiveness in **OBS-010** (blunt feedback on an unfinished draft)
- and a cost blow-up: two simultaneous paid `gemini-2.5-pro` calls (ledger + doc-level) **per settle**, so one paste = 4–6 paid invocations (**OBS-014**, **OBS-020**).

Fixing the trigger model — decouple focus from completeness, require genuine idle or structural maturity, collapse/debounce the double strong call — retires the largest share of pain in one move. **Highest-ROI fix by a wide margin.**

### R2 — Severity ∝ document maturity (the one strategic insight)

The only observations that touch the product's soul are **OBS-010** and **UX-010**, and OBS-010's own note nails it: _"provoke, don't prescribe" feels abrasive primarily because of <!---->_**_when_**_<!----> it fires, not <!---->_**_what_**_<!----> it says._ Blunt structural feedback is fine on a finished draft and hostile on a first paragraph.

So timing (Invariant #4) isn't politeness — it's the pressure valve that lets us **hold the register line** (no prescriptive "think about adding a risks section," no therapist hedging) **without** users defecting to Grammarly-style hand-holding. The fix is to make severity a function of document maturity: surface structural gaps as soft _opportunities_ early, promote them to _warnings_ only as the doc matures. This is also the principled answer to **UX-010** (users asking for manual filters / "top 5" / warnings-vs-suggestions): give maturity-aware curation, not a settings dashboard. The smart-feed-vs-manual-control tension deserves its own design spec before we concede any manual controls.

### R3 — The reconciliation / lifecycle engine is structurally broken

**OBS-012** is three lifecycle bugs at once: ghost-archiving (observations generated _and_ superseded in the background before the user ever sees them), false resolution (`superseded` though the text was never changed), and duplication (near-identical messages split across active and archive). This is foundational trust: if an observation can't be tracked reliably across eval runs, **nothing built on top of it is worth building yet** — which is why the archive- and choreography-layer UX items (**UX-002**, **UX-007**, **UX-011**) depend on this landing first. **OBS-021** (inject a block's prior active observations into its re-eval prompt) is the complementary fix: it lets the model confirm _"did this edit resolve X?"_ instead of relying entirely on fragile client-side reconciliation, and would directly improve supersede accuracy.

### R4 — Doc-level checks are architecturally second-class

The strong-tier doc schema only returns `{"text": "..."}`. Consequences:

- It **can't anchor**, so doc-level critiques about text that _does_ exist (`structure_flow`, `underexposed_topic`) feel like broken highlights (**OBS-015**, **UX-001**), and there's nothing to auto-scroll to (**UX-009**).
- With no proper home, the model **dumps** unsupported-claim complaints into `audience_mismatch` (**OBS-018**) — a claim-evidence judgment that belongs in the fast tier.
- Phrasing **blurs categories**: `structure_flow` ("before _fully defining_ the problem") reads as a depth critique when the real issue is ordering (**OBS-016**).

One schema change — let doc-level checks optionally return anchoring targets — plus prompt tightening fixes OBS-015, OBS-016, OBS-018, UX-001, and UX-009 together. The already-shipped `strategic_tension` split (**OBS-004**, done 2026-06-04) is the precedent: give the model the right bucket and the misclassification stops. **Graduated into its own build-ready spec (2026-06-17): `docs/projects/doc_level_anchoring.md`** — decision: section-level anchoring (blockId) + optional substring fallback, since the doc-level model reasons over summaries, not verbatim text.

### R5 — Text extraction drops block separators

Bullets are concatenated without separators — `...decreases by 20%.Zero increase...` — so the offsets used for ProseMirror decorations misalign and highlights bleed across block boundaries, catching the previous line's period and chopping the target's last word ("infrastru") (**OBS-007**, with direct visual proof in **OBS-017**). Pure correctness bug, cheap to fix, but it visibly breaks trust on every multi-block document. Join blocks safely before the substring/offset match.

### R6 — Fast-tier precision

The **most trust-damaging class**, because the user can _see_ these are wrong:

- **Attribution-is-support** ignored: a claim explicitly credited to the fraud team flagged as unsupported (**OBS-001**).
- **Claim-kind misclassification**: goals/constraints typed as `metric`, which breaks the commitment×commitment escalation downstream (**OBS-002**).
- **Persona vocabulary** flagged as undefined jargon — payments/fraud terms (**OBS-003**) and general process terms like "soft launch"/"rollout cohort" (**OBS-005**). The PM jargon preset shipped in Phase 4 covers the general layer; these argue for a payments/fraud sub-domain preset and confirm the user-dictionary control is premature (**UX-005**).
- **Instruction-ignore on metrics**: a forward-looking success metric flagged as fact even though the prompt contains that _exact_ negative example — evidence we've hit the ceiling of zero-shot and need few-shot exemplars (**OBS-019**).

### R7 — Trust & scanning affordances (deferred until the feed is stable)

The cheap fast-tier output is correct but **invisible** — buried by opaque sorting or eaten by the thrashing dedup engine (the inverted cost/value ratio called out in OBS-020). The remedy is transparency and reduced eye-travel, all of which assume a stable feed:

- **Prioritization transparency** — explain promote vs. "also noticed" (**UX-003 / OBS-013**). _(Pull to Phase 4 — it's part of "calm feed.")_
- **Quoted-text subtitle** on cards (**UX-008**); **reverse-hover** text → card (**UX-006**); **auto-scroll / split-context** for distant spans (**UX-009**). _(**UX-004** visible editor formatting controls was promoted out of this R7b grouping to its own "Editor formatting UX" milestone in `docs/plan.md` — 🟠, pending a control-surface decision — since discoverable formatting is core to a writing tool, not a scanning affordance.)_

---

## Sequencing

The dependency order, not the phase labels:

1. **R5** (text extraction) — cheapest correctness win; restores visual trust immediately.
2. **R1** (trigger model) — stops the cascade and the cost bleed.
3. **R3** (reconciliation) — makes the feed trustworthy enough to build on.
4. **R7a** (prioritization transparency) — lets the user trust the calm feed they now have.
5. **R4** (doc-level anchoring schema + category discipline).
6. **R6** (fast-tier precision).
7. **R7b / R3b / R3c / R2c** (UX polish) — choreography, archive context, quotes, reverse-hover — on foundations that are finally stable.

**R2** is the principle threaded through 1–7, not a discrete step.

## Meta-observations

1. **The product's catch-all failure is mirrored in the log itself.** `audience_mismatch` became a dumping ground for anything the strong tier wanted to say (OBS-018) — and the _prompt-quality_ log became a dumping ground for architecture bugs (OBS-007, OBS-012, OBS-014, OBS-017, OBS-020, OBS-021 are not prompt issues). Same anti-pattern, both places. This synthesis is partly a triage that re-files those into their real homes (R1/R3/R5) so they don't rot in a "prompt remediation" sprint that never looks at them.
2. **Phasing.** Almost everything is tagged Phase 5/6 in the source logs, but R1, R3, R5, and R7a are not polish — they are **Phase 4 acceptance blockers** ("signal quality & calm feed" is undemonstrable without them). The Phased Plan above pulls them forward; the rest stays deferred.

## Coverage matrix

Every active observation in both logs maps to exactly one owning theme. (OBS-008, OBS-011, OBS-013 are migration stubs — they live as UX-001/UX-002/UX-003.)

| Theme                                            | Prompt-quality (OBS)                                 | UX-quality (UX)                |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------ |
| **R1** Trigger model & double-call               | OBS-014, OBS-020                                     | —                              |
| **R2** Severity ∝ maturity (principle)           | OBS-006, OBS-009, OBS-010                            | UX-010                         |
| **R3** Reconciliation / lifecycle                | OBS-012, OBS-021                                     | UX-002, UX-007, UX-011         |
| **R4** Doc-level anchoring & category discipline | OBS-004 (precedent, done), OBS-015, OBS-016, OBS-018 | UX-001, UX-009                 |
| **R5** Text-extraction offsets                   | OBS-007, OBS-017                                     | —                              |
| **R6** Fast-tier precision                       | OBS-001, OBS-002, OBS-003, OBS-005, OBS-019          | UX-005                         |
| **R7** Trust & scanning affordances              | OBS-013 → (UX-003)                                   | UX-003, UX-004, UX-006, UX-008 |

> OBS-006/OBS-009 also have their mechanical cause in R1; UX-009 is enabled by R4's anchoring; UX-002/UX-007/UX-011 are unblocked by R3 — cross-links are noted inline in each theme above.
