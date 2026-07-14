---
status: idea
kind: quality
phases: [8]
summary: The resolution-side sibling of contradiction_coverage — a caught contradiction/tension card can go stale after the user fixes the underlying text, because the only all-pairs authority (the ledger sweep) never re-runs on edits and the per-section edit path only reconciles conflict cards on their *primary* anchor. Leaning direction (2026-07-14): an edit-scoped, either-side conflict re-verification where a free deterministic check (A) gates one cheap targeted LLM confirm (B), closing with a grace beat.
---

# Contradiction resolution — when does a caught conflict card actually close

> Sibling to [`contradiction_coverage.md`](contradiction_coverage.md). That doc answers _"when does a contradiction get **detected**."_ This one answers _"once detected, when does the card **close** after the user resolves it."_ Both are the same hero moment seen from two ends — "it caught a contradiction I wrote" is only trustworthy if "…and it noticed when I fixed it" holds too. A card that lingers after the conflict is gone is a **false positive that teaches the user the signal is stale**, which is worse than never having flagged it.

## Status

> Canonical status is the frontmatter (`idea`). Field-discovered 2026-07-14 from a live paid-tier (`gemini-2.5-pro`) session on the "See it in action" demo doc; root-caused the same day. Direction is **leaning** (A-gates-B + grace), not yet owner-signed-off for build. No code written.

## Phased Plan

- **Phase 8 (this doc).** Close the resolution gap for conflict cards (`contradiction` / `strategic_tension`). Composes with the Phase-8 signal-quality work (V1 keyed runs, precision-floor recalibration) because a stale contradiction card is a *precision* miss the corpus study would otherwise count against the wrong axis. Does not touch detection (`contradiction_coverage.md`, shipped) or doc-scope reconciliation (`doc_scope_reconciliation.md`, shipped) — it fills the one seam between them.

## Todo

- [ ] Owner sign-off on the leaning direction (A-gates-B + grace) vs. pure-A / pure-B, and on the grace-vs-immediate close policy (see _Open questions_).
- [ ] Prototype on a branch; drive it in the browser against the exact demo scenario below (edit the Timeline Q2→Q3, watch the sweep-born card close) before any PR.
- [ ] Extend the section-edit reconcile to consider conflict cards on **either** anchor side (mirror `handleBlockRemoved`'s `blockId || conflictingBlockId` filter).
- [ ] Wire the A→B gate: deterministic close when the edited-side claim is gone; keep when the incremental re-emits the pair; one targeted 2-claim confirm only when the claim persists (reworded) but the pair wasn't re-emitted.
- [ ] Grace beat on the absence/deterministic close; immediate close on a B-confirmed resolution.
- [ ] Ratchet/regression fixture: a two-section Q2-vs-Q3 doc, fix one side, assert the card closes (and that a reworded-but-still-conflicting edit does **not** close it).

---

## The bug, concretely (2026-07-14 session)

Demo PRD, paid tier. Two conflicting claims live in **different** blocks:

- **Metrics** block (`S8OD_Yef0E`): _"The public launch is firmly set for Q3 2026."_
- **Timeline** block (`N4r2-zLRaF`): _"We are committing to a public launch in Q2 2026."_

The **bootstrap sweep** flagged the pair (`claimAId 7` = Q3/Metrics, `claimBId 8` = Q2/Timeline) → card: _"This contradicts the public launch date of Q3 2026 set earlier."_ The user fixed it by editing the **Timeline** block Q2 → Q3. The incremental contradiction check that ran after the edit correctly returned **no conflict**. The card stayed. Log meta: `"archives": 0`.

By contrast, the doc-quality pass had its **own** duplicate of the conflict as a `structure_flow` note, and it self-healed — the next doc-idle run returned `resolved_prior: [2]` and closed it. That asymmetry ("the structure-flow note archived but the contradiction card didn't") is the surface symptom.

## Root cause (two facts that compose)

**(a) The all-pairs sweep — the only engine with conflict-resolution logic — never re-runs on edits.** `reconcileSweepContradictions` has correct authoritative-with-grace closing: a pair the sweep stops emitting ages out over `DOC_GRACE_THRESHOLD` misses and closes ([`evaluatorReconcile.ts:490`](../../src/services/evaluatorReconcile.ts)). But `evaluateLedgerContradictions` (the sweep) is triggered **only** by `trigger.kind === "block-paste"` ([`orchestrator.ts:479`](../../src/services/orchestrator.ts)). `doc-idle` runs `evaluateDocument` (doc-quality), not the sweep. So after the initial paste/load, the resolution logic is never given a chance to fire.

**(b) The per-section edit path reconciles conflict cards only on their *primary* anchor.** The sweep anchors the card `blockId = S8OD_Yef0E` (Metrics, claim A) and `conflictingBlockId = N4r2-zLRaF` (Timeline, claim B) ([`evaluator.ts:1109`](../../src/services/evaluator.ts)). The user edited **Timeline** — the card's *secondary* (`conflictingBlockId`) side. But `reconcileObservations` builds its candidate set with `memberSet.has(o.blockId)` — **primary side only** ([`evaluatorReconcile.ts:154`](../../src/services/evaluatorReconcile.ts)). So the card was never even a candidate for the Timeline section's reconcile. Editing the *Metrics* (primary) block instead would have orphan-closed it.

**The data model already supports either-side reasoning — the edit path just doesn't use it.** Block *removal* closes cards on both sides: `o.blockId === blockId || o.conflictingBlockId === blockId` ([`orchestrator.ts:174`](../../src/services/orchestrator.ts)). Block *edit* uses only the primary side. Closing that inconsistency is most of the fix.

A secondary UX wrinkle amplified the confusion: the card's **highlight** was on the Metrics "Q3" text (primary anchor A) while its **message** was about the Timeline "Q2" claim — so the span the user was staring at was in a different block from the one they edited.

## What already works (don't rebuild it)

For **span cards** (`clarity` / `undefined_jargon` / `unsupported_claim`) the edit-scoped resolution the user's intuition asks for already exists: on settle, the fast-tier section-eval re-extracts the section, and `reconcileObservations` auto-closes any span card on the edited block the fresh eval no longer produces (`resolved_by_edit`, [`evaluatorReconcile.ts:276`](../../src/services/evaluatorReconcile.ts)). Cheap, directed, immediate — this is why the BM25 undefined-jargon card cleared cleanly in the same session. The gap is **only** cross-block conflict cards.

## Why not "just re-run the sweep on edit"

It would violate hard invariant #3 (no per-keystroke full-document scans; cross-document checks run against the ledger incrementally). In the logged session the sweep took **6–28 s** on the paid tier and re-reads **every** claim. The correct shape is an **edit-scoped, incremental** re-verification of exactly the cards the edit touched — not a document-wide pass.

## Leaning direction — A gates B, close with grace

The two candidate mechanisms compose into one, rather than being an either/or:

- **A — deterministic, no LLM (the gate).** On settle, collect active `contradiction`/`strategic_tension` cards touching any member block on **either** anchor side (widen the [`evaluatorReconcile.ts:154`](../../src/services/evaluatorReconcile.ts) filter to mirror block-removal). For each card:
  - anchor claim on the edited side is **gone** from the fresh extract → close (grace beat);
  - the incremental check **re-emitted** this exact pair (by `conflictPairKey`) → still conflicts → keep, reset grace;
  - claim **still present but reworded**, pair not re-emitted → *ambiguous* → hand to B.
- **B — one targeted 2-claim confirm (only on ambiguity).** Re-run a single contradiction check with the *current* text of both sides. `no conflict` → close; still conflicts → keep (and re-anchor to the new text). ~1–2 s, reads 2 claims, fires only when A can't decide — strictly cheaper than firing B on every touched card, strictly more robust than A alone (which would false-close a reworded-but-still-conflicting claim).

**Grace beat.** Applies to A's *absence* close (guards a stochastic re-extraction miss), consistent with how sweep and doc-scope conflict cards already close (`DOC_GRACE_THRESHOLD = 2`, [`evaluatorReconcile.ts:292`](../../src/services/evaluatorReconcile.ts)). A **B-confirmed** resolution is an affirmative signal, not an absence, so it can close immediately without waiting out grace.

> **Note on uniformity.** Auto-close is *not* uniform in the codebase today: span-edit closes are immediate; doc-scope + sweep conflict closes use grace; `resolved_prior` and `block_removed` are immediate. This doc adopts grace **for the conflict-resolution path only** (these are sweep-born cards, so grace is the consistent local choice). A broader "unify all auto-archive close semantics" is explicitly out of scope here — flag it as a separate lifecycle item if it's worth doing.

## Open questions

1. **Grace vs. immediate on the A-close.** Leaning grace (consistency + stochastic-miss safety). Immediate would feel more responsive for the "I fixed it" moment. Owner call.
2. **Re-anchor on B-keep.** When B confirms a still-standing conflict after a rewording, should the card's anchor/text update to the new wording, or stay frozen (the D5 doc-scope default)? Frozen avoids flicker; updating keeps the highlight honest.
3. **RPD budget for B.** B is gated to the ambiguous case, but on a free/keyless run even one strong call per touched card competes with the ~20/day RPD floor. Consider capping B fires per settle, or skipping B on the weak tier (fall back to grace-only A). Ties into the Phase-8 free-vs-paid delta.

## Verification

- Reproduce: load the demo doc, let the sweep flag the Q2/Q3 conflict, edit either side to resolve → the card must close (within one grace beat). Drive via the Browser pane against the demo (`window.__sidecar__` state; assert the observation moves to `auto_closed` with reason `resolved_by_edit`).
- Regression fixture: two-section Q2-vs-Q3 doc; (i) resolve one side → card closes; (ii) reword the conflicting claim so it *still* conflicts → card stays (B keeps it). Both directions of the pair.
- Guard: editing an unrelated span in a block that co-anchors a still-valid conflict must **not** close the card (the incremental re-emits it → kept).
