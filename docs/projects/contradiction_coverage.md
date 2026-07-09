---
status: idea
kind: quality
phases: [6]
summary: Close the gaps where a genuine contradiction goes undetected depending on how the text entered — intra-section pairs are excluded from the per-section check and the all-pairs ledger sweep runs only on paste, so a blatant same-section contradiction surfaces (if at all) as a weak `clarity` nit.
---

# Contradiction coverage — when does the cross-claim check actually run

## Status

> Canonical status is the frontmatter (`idea`). This is an **open design question surfaced during testing, not a scoped solution.** It records a real coverage hole and the options; the mechanism decision is deliberately deferred (do not patch inline).

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

## Options (decision needed — not yet made)

- **A — Include same-section pairs in the per-section check.** Relax the filter to exclude only genuine self-pairs (same claim), then dedup emissions by `conflictPairKey` (the sweep already shares this identity, so per-section + sweep coalesce). Lowest-latency (catches while typing); risk: more fast-context/strong-call volume and potential noise; needs the same "compatible-but-unspecified → not a conflict" discipline the sweep got in OBS-031.
- **B — Run the ledger sweep on idle, not only on paste.** Trigger `handleBootstrapSweep` from the doc-idle arm when the ledger changed since the last sweep (it is already dirty-checked on `${docId}::sweep`). Reuses the authoritative all-pairs path; risk: paid-tier call cadence on every idle, and interacts with the UX-016 gate (hole 3).
- **C — Promote the fast model's own detected conflict.** The fast section-eval already writes _"X conflicts with Y"_ as `clarity`; route that into the contradiction taxonomy instead of laundering it as a clarity nit. Risk: taxonomy discipline — the fast tier isn't the contradiction adjudicator, and this blurs the clarity/contradiction boundary; likely wrong on its own but informative.

Any option must compose with the discomfort-budget floor/ceiling (G4) and the maturity gate (hole 3 / UX-016), and preserve the fixed taxonomy.

## Phased Plan

| Phase | Work |
| ----- | ---- |
| 6 | Decision spike: pick a mechanism (A / B / C / hybrid) with the owner; quantify the cost/noise tradeoff against the RPD budget; then implement the chosen path and add ratchet coverage (a typed-intra-section-contradiction fixture, currently uncovered — the sweep fixture only exercises the paste path). |

## Todo

### Phase 6

- [ ] **Decide the mechanism** (A / B / C / hybrid) with the project owner — this is a product-taste + cost call, not a mechanical fix.
- [ ] Implement the chosen path (touches `src/services/evaluator.ts` per-section check and/or `src/services/orchestrator.ts` sweep trigger).
- [ ] Add ratchet/regression coverage for a **typed** intra-section contradiction (today only the paste sweep is fixtured — `contradiction-sweep-fidelity`).
- [ ] Reconcile with the UX-016 maturity gate so a short, blatantly-contradictory draft isn't silently skipped.

## Related

- `docs/projects/section_eval_precision.md` (OBS-026 — intra-section conflict _anchoring_, done; this is the _detection_ half).
- `docs/logs/ux_quality_observations.md` (UX-016 — sweep silenced on short drafts; UX-018 — this session).
- `docs/logs/prompt_quality_observations.md` (OBS-033 — contradiction mislabeled `clarity`).
- `docs/projects/quality_remediation_synthesis.md` (root-cause synthesis layer).
