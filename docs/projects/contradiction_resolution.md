---
status: idea
kind: quality
phases: [8]
summary: The resolution-side sibling of contradiction_coverage — a caught contradiction/tension card can go stale after the user fixes the underlying text, because the only all-pairs authority (the ledger sweep) never re-runs on edits and the per-section edit path only reconciles conflict cards on their *primary* anchor. Leaning direction (2026-07-14): an edit-scoped, either-side conflict re-verification where a free deterministic check (A) gates one cheap targeted LLM confirm (B), closing with a grace beat.
---

# Contradiction resolution — when does a caught conflict card actually close

> Sibling to [`contradiction_coverage.md`](contradiction_coverage.md). That doc answers _"when does a contradiction get **detected**."_ This one answers _"once detected, when does the card **close** after the user resolves it."_ Both are the same hero moment seen from two ends — "it caught a contradiction I wrote" is only trustworthy if "…and it noticed when I fixed it" holds too. A card that lingers after the conflict is gone is a **false positive that teaches the user the signal is stale**, which is worse than never having flagged it.

## Status

> Canonical status is the frontmatter (`idea`). Field-discovered 2026-07-14 from a live paid-tier (`gemini-2.5-pro`) session on the "See it in action" demo doc; root-caused the same day. **Design settled 2026-07-16** (§ _Build spec_ below): A-gates-B + grace, the three open questions resolved with recorded recommendations — grace on A-closes (threshold 2, the shared constant) · edited-side **anchor** updates on a B-keep with the card message frozen · B capped at one call per settle and skipped entirely on the weak tier. Owner ratification of those three calls happens at build pickup (they are recommendations with rationale, not unilateral policy). No code written.

## Phased Plan

- **Phase 8 (this doc).** Close the resolution gap for conflict cards (`contradiction` / `strategic_tension`). Composes with the Phase-8 signal-quality work (V1 keyed runs, precision-floor recalibration) because a stale contradiction card is a *precision* miss the corpus study would otherwise count against the wrong axis. Does not touch detection (`contradiction_coverage.md`, shipped) or doc-scope reconciliation (`doc_scope_reconciliation.md`, shipped) — it fills the one seam between them.

## Todo

- [ ] Owner ratification (at build pickup) of the three settled calls: A-gates-B + grace over pure-A / pure-B · grace-not-immediate on A-closes · anchor-updates-message-frozen on a B-keep · B capped at 1/settle and skipped on the weak tier. Recommendations + rationale in § _Build spec_.
- [ ] Prototype on a branch; drive it in the browser against the exact demo scenario below (edit the Timeline Q2→Q3, watch the sweep-born card close) before any PR.
- [ ] Build `reconcileConflictCardsOnEdit` (new arm in `evaluatorReconcile.ts`) per § _Build spec_: either-side candidate collection, the A classifier, the gated B confirm, grace bookkeeping — and **route conflict cards out of the span-card decision table's step-4 blanket close** (which today false-closes primary-side conflict cards on any prefilter miss).
- [ ] Thread the two inputs the arm needs from `evaluateSection`: this settle's `extractedClaims` (already in scope) and the freshly-emitted conflict pair keys.
- [ ] Ratchet/regression fixture: a two-section Q2-vs-Q3 doc, fix one side, assert the card closes (and that a reworded-but-still-conflicting edit does **not** close it) — both directions of the pair, plus the unrelated-edit guard.
- [ ] Update `docs/mechanics/` (the observation-lifecycle / evaluation-triggers docs) in the same PR — conflict-card close semantics change.

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

## Direction — A gates B, close with grace (was "leaning"; settled 2026-07-16, build spec below)

The two candidate mechanisms compose into one, rather than being an either/or:

- **A — deterministic, no LLM (the gate).** On settle, collect active `contradiction`/`strategic_tension` cards touching any member block on **either** anchor side (widen the [`evaluatorReconcile.ts:154`](../../src/services/evaluatorReconcile.ts) filter to mirror block-removal). For each card:
  - anchor claim on the edited side is **gone** from the fresh extract → close (grace beat);
  - the incremental check **re-emitted** this exact pair (by `conflictPairKey`) → still conflicts → keep, reset grace;
  - claim **still present but reworded**, pair not re-emitted → *ambiguous* → hand to B.
- **B — one targeted 2-claim confirm (only on ambiguity).** Re-run a single contradiction check with the *current* text of both sides. `no conflict` → close; still conflicts → keep (and re-anchor to the new text). ~1–2 s, reads 2 claims, fires only when A can't decide — strictly cheaper than firing B on every touched card, strictly more robust than A alone (which would false-close a reworded-but-still-conflicting claim).

**Grace beat.** Applies to A's *absence* close (guards a stochastic re-extraction miss), consistent with how sweep and doc-scope conflict cards already close (`DOC_GRACE_THRESHOLD = 2`, [`evaluatorReconcile.ts:292`](../../src/services/evaluatorReconcile.ts)). A **B-confirmed** resolution is an affirmative signal, not an absence, so it can close immediately without waiting out grace.

> **Note on uniformity.** Auto-close is *not* uniform in the codebase today: span-edit closes are immediate; doc-scope + sweep conflict closes use grace; `resolved_prior` and `block_removed` are immediate. This doc adopts grace **for the conflict-resolution path only** (these are sweep-born cards, so grace is the consistent local choice). A broader "unify all auto-archive close semantics" is explicitly out of scope here — flag it as a separate lifecycle item if it's worth doing.

## Build spec (settled 2026-07-16)

**New reconcile arm — `reconcileConflictCardsOnEdit` (`evaluatorReconcile.ts`), called from `evaluateSection` after the span-card reconcile.** Conflict cards leave the span-card decision table entirely: today its step-4 blanket close ("existing with no new match → `resolved_by_edit`") is applied to primary-anchored conflict cards, which means **any prefilter miss on an untouched still-valid conflict false-closes it the moment its primary section is edited** — the A/B arm replaces that for both sides, making the primary side *more* robust, not just adding the secondary side.

Inputs threaded from `evaluateSection` (both already exist at the call site): the settle's in-memory `extractedClaims` and the set of conflict pair keys the incremental check just emitted (`freshPairKeys`).

1. **Collect** active `contradiction` / `strategic_tension` cards touching any member block on **either** side: `memberSet.has(o.blockId) || (o.conflictingBlockId != null && memberSet.has(o.conflictingBlockId))` — the same either-side predicate `handleBlockRemoved` already uses (`orchestrator.ts:174`).
2. **A — deterministic classifier**, per card. The *edited side* is whichever anchor sits in `memberSet`; its claim text is `anchorText` (primary) or `conflictingAnchorText` (secondary).
   - **Re-emitted:** `freshPairKeys.has(conflictPairKey(card))` → still conflicts → keep; reset `missCount` to 0.
   - **Gone:** no fresh extracted claim matches the edited side's claim text (match = normalized-text equality, else containment in either direction — the same normalization family `isSpanSuppressed` uses) → the user removed/resolved that claim → **grace-close**: bump `missCount`; at `DOC_GRACE_THRESHOLD (= 2)` close as `auto_closed` / `resolved_by_edit`.
   - **Reworded (ambiguous):** a fresh claim matches but the pair wasn't re-emitted → hand to B.
3. **B — one targeted 2-claim confirm** (per settle, at most **one** card — if several are ambiguous, confirm the highest-priority card; the rest take the grace path this settle). Reuse the existing per-section prompt (`CONTRADICTION_SYSTEM_PROMPT`, hedged variant per capability) with New Claims = [the edited side's current claim text] and Existing Claims = [the other side's claim text]. `no conflict` → close **immediately** (`resolved_by_edit` — an affirmative adjudication, not an absence); still conflicts → keep, reset `missCount`, and **update the edited side's anchor** (blockId/offsets/anchorText from the matching fresh claim's anchor fields) while the card's `text` (message) stays frozen.
4. **Weak tier:** when `capability.adjudicateConfidently` is false, **skip B entirely** — ambiguous cards take the grace path (A-only). A weak model's 2-claim adjudication isn't trustworthy enough to close or re-confirm the hero card (V1 Run 1: the free tier's contradiction output was 100% false), and this keeps the free tier's RPD budget out of the loop.

**The three formerly-open calls, resolved (recommendations for owner ratification at pickup):**

1. **Grace, not immediate, on A-closes** — extraction is stochastic; a one-miss immediate close would let a single flaky re-extract kill a true conflict card. Grace (threshold 2, the shared `DOC_GRACE_THRESHOLD`) is also how every other sweep-born close already behaves. The responsiveness cost is one settle cycle; the B path gives the satisfying *immediate* close in the case where the user visibly reworded the claim.
2. **B-keep updates the edited side's anchor; message stays frozen** — for a conflict card the span↔card highlight *is* the product's hero surface, so a stale anchor is a truth defect, not flicker; but re-writing the message on every keep is exactly the churn D5 froze doc-scope text to avoid. Splitting the two (anchor live, prose frozen) takes both honesty and calm.
3. **B capped at 1/settle; skipped on weak tier** — bounds worst-case cost at one extra strong call per settle on paid keys and zero on free, consistent with the RPD posture everywhere else in the pipeline.

**Files:** `evaluatorReconcile.ts` (the new arm + removing conflict types from the span-card table's candidate set), `evaluator.ts` (`evaluateSection` call site: thread `extractedClaims` + `freshPairKeys`, and the B-call helper next to the existing contradiction-call code), `orchestrator.ts` untouched. No DB change (`missCount`/`lastSeenAt` already exist on observations).

## Open questions

_All three resolved 2026-07-16 — see § Build spec. Kept for the record:_

1. ~~Grace vs. immediate on the A-close~~ → **grace** (threshold 2; consistency + stochastic-miss safety; B covers the immediate-feel case).
2. ~~Re-anchor on B-keep~~ → **edited-side anchor updates; card message frozen** (highlight honesty without D5-style text churn).
3. ~~RPD budget for B~~ → **cap 1/settle; skip B on the weak tier** (grace-only A there — V1 Run 1 showed weak-tier contradiction adjudication is not trustworthy anyway).

## Verification

- Reproduce: load the demo doc, let the sweep flag the Q2/Q3 conflict, edit either side to resolve → the card must close (within one grace beat). Drive via the Browser pane against the demo (`window.__sidecar__` state; assert the observation moves to `auto_closed` with reason `resolved_by_edit`).
- Regression fixture: two-section Q2-vs-Q3 doc; (i) resolve one side → card closes; (ii) reword the conflicting claim so it *still* conflicts → card stays (B keeps it). Both directions of the pair.
- Guard: editing an unrelated span in a block that co-anchors a still-valid conflict must **not** close the card (the incremental re-emits it → kept).
