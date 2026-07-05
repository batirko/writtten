---
status: in-progress
kind: infra
phases: [6]
summary: Make the eval pipeline no-op-aware so a change that is undone costs (near-)nothing. Mechanism 2 (content-hash snapshot/restore) shipped 2026-07-04 — a net-zero edit now leaves zero net observation churn. Mechanism 1 (a section-boundary-commit debounce, to also cut the transient model calls themselves) remains a follow-on design task, not yet scoped.
---

# Revert-aware evaluation

> Written 2026-07-02 from a live session (`docs/logs/ux_quality_observations.md` UX-014): toggling the first paragraph to H1 and reverting it — a net-zero edit — fired 27 calls (≈3 paid `gemini-2.5-pro`), surfaced a hallucinated `strategic_tension`, and churned 5 observations through the archive. The pipeline has no concept of a transient state that gets undone.

## Status

**In progress. Mechanism 2 (snapshot/restore) shipped 2026-07-04** — `src/services/evalSnapshot.ts` + the restore path in `evaluateSection` (`src/services/evaluator.ts`). Verified both by unit test (`src/services/evaluator.test.ts` § "revert-aware snapshot restore") and live in the browser via the dev harness: a toggle→click-away→click-back→revert sequence that previously left a stray observation now returns the feed to exactly its pre-toggle state (0 active observations), with the transient card honestly closed into the archive rather than lingering or silently vanishing. **Mechanism 1** (originally "coalesce transient structural edits") remains **deferred, 🟠** — the originally-proposed fix was falsified by the same live reproduction and needs a genuine redesign; see § Mechanism 1 — corrected diagnosis.

**Known gap, not blocking:** if an in-flight eval for a *different, still-transient* section resolves after its boundary has already reverted, its write isn't invalidated by Mechanism 2 (only `block-removed` bumps the generation guard today — see `evaluation-triggers.md` step 1b). Two sections serialize independently in the orchestrator, so this can only occur across *different* sectionIds mid-toggle, not within one. Left as documented debt pending Mechanism 1's redesign, which will need to touch the same generation machinery anyway.

The trigger episode had two independent root causes. The **hallucination** (a heading-only section fabricating a PRD) is OBS-029, owned by `section_eval_precision.md` — a must-fix that is _not_ about reverts (already shipped 2026-07-02). This doc owns the other half: the pipeline re-evaluates every transient state and only unwinds it after the fact, so a change-and-revert is treated as two real changes rather than a no-op.

The user's framing was exact: _"shut down the pending analysis, or revert the created one, if the change is reverted."_ Mechanism 2 is the "revert the created one" half. Mechanism 1 was meant to be the "shut down the pending analysis" preventive half; its original design didn't survive contact with the live pipeline (see below).

Read alongside:

- `docs/logs/ux_quality_observations.md` (UX-014) — the source observation.
- `docs/projects/section_eval_precision.md` (OBS-029) — the independent hallucination fix that the same episode exposed; the two land together but are separable.
- `docs/mechanics/evaluation-triggers.md` — the trigger + orchestrator-shaping doc this changes; **update it in the same task as the build.**
- `docs/projects/lifecycle_integrity.md` — the existing generation-bump machinery (`sectionEvalGeneration`, `isLive()`) that already invalidates late writes on block-removal; Mechanism 2 extends that idea from "block deleted" to "state superseded / reverted."
- `docs/projects/model_rotation_and_debugging.md` — revert-churn wastes RPD/paid budget; this is also a cost fix.
- `src/editor/Editor.tsx` (trigger dispatch, debounce, `resolveSections` boundary derivation), `src/services/orchestrator.ts` (coalescing, serialization, generations), `src/services/evaluator.ts` (`evaluateSection` hash short-circuit).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | **Mechanism 2 (content-hash snapshot/restore):** an eval result cache keyed by normalized-text hash; return to a known hash restores the cached observation set and cancels superseded in-flight evals, instead of tearing down and rebuilding. **Mechanism 1** is deferred within Phase 6 pending a real design (see below) — not a hard gate on M2 shipping. |

## Todo

### Mechanism 2 — content-hash snapshot + restore — shipped 2026-07-04

- [x] **Define the state key.** `snapshotKey(memberBlockIds, textHash)` in `src/services/evalSnapshot.ts` — order-independent membership + `hashCode(cleanText)`, in a **dedicated snapshot map**, not the block-summary (see § Confirmed against code for why). Ignores block-type/formatting; a P→H1→P toggle maps back to the same key once membership also returns to its prior shape.
- [x] **Snapshot store.** `evaluateSection` step 9 (`src/services/evaluator.ts`) caches `{ sectionId, summary, claims, observationIds }` keyed by state hash after every successful eval, via `setSectionSnapshot`. Bounded LRU (`MAX_SNAPSHOTS_PER_DOC = 100`), in-memory, per-document (`clearSnapshotsForDocument` wired into `clearDocumentData`'s two call sites in `App.tsx`).
- [x] **Restore on return-to-known-state.** Step 1b checks the snapshot before the bodyless-heading guard and before any model call; a hit calls `restoreSectionFromSnapshot`, which reactivates the cached observation ids (`db.reactivateObservation` — status→active, `closureReason` cleared, `lastSeenAt` refreshed to the restore time) and skips the model call entirely.
- [ ] **Cancel superseded in-flight evals.** **Not implemented** — the existing `sectionEvalGeneration`/`isLive()` guard still only bumps on `block-removed`. Left as documented debt (see Status § Known gap): the orchestrator serializes evals *within* a section, so this can only matter across two different, simultaneously-transient sectionIds — a narrower window than originally scoped. Revisit alongside Mechanism 1's redesign, which needs to touch the same machinery.
- [x] **Honest lifecycle on restore.** The restored cards themselves emit no archive churn (same id, `reactivateObservation` is a plain status flip). Stray observations that exist on the section's blocks but aren't part of the restored snapshot **are** closed (`auto_closed` / `resolved_by_edit`) and **do** appear in the archive — verified live: this is correct, not the anti-pattern, since they're genuine artifacts of the transient window (the UX-014 anti-pattern was churn on cards that were never really new, not honest closure of ones that were).
- [x] **Tests.** Unit: `src/services/evaluator.test.ts` § "revert-aware snapshot restore (UX-014 Mechanism 2)" — (a) toggle→shrink→revert restores by id with zero net model calls after the revert and zero new inserts; (b) same membership + genuinely different text does **not** restore (a real edit still evaluates). Live: reproduced the original toggle→click-away→click-back→revert sequence via the dev harness — feed returns to 0 active observations, the transient card lands in Archive (1), no console errors. **Not yet wired into the ratchet corpus** as a standing regression guard — the unit test covers the contract; a fixture-corpus entry is a reasonable follow-up but not required to ship.

### Mechanism 1 — deferred, needs redesign

- [ ] **Design a section-boundary-commit debounce** (see § Mechanism 1 — corrected diagnosis). Not scoped to a concrete implementation yet — flag as a design task, not a build task, until the approach is picked. → 🟠 Med · 🧠 · Lane: Editor

## Design

### Confirmed against code (2026-07-04) — live reproduction

Both mechanisms were checked against the live pipeline via the dev harness + chrome-devtools (real clicks + keyboard shortcuts, not synthetic events). The reproduction **overturned** the originally-drafted Mechanism 1 fix, so this section documents what's actually true.

**What does NOT happen:** toggling a block's type alone (`Meta+Alt+1` while the cursor stays in that block) fires **no immediate dispatch**. `onSelectionUpdate` — the source of the cursor-departure trigger — does not fire for a `setNode` transaction that doesn't move the selection's document position. So the originally-hypothesized bug ("same block, different `sectionId`, misread as a departure") **does not occur**. A `lastActiveBlockId` discriminator would never trigger, because it targets a case that doesn't happen.

**What actually happens, confirmed via `window.__sidecar__.getEvents`:**

1. Toggle a mid-doc paragraph to a heading. No trigger fires immediately. `resolveSections` (`src/editor/section.ts`) silently re-derives boundaries on the next call: the section that used to span all three paragraphs (keyed by the first paragraph's `blockId`, since there was no heading yet) now shrinks to just that first paragraph — the toggled block becomes its own new heading-section, absorbing everything after it. Nothing has been told this happened; there's no settle, no debounce, no signal.
2. The **existing 3 s pause timer**, armed from the toggle's `onUpdate`, or a **genuine cursor departure** to a different block shortly after (completely normal — the user keeps writing elsewhere) — whichever comes first — evaluates whatever `resolveSections` says right now. In the reproduction, clicking from the just-toggled block into a later paragraph fired `settle-blur:cursor-departed` for the **shrunk intro section**, re-evaluating its now-different (smaller) `combinedText` against its stored hash — which legitimately differs, since the section's membership genuinely changed. This is not a misfire: the departure is real, the boundary really did change; the waste is that the boundary changed **transiently** with zero debounce of its own.
3. Reverting the heading back to a paragraph repeats the same silent boundary shift in reverse, and the next trigger (pause or departure) re-evaluates the now-restored intro section — again a real call, because from the trigger logic's point of view this is just another legitimate text/membership change.
4. Net result measured in the reproduction: **8 fast calls** for a toggle→revert that changed no text, and **one new `clarity` observation left active on a paragraph whose text was never touched** — confirming the UX-014 "net-zero edit leaves a trace" complaint precisely.

**Why this matters for Mechanism 1:** the waste isn't caused by a spurious trigger reading a non-move as a move (my original diagnosis) — it's caused by `resolveSections` boundary changes propagating to *any* trigger, including perfectly legitimate ones (cursor moving on to keep writing), with no debounce of the boundary itself. Suppressing the departure trigger on an unchanged `blockId` doesn't touch this, because the departure that actually fires is triggered by a genuine `blockId` change.

**A real Mechanism 1 fix would need** something closer to: maintain a "committed" section-boundary snapshot separate from the always-live `resolveSections()` result; when a structural change (heading added/removed) is detected, don't let it become visible to trigger dispatch until it survives a settle window (reusing something like `EVAL_DEBOUNCE_MS`) — during that window, any trigger for an affected section evaluates against the **last-committed** boundaries, not the live ones; only once the window elapses without further structural change does the new boundary set commit and become what evals see. This is materially more invasive than "coalesce a dispatch" — it changes what `resolveSections` output *means* to the rest of the pipeline (live vs. committed), and needs care around: what happens to an in-flight departure eval if the boundary reverts mid-flight (compose with Mechanism 2's generation-cancellation); whether a *sustained* heading (past the window) needs to trigger a synthetic settle-pause for the newly-committed section shape (nothing else will, since the departure/pause timers were evaluating the old boundary the whole time — see `evaluation-triggers.md` for how this composes with UX-013's block-completion trigger). This needs a dedicated design pass, not a one-line discriminator — hence: idea, not build-ready.

- **`evaluateSection` already skips the model call on unchanged text** (`evaluator.ts:119`), but overwrites the block-summary during the transient (`evaluator.ts:145`) and never restores closed observations — so Mechanism 2's real work is the observation snapshot/restore, on a **dedicated** store, not a reuse of the block-summary hash. This was confirmed independently of the M1 reproduction and stands unchanged: the intro section's stored hash genuinely changes across the toggle (different membership → different `combinedText`), so the summary hash can't serve as Mechanism 2's key across a re-section — a dedicated snapshot store keyed on normalized text is still the right design.
- **The generation mechanism to extend already exists.** `sectionEvalGeneration` + `bumpSectionGeneration` + the `isLive()` predicate in `src/services/orchestrator.ts` already invalidate an in-flight eval's writes on `block-removed`. Mechanism 2's "cancel superseded in-flight evals" broadens the bump trigger from "block removed" to "state hash changed / reverted" — same machinery, wider condition. No new invalidation path is needed.

### Why two mechanisms, not one

They cover different revert shapes and, once Mechanism 1 is properly redesigned, will compose cleanly — but they are **not** interchangeable, and Mechanism 2 is the one that must ship for the user-visible guarantee:

- **Snapshot/restore (M2)** is the _general_ back-stop: any return to a previously-evaluated state — a fast toggle→revert, a slow revert, a Ctrl-Z minutes later, deleting and retyping the same sentence — restores rather than recomputes, **regardless of how many transient evals fired in between**. It also subsumes the reconciler's job for the revert case (keep-by-id, no churn) and cancels in-flight work. This alone satisfies "a change that is undone should cost (near-)nothing" from the archive/observations' point of view, though not from the call-count/cost point of view.
- **Boundary-commit debounce (M1, redesigned)** is a _preventive_ cost optimization: it would stop the transient states from ever reaching the model at all, saving the calls that M2 currently still makes (and then unwinds). Valuable, but strictly an optimization on top of M2's guarantee, not a replacement for it — which is why M2 ships first.

### Keying on text, not structure

The subtle decision is the hash key. Eval should be a function of **content**, so a formatting-only transaction (P↔H1 with identical text) is a no-op by construction *for a section whose membership is unchanged*. But structure legitimately affects _section boundaries_ — a real, sustained H1 creates a new section that should be evaluated, and a toggle transiently changes which text belongs to which section even when no individual block's own text changed. The resolution: the snapshot key is the section's **normalized combined text at its current membership** — so a section returns to a known-good state (and restores) only once **both** its own text **and** its membership match a previously-seen combination. This is what makes the toggle→revert case restore cleanly: the intro section's membership (and therefore its `combinedText`) returns to exactly what it was pre-toggle, so its post-revert hash matches the pre-toggle snapshot even though nothing in Mechanism 1 debounced the boundary change itself.

### Scope boundaries

- Not a persistence feature — the snapshot store is in-memory, per-session, bounded. No IndexedDB schema change (invariant 5 untouched).
- Does not fix the hallucination (OBS-029) — that's a separate evaluator guard that must land regardless.
- Does not abort in-flight `fetch`es in v1 (invalidating the surfaced result is enough); true cancellation is a later optimization if cost data warrants.
- Does not change the observation taxonomy or add any user-facing control.
- Does not eliminate the transient model calls during a toggle→revert dance (that's Mechanism 1's job, deferred) — it eliminates the **visible churn** that survives them.
