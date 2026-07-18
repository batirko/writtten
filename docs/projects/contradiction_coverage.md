---
status: in-progress
kind: quality
phases: [6, 8]
summary: Close the gaps where a genuine contradiction goes undetected depending on how the text entered. Phase 6 shipped mechanism A (same-section pairs folded into the per-section check). Phase 8 reopened the file for the two detection gaps V1 Run 1 made concrete — the paste sweep's word-count gate silencing short-draft cross-section conflicts (UX-016), and the Jaccard prefilter's near-duplicate crowding that hid a real SLA contradiction from the adjudicator entirely (OBS-038, the diagnosed cause of 0% hero recall on real PRDs).
---

# Contradiction coverage — when does the cross-claim check actually run

## Status

> Canonical status is the frontmatter (`in-progress`). **Phase 6 shipped:** mechanism A (widen the per-section check) was chosen with the owner on 2026-07-09 and **shipped the same day in #161** with the `contradiction-intra-section` ratchet fixture — see § Decided direction for the as-built shape. **Reopened for Phase 8 (2026-07-16):** the two remaining detection gaps now have settled build specs below — § _Phase 8A — ungate the paste sweep_ (UX-016's cross-section short-draft facet) and § _Phase 8B — per-claim candidate selection_ (OBS-038, the V1-diagnosed hero-recall failure). The resolution-side sibling (when a caught card *closes*) is `contradiction_resolution.md`, not here.

## Decided direction (2026-07-09 — mechanism A)

**Chosen: A — include same-section pairs in the per-section contradiction check.** Picked with the owner over B (idle sweep) and C (promote the fast model's clarity finding) on a cost + latency + taxonomy basis:

- **Zero new call cadence.** The per-section check already fires a `router.strong` contradiction call on every section settle (`evaluator.ts` ~L507). It is _not_ maturity/word-count gated (only the paste sweep is — that's UX-016). The intra-section pairs are missed solely because the candidate filter `existingClaims.filter((c) => c.sourceBlockId !== sectionId)` (~L479) throws out **all** same-section claims to avoid self-comparison. Widening that filter changes _what the existing call compares_, not _how often a call fires_ — so it costs nothing against the binding free-tier RPD budget (~20/day/model). B, by contrast, adds a strong call on every doc-idle.
- **Catches while typing** (A fires per settle; B only at idle).
- **Composes, doesn't blur.** Emissions dedup against the paste sweep via the shared `conflictPairKey` (both engines already key conflicts by that identity), so per-section + sweep coalesce instead of double-flagging. C was rejected because it makes the non-adjudicating fast tier the contradiction source and blurs the clarity/contradiction boundary.

**Implementation shape (as built).** The per-section contradiction candidate pool is `other-section claims (from the ledger)` **plus** `this section's own claims` — but the same-section half is folded in **only when the section has ≥2 claims** (an intra-section pair is actually possible) and is taken from the **in-memory `extractedClaims`**, not a re-read of the ledger. Two properties fall out:

- **≥2 gate keeps single-claim sections byte-identical.** A lone section claim can't self-contradict; folding it in would just be a self-dup that perturbs every single-claim section's contradiction prompt (and its recorded hash) for zero gain. So only genuinely multi-claim sections change their prompt — in the corpus that's exactly two fixtures (`clarity-discrimination`, `clarity-wordy-specified`), re-keyed byte-identically.
- **In-memory, not a DB re-read — the load-bearing fix.** `saveClaimsForBlock` persists the section's claims just before the contradiction check, but on the **first settle** those rows are not reliably visible to an immediately-following `loadActiveClaimsForDocument` (IndexedDB read-after-write, even with `await tx.done`). A DB-based same-section fold therefore fired the intra-section contradiction only on a _later_ settle — flaky exactly on the type-it-once hero path (found in live testing 2026-07-09; the fast model meanwhile laundered the conflict into a `clarity` nit). `extractedClaims` is a local in the same `evaluateSection` call, so the claims are present with certainty on the first settle. It carries the same text/kind/anchor offsets, so the prompt (and hash) is identical to the DB-read version.

Self-pairs (a claim vs its own copy — identical normalized text) are dropped at emit, the same guard the sweep applies; A×B/B×A directions coalesce via `conflictPairKey`. The existing top-10 `prefilterClaims` bound and deterministic sort stay, and the OBS-031 "compatible-but-unspecified → not a conflict" discipline in `CONTRADICTION_SYSTEM_PROMPT` guards the main added risk (same-section false conflicts).

**UX-016 reconciliation.** A resolves the short-draft gap _for the intra-section case_ for free — the per-section check has no maturity gate, so a two-line blatantly-contradictory draft in one section now surfaces a `contradiction` card immediately. The _cross-section_ short-draft-via-sweep facet of UX-016 (hole 3) is a separate, still-open sweep-gating question and is explicitly out of scope here.

### Original options (for the record — decision made above)

The product's hero moment is _"it caught a contradiction I wrote."_ But whether a contradiction is caught at all depends on **how the conflicting claims entered the document**, not on how blatant the conflict is. Two claims that plainly cannot both be true can go entirely undetected — or surface only as a soft `clarity` nit — because the cross-claim contradiction machinery has three coverage holes that don't compose into "always catch a real contradiction."

## The gap (three coverage holes)

Contradiction detection has two engines, plus a gate:

1. **Per-section contradiction check** (`evaluateSection` → runs on every settle while typing). It loads the ledger and compares the current section's claims against **other sections'** claims: `const otherClaims = existingClaims.filter((c) => c.sourceBlockId !== sectionId)` (`src/services/evaluator.ts`, ~L468). Because **all** of a section's claims are keyed under that section's representative id (`sourceBlockId = sectionId`), this filter excludes **every same-section pair**, not just self-pairs. → **Intra-section contradictions are never compared while typing.**

2. **Ledger contradiction sweep** (`evaluateLedgerContradictions`, the all-pairs strong-tier call that _does_ compare same-section pairs). It is triggered **only** on `block-paste`: `if (trigger.kind === "block-paste") handleBootstrapSweep(...)` (`src/services/orchestrator.ts:475`). `handleDocIdle` runs `evaluateDocument` (doc-level observations), **not** the sweep. → **Typing never triggers the all-pairs sweep;** only a bulk paste does.

3. **Maturity / word-count gate** silences short drafts (already logged as **UX-016**): the bulk-paste sweep is gated behind `CONTENT_THRESHOLD_WORDS` (150), so a short, punchy outline with a blatant flaw is skipped even on paste.

Net effect by entry path:

| How the two conflicting claims got in | Same section? | Caught as `contradiction`? |
| --- | --- | --- |
| Typed, in different sections | no | ✅ per-section check |
| Typed, in the same section (e.g. no headings → one intro section) | yes | ❌ — surfaces as `clarity` at best |
| Pasted together, long enough | either | ✅ ledger sweep |
| Pasted together, short draft | either | ❌ — gated by UX-016 |

## Evidence (2026-07-09 session)

A doc with two paragraphs (no heading → **one** intro section):

- ¶1: _"We will launch the redesigned checkout to 100% of users in Q2."_ (commitment)
- ¶2: _"We will not launch the redesigned checkout to any users before Q4."_ (constraint)

The fast section-eval model **recognized the conflict** — it returned, as a `clarity_observation`, _"The commitment to launch in Q2 conflicts with the constraint prohibiting any launch before Q4."_ — but no `contradiction` card ever appeared. The two claims share `sourceBlockId` (both under the intro rep), so the per-section check excluded them; the sweep never fired because the paragraphs were typed, not pasted. See `docs/logs/prompt_quality_observations.md` (OBS-033) and `docs/logs/ux_quality_observations.md` (UX-018).

## Why the exclusion exists (and why it's coarser than intended)

The `sourceBlockId !== sectionId` filter is there so a section's own freshly-extracted claims aren't double-counted / self-compared as it re-evaluates. But because claims are keyed by the section **representative** id (not the block where the claim text lives), the filter throws out **all** intra-section pairs — a much bigger cut than "don't compare a claim to itself." OBS-026 (done) made intra-section conflicts _renderable_ (single-block anchoring when a same-block conflict is found), but detection during typing was never wired — the only path that produces same-section conflict pairs is the paste sweep.

- **A — Include same-section pairs in the per-section check.** ← **chosen (see § Decided direction)** Relax the filter to exclude only genuine self-pairs (same claim), then dedup emissions by `conflictPairKey` (the sweep already shares this identity, so per-section + sweep coalesce). Lowest-latency (catches while typing); risk: more fast-context/strong-call volume and potential noise; needs the same "compatible-but-unspecified → not a conflict" discipline the sweep got in OBS-031.
- **B — Run the ledger sweep on idle, not only on paste.** Trigger `handleBootstrapSweep` from the doc-idle arm when the ledger changed since the last sweep (it is already dirty-checked on `${docId}::sweep`). Reuses the authoritative all-pairs path; risk: paid-tier call cadence on every idle, and interacts with the UX-016 gate (hole 3).
- **C — Promote the fast model's own detected conflict.** The fast section-eval already writes _"X conflicts with Y"_ as `clarity`; route that into the contradiction taxonomy instead of laundering it as a clarity nit. Risk: taxonomy discipline — the fast tier isn't the contradiction adjudicator, and this blurs the clarity/contradiction boundary; likely wrong on its own but informative.

Any option must compose with the discomfort-budget floor/ceiling (G4) and the maturity gate (hole 3 / UX-016), and preserve the fixed taxonomy.

## Phase 8A — ungate the paste sweep (UX-016 cross-section short-draft facet; design settled 2026-07-16)

**The gate being questioned:** the editor schedules the `block-paste` sweep only when `getWordCount(editor) >= CONTENT_THRESHOLD_WORDS` (150) — `src/editor/Editor.tsx:479` (paste arm) and `:1344` (load/import arm). Note this is the **raw word cliff**, not the maturity proxy that replaced the same cliff for doc-idle (UX-013) — the sweep never got that upgrade.

**Decision: remove the editor-side word gate entirely; the sweep's own intrinsic guards are the right gate.** `evaluateLedgerContradictions` already carries three: it returns before any model call when the ledger has **< 2 claims** (`evaluator.ts:1088`), it is **dirty-checked** on the ledger hash (`${docId}::sweep`), and it defers under **RPM backpressure**. Those encode the sweep's *actual* precondition — "are there at least two claims to compare" — where word count is a proxy that is precisely wrong on the UX-016 case (a short, punchy outline with a blatant conflict is low-word-count *and* high-claim-density). Scheduling unconditionally and letting a claim-poor paste no-op costs two IndexedDB reads, zero requests.

**Cost analysis (why this is safe against the RPD budget):** pasted sections run their fast evals with `skipContradiction` — the sweep *replaces* N per-section strong calls, it doesn't add to them. Ungating therefore adds at most **one strong call per user-initiated paste that produces ≥2 claims and a changed ledger** — a user-paced event, not a keystroke-paced one, and exactly the moment UX-016 shows the hero is worth one call. Free tier runs the hedged sweep prompt via the capability descriptor, unchanged.

**V1 evidence, weighed both ways:** V1 Run 1 says real-PRD contradiction precision is bad (15%) — an argument against *widening* exposure — but the FP classes it diagnosed are prompt-discipline and tagging failures (scope-exclusion misreads, restatement misreads — OBS-030 territory), not draft length; short drafts have tiny all-pairs sets where the blatant-conflict case dominates. Sequencing guard: **land OBS-030 (scope-excluded tagging — its own Phase-8 milestone, whose skip rule reaches the sweep prompt) before or with this**, so the ungated sweep runs with the dominant sweep-side FP class repaired. (8B is orthogonal to the sweep — the sweep is all-pairs and never runs the prefilter; 8B repairs the *per-section* path where P09's miss actually happened.)

**Verification:** ratchet fixture `contradiction-short-paste` — a two-claim, ~30-word contradictory paste → sweep fires, `contradiction` card appears (mock replay); unit case — a no-claim short paste schedules the sweep but makes **no** model call; live: the original UX-016 repro string ("challenge window 60s / expires in 30s") caught on paste. Update `docs/mechanics/evaluation-triggers.md` (§ block-paste) in the same PR.

## Phase 8B — per-claim candidate selection (OBS-038; design settled 2026-07-16, **shipped 2026-07-17**)

**The defect (V1 Run 1, doc P09):** `prefilterClaims` is queried with the **whole settling section's concatenated claim blob** and keeps a single global top-10 (`evaluator.ts:551–554`). Two composing failures: the blob query dilutes any one claim's retrieval signal, and a **compatible near-duplicate** of a claim (α, "change→detection < 5 min") outscores and evicts the **contradictory** claim (β, "change→PR < 5 min" vs γ, "detection→PR < 1 hr") — so the true pair β×γ never co-occurred in any prompt, in either direction. The adjudicator was never asked; 0% hero recall on real PRDs.

**Decision — (a) per-claim retrieval + (b) candidate near-duplicate dedup, keeping lexical Jaccard; (c) embeddings stay deferred behind V3's prefilter-drop measurement** (the standing LEANN trigger); (d) numeric-family K-widening not taken — per-claim retrieval already gives each claim its own slots, and V3 will show whether a numeric-family residual exists.

Why this composition: a genuine contradiction almost always shares its **subject** with its counterpart — same feature, same metric, same date family — so pairwise lexical similarity between the two conflicting claims is high even when a blob query buries it. Querying **per new claim** makes that pairwise signal the retrieval signal. The near-duplicate dedup then keeps a paraphrase-cluster from monopolizing the per-claim list (the residual occupancy risk when a claim has many compatible restatements — OBS-025's territory).

**Mechanism (`src/services/prefilter.ts` + the call site in `evaluator.ts`):**

```
selectContradictionCandidates(newClaims, otherClaims, { perClaimK = 5, totalCap = 15 }):
  1. dedup otherClaims: normalized-token-set Jaccard ≥ 0.9 between two candidates
     → keep the first (stable order); frees slots a paraphrase cluster would burn.
  2. for each new claim: prefilterClaims(claim.text, dedupedOthers, perClaimK)
  3. union the per-claim lists (dedupe by candidate identity), rank by each
     candidate's max per-claim score, slice to totalCap, then re-sort by the
     existing stable (text, sourceBlockId) order for prompt determinism.
```

**Fixture stability:** `prefilterClaims` is a no-op when `candidates.length <= topK`, and every ratchet fixture is a small doc (≤ totalCap candidates) — the union path degrades to "all candidates" there, so **existing contradiction request hashes stay byte-identical**; assert that in the unit tests before touching fixtures. Prompt growth is bounded: 10 → ≤15 candidates worst-case, only on large ledgers.

**Verification:** (1) unit tests on the pure selector — the P09 shape reproduced synthetically (an α/β/γ SLA triplet with a decoy near-duplicate: β's prompt set must contain γ and vice versa; the ≥0.9 dedup keeps one of two restatements; small-doc no-op identity); (2) a new ratchet fixture `contradiction-sla-family` (synthetic triplet, live-recorded — rides the Phase-8 recording session in `evaluator_quality_ratchet.md`); (3) the V3 recall harness re-run over the V1 labels — P09's β×γ co-occurrence is the acceptance check, and the with/without-prefilter drop count quantifies what remains for the LEANN decision.

## Phased Plan

| Phase | Work |
| ----- | ---- |
| 6 | Decision spike: pick a mechanism (A / B / C / hybrid) with the owner; quantify the cost/noise tradeoff against the RPD budget; then implement the chosen path and add ratchet coverage (a typed-intra-section-contradiction fixture, currently uncovered — the sweep fixture only exercises the paste path). **Shipped #161.** |
| 8 | **8A** — remove the paste sweep's editor-side word gate (UX-016 cross-section facet); **8B** — per-claim candidate selection + near-duplicate dedup (OBS-038, per-section path). 8A waits for OBS-030's scope-excluded tagging (the sweep-side FP repair); 8B is independent. |

## Todo

### Phase 6

- [x] **Decide the mechanism** — done 2026-07-09: **A** (widen the per-section check). See § Decided direction.
- [x] Implement the chosen path — replace the `sourceBlockId !== sectionId` filter in `src/services/evaluator.ts` (~L479) with a claim-text-identity self-exclusion; dedup emissions by `conflictPairKey`.
- [x] Add ratchet/regression coverage for a **typed** intra-section contradiction (today only the paste sweep is fixtured — `contradiction-sweep-fidelity`).
- [x] Reconcile with the UX-016 maturity gate — A resolves the short-draft **intra-section** case for free (per-section check is not maturity-gated); the cross-section sweep-gating facet of UX-016 stays out of scope.

### Phase 8

- [x] **8B — build `selectContradictionCandidates`** (pure, `prefilter.ts`) + swap it in at the contradiction call site (`evaluator.ts`, the `"prefilter"` branch of V3's `contradictionCandidates` seam) with the byte-identical small-doc guarantee asserted in unit tests first. **Shipped:** `perClaimK=5`, `totalCap=15`, dedup `≥0.9` keep-first; byte-identity held on the whole corpus (self-inclusion property — each same-section new claim retrieves itself at Jaccard 1.0, so the union covers all candidates). Unit tests in `prefilter.test.ts`.
- [x] **8B — `contradiction-sla-family` ratchet fixture** (synthetic α/β/γ SLA triplet, >10 candidates so the selector actively selects; free-tier recorded). **Shipped:** the strong contradiction fires end-to-end (β change-to-PR <5 min × γ change-to-PR up to 1 hour); the `evaluator.prefilterBypass.test.ts` all-pairs≡prefilter no-op case excludes this fixture by design (it exceeds the no-op threshold).
- [ ] **8B — V3 acceptance:** re-run the recall harness over the V1 labels; P09's β×γ must co-occur in an assembled prompt; record the prefilter-drop count for the LEANN trigger.
- [ ] **8A — remove the word gate** at `Editor.tsx:479` and `:1344`; add the `contradiction-short-paste` fixture + the no-claim no-call unit case; live-verify the UX-016 repro string; update `docs/mechanics/evaluation-triggers.md`. _(Owner ratification of the ungate decision at pickup — it spends one strong call per small paste; recommendation + cost analysis in § Phase 8A.)_
- [ ] **8A sequencing** — do not ship 8A ahead of OBS-030 (scope-excluded tagging, its own Phase-8 milestone): the ungated sweep should run with the sweep-side FP class repaired so widened exposure doesn't widen the V1-measured false positives.

## Related

- `docs/projects/section_eval_precision.md` (OBS-026 — intra-section conflict _anchoring_, done; this is the _detection_ half).
- `docs/logs/ux_quality_observations.md` (UX-016 — sweep silenced on short drafts; UX-018 — this session).
- `docs/logs/prompt_quality_observations.md` (OBS-033 — contradiction mislabeled `clarity`).
- `docs/projects/quality_remediation_synthesis.md` (root-cause synthesis layer).
