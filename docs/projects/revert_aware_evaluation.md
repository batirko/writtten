---
status: idea
kind: infra
phases: [6]
summary: Make the eval pipeline no-op-aware so a change that is undone costs (near-)nothing. Two composing mechanisms — coalesce transient structural edits (debounce block-type toggles so a fast toggle→revert never dispatches) and content-hash snapshot/restore (return to an already-evaluated text state restores cached observations, cancels in-flight evals) — so revert, Ctrl-Z, and no-op formatting don't trigger a full eval cascade, feed churn, or wasted paid calls.
---

# Revert-aware evaluation

> Written 2026-07-02 from a live session (`docs/logs/ux_quality_observations.md` UX-014): toggling the first paragraph to H1 and reverting it — a net-zero edit — fired 27 calls (≈3 paid `gemini-2.5-pro`), surfaced a hallucinated `strategic_tension`, and churned 5 observations through the archive. The pipeline has no concept of a transient state that gets undone.

## Status

**Idea — Phase 6 (decision settled 2026-07-02: both mechanisms; ready to design the build).** Not started.

The trigger episode had two independent root causes. The **hallucination** (a heading-only section fabricating a PRD) is OBS-029, owned by `section_eval_precision.md` — a must-fix that is _not_ about reverts. This doc owns the other half: the pipeline re-evaluates every transient state and only unwinds it after the fact, so a change-and-revert is treated as two real changes rather than a no-op.

The user's framing was exact: _"shut down the pending analysis, or revert the created one, if the change is reverted."_ That maps to the two mechanisms below.

Read alongside:

- `docs/logs/ux_quality_observations.md` (UX-014) — the source observation.
- `docs/projects/section_eval_precision.md` (OBS-029) — the independent hallucination fix that the same episode exposed; the two land together but are separable.
- `docs/mechanics/evaluation-triggers.md` — the trigger + orchestrator-shaping doc this changes; **update it in the same task as the build.**
- `docs/projects/lifecycle_integrity.md` — the existing generation-bump machinery (`sectionEvalGeneration`, `isLive()`) that already invalidates late writes on block-removal; mechanism (2) extends that idea from "block deleted" to "state superseded / reverted."
- `docs/projects/model_rotation_and_debugging.md` — revert-churn wastes RPD/paid budget; this is also a cost fix.
- `src/editor/Editor.tsx` (trigger dispatch, debounce), `src/services/orchestrator.ts` (coalescing, serialization, generations), `src/services/evaluator.ts` (`evaluateSection` hash short-circuit — the existing per-section text hash is the seed of mechanism 2).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | Both mechanisms. (1) **Transient-edit coalescing**: structural/format transactions (block-type toggle, mark changes) go through the settle debounce like typing, so a fast toggle→revert coalesces to nothing and never dispatches. (2) **Content-hash snapshot/restore**: an eval result cache keyed by normalized-text hash; return to a known hash restores the cached observation set and cancels superseded in-flight evals, instead of tearing down and rebuilding. |

## Todo

### Mechanism 1 — coalesce transient structural edits

- [ ] **Route structural edits through the settle debounce.** Today a block-type toggle produces an immediate cursor-departure/settle dispatch (`settle-blur:cursor-departed` fired in the UX-014 log). Treat a structural/format transaction the same as a content edit: reset the per-section settle timer, don't dispatch until it settles. A toggle→revert within the debounce window nets to zero pending work.
- [ ] **Don't let a transient re-section fire section evals.** When a structural change transiently splits/merges sections (heading toggle), defer section-resolution-driven dispatch until settle, so the intermediate 2-section shape never reaches the evaluator. A _sustained_ new heading (past the debounce) re-sections and evaluates normally — the behaviour we want to keep.
- [ ] **Interaction with the parallel block-completion trigger (UX-013).** That milestone adds an on-Enter dispatch; ensure it fires on genuine block completion, not on a block-type toggle that happens to end in the same position. Gate the block-completion trigger on _content_ change, not structure change.

### Mechanism 2 — content-hash snapshot + restore

- [ ] **Define the state key.** Reuse/extend the existing per-section text hash (`hashCode(cleanText)` in `evaluateSection`) and the doc-state hash (`evaluateDocument`). Key on **normalized text** (ignore block-type/formatting) so a P→H1→P toggle maps to the same key — formatting changes that don't change text are no-ops by construction. (Structure still matters for section _boundaries_; that is handled by mechanism 1's settle, not by the hash.)
- [ ] **Snapshot store.** On a completed eval, cache the produced observation set + ledger delta + summary keyed by the state hash (bounded LRU; in-memory is fine, no persistence required for v1). Small and per-document.
- [ ] **Restore on return-to-known-state.** When an eval would run for a section/doc whose current state hash is already in the snapshot store, **restore** the cached observations (re-activate the exact prior cards, by id, no flicker) and **skip** the model call. This is the "unwind the created one on revert" path, and it makes Ctrl-Z / manual revert / no-op formatting free.
- [ ] **Cancel superseded in-flight evals.** Extend the generation mechanism (`sectionEvalGeneration` / `isLive()`) so an in-flight eval whose triggering state is no longer current does not surface its result (it already skips _writes_ on block-removal; broaden "no longer current" to "state hash changed / reverted"). This is the "shut down the pending analysis" path. The `fetch` need not be aborted for v1 — invalidating the surface is enough — but note the wasted call for the cost ledger.
- [ ] **Honest lifecycle on restore.** A restore must not emit `superseded`/`auto_closed` churn through the archive (the UX-014 anti-pattern). Restored cards keep their original ids and `lastSeenAt`; the archive sees nothing. Compose with `doc_scope_reconciliation` keep-by-id.
- [ ] **Tests.** (a) Toggle a paragraph to H1 and back → **zero** net new/closed observations and **zero** model calls after settle; (b) type a sentence, Ctrl-Z → prior observations restored by id, no re-eval; (c) a _sustained_ heading (no revert) still re-sections and evaluates; (d) an in-flight eval whose section is reverted mid-flight does not surface its result. Wire (a) into the harness/ratchet as a no-op-cost regression guard.

## Design

### Why two mechanisms, not one

They cover different revert shapes and compose cleanly:

- **Coalescing** is a _preventive_ front-stop: the fast, common case (a quick structural fumble — toggle, mis-format, immediately undo) never dispatches at all, so there's nothing to restore. It's cheap and kills the exact UX-014 trigger.
- **Snapshot/restore** is the _general_ back-stop: any return to a previously-evaluated state — a slow revert, a Ctrl-Z minutes later, deleting and retyping the same sentence — restores rather than recomputes. It also subsumes the reconciler's job for the revert case (keep-by-id, no churn) and cancels in-flight work.

Coalescing alone leaves slow/content reverts re-evaluating; snapshot alone still lets transient states flash briefly before restore. Together: transient fumbles are silent, and any state we've seen before is free.

### Keying on text, not structure

The subtle decision is the hash key. Eval should be a function of **content**, so a formatting-only transaction (P↔H1 with identical text) is a no-op by construction. But structure legitimately affects _section boundaries_ — a real, sustained H1 creates a new section that should be evaluated. The resolution: the **hash ignores block-type** (so no-op formatting restores/skips), while **section boundaries are governed by mechanism 1's settle** (so a _sustained_ structural change still re-sections after it settles). The two levers don't fight: one decides "is this text new?", the other decides "has the structure stopped changing?".

### Scope boundaries

- Not a persistence feature — the snapshot store is in-memory, per-session, bounded. No IndexedDB schema change (invariant 5 untouched).
- Does not fix the hallucination (OBS-029) — that's a separate evaluator guard that must land regardless.
- Does not abort in-flight `fetch`es in v1 (invalidating the surfaced result is enough); true cancellation is a later optimization if cost data warrants.
- Does not change the observation taxonomy or add any user-facing control.
