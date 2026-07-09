---
status: in-progress
kind: quality
phases: [6]
summary: Close the gaps where a genuine contradiction goes undetected depending on how the text entered — intra-section pairs are excluded from the per-section check and the all-pairs ledger sweep runs only on paste, so a blatant same-section contradiction surfaces (if at all) as a weak `clarity` nit. Decided direction (2026-07-09): mechanism A — widen the per-section check to include same-section pairs.
---

# Contradiction coverage — when does the cross-claim check actually run

## Status

> Canonical status is the frontmatter (`in-progress`). The design question below is **resolved** — see § Decided direction. Mechanism A (widen the per-section check) was chosen with the owner on 2026-07-09; implementation is underway in the Prompt/signal lane.

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

## Phased Plan

| Phase | Work |
| ----- | ---- |
| 6 | Decision spike: pick a mechanism (A / B / C / hybrid) with the owner; quantify the cost/noise tradeoff against the RPD budget; then implement the chosen path and add ratchet coverage (a typed-intra-section-contradiction fixture, currently uncovered — the sweep fixture only exercises the paste path). |

## Todo

### Phase 6

- [x] **Decide the mechanism** — done 2026-07-09: **A** (widen the per-section check). See § Decided direction.
- [ ] Implement the chosen path — replace the `sourceBlockId !== sectionId` filter in `src/services/evaluator.ts` (~L479) with a claim-text-identity self-exclusion; dedup emissions by `conflictPairKey`.
- [ ] Add ratchet/regression coverage for a **typed** intra-section contradiction (today only the paste sweep is fixtured — `contradiction-sweep-fidelity`).
- [x] Reconcile with the UX-016 maturity gate — A resolves the short-draft **intra-section** case for free (per-section check is not maturity-gated); the cross-section sweep-gating facet of UX-016 stays out of scope.

## Related

- `docs/projects/section_eval_precision.md` (OBS-026 — intra-section conflict _anchoring_, done; this is the _detection_ half).
- `docs/logs/ux_quality_observations.md` (UX-016 — sweep silenced on short drafts; UX-018 — this session).
- `docs/logs/prompt_quality_observations.md` (OBS-033 — contradiction mislabeled `clarity`).
- `docs/projects/quality_remediation_synthesis.md` (root-cause synthesis layer).
