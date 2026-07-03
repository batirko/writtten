---
status: idea
kind: quality
phases: [6]
summary: Precision costs of the section-as-eval-unit isolation — the contradiction sweep silently drops intra-section conflicts (OBS-026), section-eval span checks false-positive on references defined in sibling sections (OBS-027), and a heading-only section (no body) hallucinates a fabricated section (OBS-029). Surface intra-block conflicts with single-block anchoring; inject sibling summaries + the active claim ledger + heading-intent as established context; and make bodyless-heading sections inert.
---

# Section-eval precision (intra-section conflicts + cross-section context)

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 6 (design settled 2026-06-26; OBS-029 added 2026-07-02; ready to build).** All three findings are precision follow-ons to `section_as_eval_unit.md` (done, Phase 4): once the **section** became the atomic eval unit, its isolation and grain produced distinct costs — the first two observed in the live `gemini-2.5-pro [paid]` session of 2026-06-25, the third (OBS-029) in the 2026-07-02 toggle→revert session:

- **OBS-026 — intra-section contradictions never reach the feed.** The contradiction-sweep consumer drops any conflict whose two claims share a source block, because whole-block anchoring can't render two spans inside one block as the A↔B cross-highlight. Related conflicting claims most often live in the _same_ section, so this swallows the sharpest issues (in that session, a 60s challenge window vs a 60s transaction expiry — twice).
- **OBS-027 — span checks false-positive on cross-section references.** Section-eval judges each section in isolation (payload = one section's `combinedText` + stage + glossary), so reference-resolving span checks (`clarity` / `undefined_jargon` / `unsupported_claim`) flag anything defined or asserted in a _sibling_ section ("this notification pattern" flagged undefined when §Solution defines it), and ignore a governing heading ("Multiple retries" flagged ambiguous when it sits under **Out of scope**).
- **OBS-029 — a heading-only section hallucinates (2026-07-02).** The section grain can still hand the LLM a heading with no body (a block-type toggle, a heading typed before its body, a body deleted under a heading); the length-only guard lets it through, and the model fabricates a whole section — fabricated claims that then pollute the ledger and drive a **paid** contradiction/tension. A regression of the exact hallucination class `section_as_eval_unit` targeted; the fix is a bodyless-section short-circuit in `evaluateSection`.

The three are mechanically distinct — OBS-026 is consumer-side **anchoring/emit** on the strong-tier sweep; OBS-027 is **prompt-input context** on the fast-tier section call; OBS-029 is a **pre-call guard** in the evaluator (a bodyless-heading section must not reach the model) — but OBS-026/027 share one thesis: _the section boundary that makes extraction clean also narrows the evaluator's view too far for cross-reference reasoning._ OBS-029 is the flip side: the section grain can present _too little_ (a heading with no body) and the length-only guard lets the model invent the rest. This spec settles all three.

Read alongside:

- `docs/projects/section_as_eval_unit.md` (done) — the structural redesign these refine; OBS-029 is a regression of the very hallucination class it targeted.
- `docs/projects/doc_level_anchoring.md` (R4) — adjacent anchoring work; **note its scope boundary** explicitly excludes the contradiction check, which is exactly OBS-026's surface, so OBS-026 lives here, not there.
- `docs/projects/revert_aware_evaluation.md` — the same 2026-07-02 toggle→revert episode exposed OBS-029; that doc owns the no-op-churn half, this one owns the hallucination guard (they land together, separable).
- `docs/logs/prompt_quality_observations.md` — OBS-026, OBS-027, OBS-029 source entries.
- `src/services/evaluator.ts` — `evaluateLedgerContradictions` (`emit`, OBS-026), `evaluateSection` (prompt assembly, OBS-027; the `cleanText.length < 10` short-circuit at L126 is where the OBS-029 bodyless guard goes).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | OBS-026: drop the same-block emit guard; render same-block conflicts as a single section highlight. OBS-027: inject sibling-section summaries + the active claim ledger as an "established elsewhere — don't flag" block in the section-eval prompt, plus a heading-intent rule. OBS-029: short-circuit bodyless-heading sections as inert before the model call. Unit + ratchet fixtures guard all three (intra-block conflict now surfaces; cross-section reference no longer false-positives; a heading-only section makes no call). |

## Todo

### OBS-026 — surface intra-section contradictions

Anchor files: `src/services/evaluator.ts` (`emit`, ~L724–757), `src/editor/extensions/ObservationHighlighter.ts` (~L168–230), `src/sidecar/SidecarFeed.tsx` (~L942), `src/services/evaluatorReconcile.ts` (pair keying ~L197/253/473).

- [x] **Drop the guard.** Remove the `a.sourceBlockId === b.sourceBlockId` early-return in `emit` (`evaluator.ts:727`). Same-block conflicts now produce an observation; `blockId` / `conflictingBlockId` are both the shared block (offsets stay the `0:9999` whole-block sentinel; `anchorText` = `a.text`, `conflictingAnchorText` = `b.text`).
- [x] **Single-block highlight (no degenerate double-decoration).** In `ObservationHighlighter`, when `obs.conflictingBlockId === obs.blockId`, render the primary whole-block highlight only and **skip** the conflicting-side decoration (otherwise two identical `0:9999` spans stack on one block). Hover still lights the one block. The card already names both claims, so no information is lost.
- [x] **Card treatment.** Keep the existing `conflictingAnchorText` "vs. «…»" line (the two claims are distinct sentences from the same section — the quote is still meaningful). Optionally add a quiet "within this section" cue; not required for the floor.
- [x] **Reconcile / dedup.** Confirm the sweep reconciler keys an intra-block pair on `[block, block]` (degenerates to the single block) and doesn't crash on the equal-id pair. **Document the v1 limitation:** two _distinct_ intra-section conflicts in the same section collapse to one (same `[block, block]` pair key + same `0:9999` content-sig). Acceptable — rare, and two conflicts in one short section is itself near-noise. Real-offset disambiguation is deferred (see _Deferred_ below).
- [x] **Tests.** (a) A same-block conflict now yields **one** observation (regression guard for the silent-drop); (b) the highlighter emits a single decoration for an `blockId === conflictingBlockId` observation; (c) a cross-block conflict is unchanged (two decorations, two-sided hover). Wire (a) into the Tier-1 ratchet so the drop can't silently return.

### OBS-027 — cross-section established-context for span checks

Anchor files: `src/services/evaluator.ts` (`evaluateSection` prompt assembly, L140–174), `src/services/evaluatorPrompts.ts` (`MERGED_SYSTEM_PROMPT`, L22). Both artifacts already exist at call time: `loadBlockSummariesForDocument(docId)` (imported, used at L485) and `loadActiveClaimsForDocument(docId)` (already loaded at L140 for the glossary).

- [ ] **Build the established-context block.** After the existing "Defined terms" block, append an `Established elsewhere in this document` section to `userParts`, composed of: (1) **sibling-section summaries** — `loadBlockSummariesForDocument(docId)` minus this section's own (`blockId !== sectionId`), each a one-line `- <summary>`; (2) **other sections' claims** — reuse `existingClaimsForGlossary`, filtered to `!memberBlockIds.includes(c.sourceBlockId)`, **all kinds** (today the glossary uses only `definition` claims; this broadens to assertions/commitments/metrics so `unsupported_claim` resolves against sibling assertions). Cap total length (e.g. summaries always; claim texts truncated to a budget) to bound tokens.
- [ ] **Gate for fixture stability.** Inject the block **only when** there is sibling content (mirrors how `priorObs` is gated at L166) so single-section base fixtures keep stable hashes; multi-section fixtures get re-recorded.
- [ ] **Prompt rule — scope the context.** In `MERGED_SYSTEM_PROMPT`, state: _you are evaluating ONLY the section below; the "Established elsewhere" block is provided so you don't flag references, terms, or claims that other sections already define/assert. Treat anything resolved by that context as defined and supported — do not flag it as undefined, unclear, or unsupported. Do not generate observations about the context block itself._
- [ ] **Prompt rule — heading governs intent.** Add: _treat the section heading as governing intent. Items under headings like "Out of scope", "Non-goals", "Future", or "Not doing" are deliberate exclusions, not omissions — do not flag them as unclear or missing for being excluded._
- [ ] **Tests / fixtures.** Discrimination fixtures: (a) "this notification pattern" with a sibling §Solution summary defining it → **no** `clarity`/`undefined_jargon` flag; (b) an item under an "Out of scope" heading → **no** "is this excluded?" `clarity` flag; (c) a genuinely undefined term with **no** sibling definition still **is** flagged (no recall regression); (d) **over-suppression guard** — a term whose only sibling mention is _tangentially related but does not actually define or support it_ (e.g. a sibling section names a _different_ retry mechanism) → still **is** flagged. The established-context block must resolve genuine references, not suppress on loose topical overlap; (c) guards the no-sibling case, (d) guards the wrong-sibling case, which is the sharper risk once the context block is broad (all-kinds ledger + every sibling summary). Wire (a)/(b)/(d) into the Tier-1 ratchet alongside the existing `clarity` discrimination fixtures.

### OBS-029 — heading-only sections must be inert

- [x] **Detect the empty body.** `resolveSections` now records `isHeading` per member (added to both the editor `SectionMember` and the services-side `SectionMember`; propagated from the internal `TopBlock.isHeading`). `evaluateSection` computes `hasBody = members.some((m) => !m.isHeading && m.text.trim().length > 0)`; an unmarked member (hand-built fixtures) falls back to "body". (Shipped 2026-07-02.)
- [x] **Short-circuit as inert.** The bodyless case is folded into the existing guard: `if (cleanText.length < 10 || !hasBody)` (`evaluator.ts`). Retires claims/observations, saves an empty summary + current hash, returns **without** a model call. A heading ≥ 10 chars no longer sails through. Mechanic doc updated (`docs/mechanics/evaluation-triggers.md` § `evaluateSection` step 2).
- [x] **Defense in depth on the strong call.** With the short-circuit ahead of extraction, a bodyless section produces no claims, so the contradiction call has nothing fresh to adjudicate. Guarded by the "no model call" assertion in the unit test (both `mockFast` and `mockStrong` un-called).
- [x] **Tests / fixtures.** Unit regression in `src/services/evaluator.test.ts` (describe *"bodyless-heading section is inert (OBS-029)"*): (a) a heading-only section clearing the 10-char guard yields **zero** claims/observations and makes **no** model call; (a′) a heading + empty-paragraph body is also inert; (b) the same heading evaluates normally once real body text is added. Plus a `resolveSections` `isHeading`-propagation test in `src/editor/section.test.ts`. Case (c) — toggle-to-heading-and-back nets to nothing — lands with revert-aware evaluation (`revert_aware_evaluation.md`). **Ratchet-wiring deviation:** the Tier-1 ratchet was *not* used for (a) — a mock-mode **miss returns `{}`** (an empty object the evaluator tolerates), so a corpus fixture with `expected: []` would pass **even if the guard were broken**, masking the regression. The meaningful guard is the unit test's "no model call" assertion; a ratchet fixture would need `runFixture` extended with a call-count assertion to bite, which the unit test already covers.

## Design

### OBS-026 — why the guard exists, and why single-block anchoring is the floor

Sweep conflicts carry no intra-block offsets — each claim anchors to its whole source block (`startOffset 0`, `endOffset 9999`). The cross-claim highlighter (`ObservationHighlighter.ts:171`, `:198`) draws **two** decorations, one per `blockId` / `conflictingBlockId`, so hovering either side or the card lights both. When the two claims share a block, both decorations cover the _same_ `0:9999` range — a degenerate self-stack. The original guard (`a.sourceBlockId === b.sourceBlockId → return`) sidestepped that by dropping the observation entirely. The cost (silent loss of the document's sharpest, most-colocated conflicts) far outweighs the benefit (avoiding a cosmetic double-decoration).

The settled floor: **allow the observation, anchor it to the one shared block, and render a single section highlight.** Detection is what matters; the card body already states both conflicting claims, so a phrase-level A↔B highlight is a refinement, not a requirement. The data model stays honest (`conflictingBlockId` = the same block); only the renderer special-cases `conflictingBlockId === blockId` to skip the second decoration.

**Scope honesty — this closes a silent-drop, it does not deepen the hero.** Colocated conflicts (two claims in one block/section) are contradiction-at-_proximity_ — the kind a careful reader can self-catch — not the contradiction-at-_distance_ that is the load-bearing wow (`product-requirements.md` R4.6). The value here is trust-defense: a sweep that silently swallows _any_ conflict it already detected is untrustworthy, and these colocated ones were its sharpest catches in the 2026-06-25 session. Count this as restoring trust in the sweep, not as extending the hero capability — and don't let it crowd out work on at-distance recall, which is where the hero actually lives.

**Deferred (not the floor):** computing real per-claim span offsets from each claim's text within the block, to restore a true two-span intra-block highlight and disambiguate multiple intra-section conflicts. That's the "compute real offsets" option — more code and fragile substring matching; it can layer on later without changing this contract. Couples then with `doc_level_anchoring` (substring resolver reuse).

### OBS-027 — established context as input, not a new call

The fix adds **no API requests** (RPD is the binding free-tier limit): it enriches the _existing_ single section-eval call's user content with artifacts already in memory. The section-eval already injects `definition` claims as a "Defined terms" glossary; OBS-027 generalises that intuition — the false positives come from the model not knowing what _sibling_ sections established, so we hand it exactly that, labelled as established and off-limits for `undefined`/`unclear`/`unsupported` flags.

Two sources, because they cover different reference types:

- **Sibling-section summaries** resolve _prose_ references and term introductions ("this notification pattern" defined narratively in §Solution).
- **Other sections' claims** (the active ledger, all kinds) resolve _assertions_ — so `unsupported_claim` doesn't fire on something a sibling section supports, and `undefined_jargon` doesn't fire on a metric/commitment named elsewhere.

The heading-intent rule is independent prompt-tuning for the secondary facet: a governing header ("Out of scope") already answers the "is this excluded or just missing?" question the model was asking.

**Trade-off (accepted):** this trades a sliver of recall for precision on reference-resolution. Support or definition that lives in _another_ section now suppresses a flag in _this_ one — which is correct at the document level (the doc does establish it), even if the local section reads thin. Genuine gaps (no sibling resolves the reference) still surface, guarded by fixture (c).

### OBS-029 — why the section grain can still go bodyless, and why the guard belongs in the evaluator

`section_as_eval_unit` removed the _per-block_ path where a heading was evaluated alone; it did **not** guarantee that a resolved section always has a body. `resolveSections` opens a new section at **every** heading, so any heading with no following body blocks yields a section whose `combinedText` is just the heading text. That state is reachable several ways: a block-type toggle (the 2026-07-02 trigger), a heading typed before its body, or a body deleted under a heading. The only guard between that payload and the LLM is `cleanText.length < 10` — and a real heading clears it, so the model is asked to "evaluate this section" with nothing but a title and duly invents a plausible section (a fabricated 50 % metric, a Q4 mandate). Because the fabricated claims land in the ledger, the damage compounds into a **paid** contradiction call that surfaces a tension between real and invented text.

The guard belongs in `evaluateSection`, not the resolver: the resolver's job is faithful structure (a bodyless heading _is_ a real, if empty, section — it should still hold a `blockId` and a summary slot), while the evaluator's job is deciding there's nothing to extract. This mirrors the existing `<10` short-circuit exactly — same write-order, same "retire + empty summary + hash" — so it's a one-branch change with no new anchoring or lifecycle surface. It is independent of revert-aware evaluation: even a _sustained_ bodyless heading (not a revert) must be inert.

### Scope boundaries

- OBS-026 touches **only** the strong-tier contradiction/tension sweep consumer + the highlighter/card render of same-block conflicts. It does not change claim extraction or the sweep prompt (the model already returns these correctly).
- OBS-027 touches **only** the fast-tier `evaluateSection` prompt input + `MERGED_SYSTEM_PROMPT`. It does not touch the doc-level strong call (that's `doc_level_anchoring`) or the contradiction check.
- Neither needs a DB migration; both reuse existing fields and artifacts.
- Free tier: OBS-027's context injection applies on both tiers (it's prompt content, not reasoning-gated); OBS-026 is sweep-only and the sweep already runs paid-preferred. Both degrade gracefully on weaker models.
