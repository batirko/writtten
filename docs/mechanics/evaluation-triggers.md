# Evaluation triggers

> **Keep this current.** If you change timing constants, trigger conditions, orchestrator logic, or evaluator structure, update this file in the same task.

How and when the system decides to evaluate text. Every evaluation flows through `scheduleEval()` in `src/services/orchestrator.ts`. Two grains: **section eval** (fast tier) and **document eval** (strong tier).

---

## Section-level triggers (fast tier, per section)

A *section* is a heading node plus any body blocks that follow it, resolved as a unit. Span checks (`clarity`, `unsupported_claim`, `undefined_jargon`) and claim extraction run at this grain.

### 1. Typing-pause settle (`block-settle-pause`)

Source: `onUpdate` in `src/editor/Editor.tsx`

After **3 s** (`EVAL_DEBOUNCE_MS`) of no typing in the cursor's current section, the timer fires. It only dispatches when **both** gates pass on the live section text:

- terminal punctuation: `/[.!?"]\s*$/`
- combined section text ≥ **15 chars**

The timer is per-section and reset on every keystroke.

### 2. Block-completion settle (`block-settle-completion`)

Source: `onUpdate` in `src/editor/Editor.tsx` (step 3a)

Fires the instant a paragraph is **completed** — pressing Enter after a settled block — rather than waiting out the 3 s pause. Detection: `onUpdate` sees a net gain in top-level block ids (`currentBlockIds.size > prevBlockIds.size`), the signature of an Enter/split (the bulk-paste path returns earlier, so it's excluded). Because pressing Enter keeps the cursor *inside the same section*, the §3 cursor-departure trigger never sees this — this closes that latency gap so a single-heading draft doesn't feel unresponsive (UX-013).

Same two gates as the pause timer, applied to the current section's live `combinedText`, so Invariant #4 still holds (a mid-sentence Enter fails the terminal-punctuation gate and stays silent):

- terminal punctuation: `/[.!?"]\s*$/`
- combined section text ≥ **15 chars**

Dispatched **in parallel** with the pause timer (which is still reset on the same keystroke). The two collapse cheaply: the orchestrator's 250 ms coalesce window merges them into one dispatch when they land close together, and `evaluateSection`'s hash short-circuit no-ops the redundant one otherwise. Pressing Enter on an empty line re-fires the trigger but the section text is unchanged, so the hash short-circuit makes it free.

### 3. Cursor-departure settle (`block-settle-blur`, reason `cursor-departed`)

Source: `onSelectionUpdate` in `src/editor/Editor.tsx`

Fires when the cursor crosses from one section into a different one. Evaluates the section just *left*, if its text is ≥ **10 chars**. Cancels that section's pending pause-timer (departure wins). Typing-then-Enter produces this event, as does *manually pasting one section, moving the cursor, then pasting the next*. A single bulk paste is handled by its own trigger (see §"Bulk paste & import").

> Window-blur (alt-tab) was deliberately removed as a settle trigger — it caused premature evals and 4–6 paid calls per paste (OBS-014, OBS-020).

**All three of the above triggers (§1–§3) are gated by the section-boundary commit debounce below** — while a section is mid-re-sectioning, its dispatch is suppressed.

### Section-boundary commit debounce (revert-aware eval, Mechanism 1)

Source: `onUpdate` step 2d in `src/editor/Editor.tsx`; helpers in `src/editor/section.ts` (`sectionOwnerMap`, `hasStructuralChange`, `changedSectionIds`).

A block-type toggle (paragraph ↔ heading) silently **re-sections** the document: `resolveSections()` re-derives boundaries with *no debounce of its own*, so the toggled block opens a new section that steals the body after it (or, reverted, merges back). With nothing debouncing that boundary change, the next legitimate trigger (§1–§3) evaluates a *transiently* resized section against genuinely-changed text — a real call the hash short-circuit can't catch. A fast toggle→revert previously fired ≈8 fast calls and could leave a stray observation on untouched text (UX-014, `docs/projects/revert_aware_evaluation.md` Mechanism 1).

The fix keeps `resolveSections()` always-live everywhere (anchoring, rendering, and every sub-evaluation are untouched) and layers a **committed** boundary snapshot over *only the eval-trigger dispatch*:

- **Detection.** Each `onUpdate` computes a live owner map (`blockId → owning sectionId`) and compares it to the last **committed** map. A **surviving** block that changed owner signals a re-sectioning (`hasStructuralChange`). This precisely distinguishes a heading toggle from typing or an Enter-split (a new block joins its section; no *survivor* moves) — so §2's block-completion trigger is untouched.
- **Suppress + debounce.** On detection, the affected section ids (`changedSectionIds` — both the shrunk donor and the new heading section) are frozen, and dispatch for them via §1–§3 is skipped. A `structuralTimer` is armed/reset for **`EVAL_DEBOUNCE_MS`** (3 s). The committed map is **not** updated while pending.
- **Revert within the window → zero evals.** If the live structure returns to the committed shape before the timer fires, the timer is cancelled, no synthetic eval runs, and suppression drops. A toggle→revert nets **no** section dispatch.
- **Sustained change → commit + synthetic settle.** If the structure holds for 3 s, the timer commits the new boundaries and fires one `block-settle-pause` per affected section (same terminal-punctuation + ≥15-char gates as §1, so Invariant #4 holds). This is required: nothing else would evaluate a sustained new heading section — the §1–§3 timers were suppressed the whole window.
- **In-flight invalidation (closes Mechanism 2's known gap).** Whenever a re-sectioning is detected *or* reverts, `invalidateSectionEval(id)` (`orchestrator.ts`) is called for each affected section — bumping its `sectionEvalGeneration` so any `evaluateSection` already in flight for a now-stale boundary skips its post-LLM writes (the same L4 machinery `block-removed` uses; §"No-LLM cascade trigger"). Unlike `block-removed` it fires no LLM call and does not orphan claims — the section still exists, only a transient boundary is being unwound; Mechanism 2's snapshot restore handles the observation side.
- **Committed map seeding.** Load-on-mount, `loadDoc`, `importContent`, bulk paste, and clear all accept their resolved boundaries as committed immediately (`commitOwnersNow`) — those paths dispatch their own evals, so no debounce applies and no redundant synthetic settle fires.

### 4. Dev harness `loadDoc` seed (`block-settle-pause`, one per section)

Source: `src/editor/Editor.tsx` harness doc-writer

`window.__sidecar__.loadDoc(...)` fires one `block-settle-pause` per resolved section (≥ 10 chars), exercising the same pipeline as typing. Also explicitly arms the doc-idle timer (see §B2 below).

### 5. Content import (`block-settle-pause`, one per section)

Source: `importContent` effect in `src/editor/Editor.tsx`

When `importContent` is set, after block IDs stabilize (1 tick defer), fires one `block-settle-pause` per section (≥ **15 chars**) with `skipContradiction: true`, plus a `block-paste` sweep when ≥ 150 words (see §"Bulk paste & import"). The doc-idle pass is intentionally *not* armed — it waits for the user's first edit.

---

## Bulk paste & import

A single bulk paste of a whole draft is one selection jump — the cursor lands only in the last section, so the §1/§2 single-section triggers would leave every section above it unevaluated. Two dedicated mechanisms handle it. See `docs/projects/bulk_paste_evaluation.md`.

### Fast-tier section dispatch (`block-settle-pause` per section, `skipContradiction`)

Source: `handlePaste` + the bulk-paste branch of `onUpdate` in `src/editor/Editor.tsx`

`editorProps.handlePaste` sets `pastePendingRef` and returns `false` (ProseMirror inserts normally). The next `onUpdate` sees the flag, defers one tick (block ids assigned), resolves **all** sections, and fires one `block-settle-pause` per section (≥ **15 chars**) with `ctx.skipContradiction = true` — then **returns early** so the normal single-section path doesn't also fire. Re-dispatching every section is safe: `evaluateSection`'s hash short-circuit no-ops unchanged ones.

`skipContradiction` makes each section eval run the fast call only (summary + claims + `clarity` / `unsupported_claim` / `undefined_jargon`) and skip its per-section strong-tier contradiction call — so a 10-section paste fires zero paid calls during this phase. Import uses the same path.

### Bootstrap contradiction sweep (`block-paste` trigger)

Source: queued from `Editor.tsx` (when word count ≥ **150**) → `handleBootstrapSweep` in `src/services/orchestrator.ts` → `evaluateLedgerContradictions` in `src/services/evaluator.ts`

Once the per-section fast evals have populated the ledger, **one** strong-tier call finds contradicting claim *pairs* across the whole document (all-pairs prompt), instead of N per-section contradiction calls. `handleBootstrapSweep` mirrors `handleDocIdle`: it defers until both `inFlightSections` **and** the section-eval **coalesce window** (`coalesceTimers`) drain (so it sees the full ledger) and under RPM backpressure. Waiting on `coalesceTimers` too is load-bearing: on a bulk paste/import the section evals and this sweep are scheduled in the **same tick**, so the sections are still queued in `coalesceTimers` (not yet in `inFlightSections`) when the sweep is scheduled — an `inFlightSections`-only guard would let the sweep run against an empty ledger and surface nothing (the import contradiction-sweep race; guarded by `orchestrator.test.ts`). The sweep is dirty-checked (separate `${docId}::sweep` state key) and its reconcile is **additive** — it inserts only conflict-pairs not already present and never auto-closes, so it can't duplicate a per-section contradiction or churn on re-run. Conflicts anchor to the claim's **precise block + offsets**. At extraction each claim is resolved to the member block that actually contains its text (`anchorClaimsToMembers` → `anchorSubstring` over the section members), stored on the ledger as `anchorBlockId`/`anchorStartOffset`/`anchorEndOffset`. The sweep and the per-section conflicting side use those (`a.anchorBlockId ?? a.sourceBlockId`, etc.) — so a contradiction marks the real clause in the body, **not** the section's representative (heading) block. When the claim text isn't a verbatim substring of any member (the LLM reworded it) it falls back to the section's first **body** block (skipping heading/table members, via `firstBodyMember`), whole-block, marked `anchorExact: false` — **never the heading** (OBS-032), so a reworded conflict still lights the body sentence rather than the section title. This body-block fallback is stored on the ledger, so both the sweep and the per-section conflicting side (`a.anchorBlockId ?? a.sourceBlockId`) inherit it. A dev counter (`anchorExact === false`) logs how often that paraphrase fallback fires. (`sourceBlockId` + whole-block remains the ultimate fallback only if a section has no member at all — unreachable for a claim-bearing section, since a bodyless heading is short-circuited inert before extraction, OBS-029.) At **render** time `reanchorOffset` re-locates the `anchorText` as a safety net against offset drift after edits; if a **real exact anchor**'s text has been edited away entirely (no substring match, and the stored offsets are not the `0:9999` whole-block sentinel) it returns `null` and the highlight is **suppressed** rather than painted at the stale offsets — block ids are stable across edits but offsets are not, so painting them would light an unrelated same-length clause and disagree with the card's own `anchorQuote`/`anchorText` (the observation auto-closes on the next eval/sweep). The reworded whole-block sentinel is exempt and still resolves to whole-block. The sweep's `emit` also drops a self-pair where two distinct claims share the same block **and** normalized text (a duplicate the extractor emitted twice). **Same-block *distinct* conflicts do surface** (OBS-026): two conflicting claims within one section/block are no longer dropped — the observation anchors both sides to the one shared block, and `ObservationHighlighter` skips the degenerate second decoration when `conflictingBlockId === blockId` (a single whole-block highlight, not a self-stacked pair); the card still names both claims. → see `docs/projects/section_eval_precision.md` (OBS-026). (Note: `sourceBlockId` stays the section representative — it remains the section-membership key for filters, orphaning, and dirty-checks; `anchorBlockId` is purely for observation anchoring.) **Former-representative eviction.** A section's representative id is *not* stable — a heading↔paragraph toggle that merges sections, or an intro section's first block shifting, changes which block id represents the same section (e.g. `iNQIEJ9Lwz` → `Rf6RV84Nhx`). Because claims are keyed by `sourceBlockId = representative`, a migration used to leave the old rep's claims stranded as permanently-`active` rows (never overwritten — `saveClaimsForBlock` only clears the exact id it writes — and never orphaned, since the old block still exists so `block-removed` never fires), which then fed the sweep as ghosts. `evaluateSection` now passes the section's current `memberBlockIds` to `saveClaimsForBlock`, which in the **same transaction** orphans any `active` claim filed under a member that is *not* the current representative. This is safe because claims are only ever written under a representative id and `resolveSections` partitions blocks disjointly, so a non-representative member holding claims is always a stale former rep. Covered by `src/store/db.test.ts` (real IndexedDB) and the evaluator revert-aware suite.

### Threshold discipline (intentional silence — not a gap)

The sweep is gated ≥ 150 words by the editor, so a short pasted draft lights up section-level observations but correctly stays silent on cross-document contradiction — Invariant #4 ("never critique an under-threshold document; silence during idea formation is a feature"), R3.2, `docs/features.md` §"Document checks start only after the document crosses a content threshold". This is by design, not missing coverage.

---

## Document-level triggers (strong tier)

Cross-document checks (missing-topic, stage fit) and contradiction adjudication run at this grain.

### 1. Doc-idle (`doc-idle`)

Source: `onUpdate` in `src/editor/Editor.tsx`

Reset on **every** edit. Fires after **12 s** (`DOC_IDLE_MS`) of silence, **only if** the document is mature enough to earn the pass — `getMaturity(editor) !== "nascent"` (R2 UX-013). The maturity proxy (`src/services/documentMaturity.ts`, pure) reads word + top-level-block counts and admits a *structurally-complete short draft* (≥ 4 blocks and ≥ 80 words) that the old raw 150-word cliff would have silenced, while a genuinely half-formed draft stays `nascent` and quiet. The level (`forming` | `mature`) is carried on `EvalContext.maturity` into `evaluateDocument`, where it drives the structural-gap kind/severity/voice (see `docs/projects/maturity_aware_severity.md`). (`CONTENT_THRESHOLD_WORDS` = 150 now gates only the bulk-paste contradiction sweep, §"Bulk paste & import".)

### 2. Doc-idle armed after `loadDoc`

Source: `src/editor/Editor.tsx` harness doc-writer

Because `setContent` doesn't reliably fire `onUpdate`, when a seeded doc is mature enough (same maturity proxy as §1, computed from the seeded blocks) the 12 s timer is armed explicitly via a 0 ms timeout (to let any pending `clearContent` effects flush first), with `maturity` re-read from the live editor at fire time.

### 3. Stage-changed (`stage-changed`)

Source: `src/App.tsx`

When the user edits the stage/context field and it re-settles (**3 s** debounce), the trigger carries the `previousStage` (the last settled value) and branches (UX-012):

- **None → suggested (`previousStage` empty):** the transition is auto-applied (accepting the model's own first stage suggestion) and the content is unchanged, so the wipe is **skipped entirely** and no re-run fires — the existing observations were just graded against this content, and the next natural `doc-idle` reconciles them resolution-aware. No churn.
- **Genuine hand-edited change (`previousStage` non-empty):** routed through `handleDocIdle` (the resolution-aware doc reconciler) rather than a blind supersede — priors injected, still-true critiques kept by id, resolved ones closed, grace period applied.

Guarded with a ref so it doesn't fire on mount. The old behavior (blanket-supersede **every** doc-scope note against the old stage, then regenerate blind) was replaced by UX-012 — see `docs/projects/doc_scope_reconciliation.md` § Decision (UX-012).

---

## No-LLM cascade trigger

### Block-removed (`block-removed`)

Source: `onUpdate` in `src/editor/Editor.tsx`

Fires for every blockId present in the previous snapshot but absent from the current doc. No model call — synchronously orphans the block's claims, deletes its summary, and auto-closes observations anchored to or conflicting with that block.

It also **bumps the section's eval generation** (`sectionEvalGeneration` map in `orchestrator.ts`). If an `evaluateSection` is in flight for that block when it's removed, the generation bump makes the `isLive()` predicate it was handed go false, so the late LLM response skips its post-LLM writes instead of resurrecting `active` claims/summary for a deleted block (the L4 zombie-claim race). The in-flight `fetch` is not cancelled — only its writes are invalidated. See `evaluateSection` steps 4–6.

---

## Orchestrator shaping (between trigger and eval)

Even after a trigger fires, the orchestrator reshapes *when* the actual eval runs:

| Mechanism | Detail |
|---|---|
| **Coalescing** | 250 ms window (`COALESCE_MS`) collapses a near-simultaneous pause+blur double-fire for the same section into one dispatch |
| **Serialization** | If a section is already in-flight, the new trigger is queued (`pendingAfterInflight`) and dispatched as a `rerun` when the in-flight call resolves |
| **Doc-idle serialization** | Doc-idle waits if any section eval is in-flight **or still in the coalesce window**, so a doc-level strong call never overlaps a section's contradiction strong call (OBS-020) |
| **Bootstrap-sweep serialization** | The `block-paste` sweep waits (`pendingBootstrapSweep`) until both `inFlightSections` **and** `coalesceTimers` drain, so it runs against the fully-populated ledger — not the empty one it would see if it fired in the same tick the sections were scheduled (the import contradiction-sweep race) |
| **RPM deferral** | Doc-idle *and* the bootstrap sweep are deferred **30 s** (`DOC_IDLE_RPM_DEFER_MS`) if `isNearLimit()` reports free-tier RPM backpressure |

---

## Sub-evaluations inside a single eval

### `evaluateSection` (`src/services/evaluator.ts`)

1. **Hash check** — if section text hash matches the stored summary, skip entirely (idempotent). The hash is the dirty-check key; see step 6 for when it is committed.
1b. **Revert-aware snapshot restore** (`src/services/evalSnapshot.ts`) — a section's *membership* (which blockIds currently make it up) can transiently resize with no debounce of its own (e.g. a paragraph↔heading toggle silently shrinks/grows a neighboring section), so step 1's hash — keyed to this section's own representative id — can miss even when this exact (membership, text) combination was already evaluated under a *different* representative id. Keyed instead on `snapshotKey(memberBlockIds, textHash)` (order-independent membership + the section's own text hash, ignoring block type), a hit **restores** rather than re-evaluates: reactivates the cached observations by their original id (no new id, no feed flicker), closes any stray active observation on these blocks that isn't part of the restored state (an honest close — `resolved_by_edit`, visible in the archive, not a silent drop), re-saves the cached claims + summary under the *current* representative id, and skips the model call entirely. This is Mechanism 2 of `docs/projects/revert_aware_evaluation.md` (UX-014) — it delivers "a change that is undone costs (near-)nothing," independent of whatever transient calls fired while the edit was still in flight. The snapshot store is in-memory, per-document, bounded (LRU), and cleared on `clearDocumentData` (invariant 5 — no persistence). **Formerly-known gap (now closed):** an in-flight eval for a *still-transient* section whose boundary reverts mid-flight is now invalidated — Mechanism 1's commit debounce calls `invalidateSectionEval(sectionId)` (bumping `sectionEvalGeneration`) whenever a re-sectioning is detected or reverts, so a late write for a stale boundary skips its post-LLM writes just as `block-removed` does. See §"Section-boundary commit debounce".
2. **Short-circuit (inert section)** — if the section text is < 10 chars **or the section is a bodyless heading** (no non-heading member carries non-empty text — `isHeading` is set per member by `resolveSections`), retire claims/observations and return with an empty summary (no model call). A heading long enough to clear the 10-char guard is still inert: without this, a title-only section (a block-type toggle, a heading typed before its body, a body deleted under a heading) is handed to the model with nothing but a title, and the model **fabricates a whole section** — invented claims that pollute the ledger and drive a paid contradiction call surfacing a garbage tension. This is the OBS-029 fix (a regression of the exact hallucination class `section_as_eval_unit` targeted). Same write-order as step 6: claims + reconcile first, hash last. → see `docs/projects/section_eval_precision.md` (OBS-029).
3. **Merged fast call** — one round-trip: summary + claim extraction + span checks (`clarity`, `unsupported_claim`, `undefined_jargon`). Injects the existing glossary of defined terms and prior active observations so the model can confirm resolutions. Also injects an **"Established elsewhere in this document"** context block — sibling-section summaries plus other sections' active claims (all kinds except `definition`, which the glossary already carries) — labelled context-only, so reference-resolving span checks don't false-positive on terms/claims that a _sibling_ section defines or asserts, and a heading-intent rule so items under "Out of scope"/"Non-goals" headings aren't flagged as omissions. The block is **gated on sibling content** (empty for a single-section doc) so single-section request hashes stay stable for mock replay; the instructions ride in the user content, not the static system prompt, for the same reason. This is the OBS-027 fix. → see `docs/projects/section_eval_precision.md` (OBS-027). It also injects a **document-type calibration** block (OBS-023/OBS-028/OBS-036): the free-text stage is classified into a coarse document class (`documentClass.ts`), and on the three non-PRD genres (comms/memo/essay) the block relaxes `unsupported_claim` to hard external-fact assertions only — leaving `contradiction`/`clarity`/`undefined_jargon` untouched. Since OBS-036 the **`unknown`** class (an un-staged doc — the common cold-open case) also emits a *softened* block rather than nothing, so an un-staged non-PRD isn't PRD-graded on the very first pass before the doc-idle inference can set a stage; **only `prd_spec` now emits an empty, hash-stable block**. `evaluateDocument` injects the parallel doc-tier block that relaxes `missing_topic`/`structure_flow` (also for `unknown`). → see `docs/projects/document_type_calibration.md`. When **no stage is set**, the fast call is also asked — via a user-content instruction, mirroring how `resolved_prior` rides user content rather than the static system prompt — to return a **`suggested_stage`** guess (document type + audience), confidence-gated in the prompt ("confidently infer … otherwise null" — the doc-tier prompt's long-standing wording; a stricter "unmistakable-or-null" bar was tried 2026-07-12 and reverted 2026-07-13 after live probes showed the weak fast-tier model returning `null` even for an unambiguous proposal paragraph). This is what classifies a **single-section (e.g. headingless) doc at all**: such a doc never clears `evaluateDocument`'s ≥2-summaries gate, so the doc-idle inference never runs for it and it used to stay `unknown`-calibrated forever; it also gives every un-staged doc its suggestion at the **first settle** instead of waiting out doc-idle (OBS-036 facet 1). Gated on `!stage` so staged request hashes stay byte-identical for mock replay; the parsed value is surfaced through `EvalContext.onStageSuggestion` → the `DocumentContext` confirm chip (same guards as `evaluateDocument`'s handling; the doc-tier ask remains for ≥2-section docs). The App **damps dismissals**: because the ask re-fires on every settle while un-staged, a declined suggestion is not re-offered verbatim — the chip returns only when the guess actually changes (normalized compare, session-scoped; `handleStageSuggestion` / `dismissedStageSuggestionRef` in `App.tsx`). Claims are persisted here (the contradiction call reads the ledger); the summary + hash are **not** — they wait for step 6.
4. **Strong contradiction call** — only when there are both new claims *and* candidate ledger claims to compare, **and `skipContradiction` is not set** (it is, for bulk paste / import). The candidate pool is every **other section's** claims (from the ledger), **plus this section's own claims when the section has ≥2 of them** — so an intra-section contradiction (two conflicting claims typed under one heading-less section, keyed under the same representative id) is caught while typing, not only via the paste sweep. This is mechanism A (`docs/projects/contradiction_coverage.md`, OBS-033/UX-018); folding the section's own claims in **only** at ≥2 claims keeps single-claim sections' request hashes (and their recordings) byte-identical, since a lone claim can't self-contradict. The same-section half comes from the **in-memory `extractedClaims`**, not a re-read of the ledger: `saveClaimsForBlock` runs just above, but on the first settle its rows aren't reliably visible to an immediately-following `loadActiveClaimsForDocument` (IndexedDB read-after-write, even past `await tx.done`), which made the intra-section contradiction fire only on a _later_ settle — flaky on the type-it-once path. `extractedClaims` is a local in the same call, guaranteed present, and carries identical text/kind/anchor offsets so the prompt+hash are unchanged. A claim compared against its own freshly-persisted copy is a self-pair (identical normalized text) and is dropped at emit — the same guard the sweep applies — and the A×B / B×A directions coalesce via `conflictPairKey`. Because this per-section check is **not** maturity/word-count gated (only the sweep is), it also closes the intra-section facet of UX-016 (a short blatantly-contradictory draft surfaces a `contradiction` immediately). Prefiltered to the top-10 most semantically relevant ledger claims. Uses a hedged prompt for a weak-capability model, confident prompt for a strong-capability one (`capability.adjudicateConfidently` — see _Model capability_ below).
5. **Reconcile** — `reconcileObservations` writes the new span + contradiction observations and auto-closes unmatched existing ones for the section's member blocks. **Conflict types** (`contradiction`/`strategic_tension`) are deduped by their order-independent `conflictPairKey` — the same identity the ledger sweep uses — so a per-section emission and the sweep's re-emission of the same block pair coalesce into one card (a reworded re-emission keeps the existing record, freezing id + wording and preserving sweep grace state); all other types use the `contentSig`/`spanSig`/overlap path. **Cross-type precedence:** a `contradiction` outranks a `strategic_tension` on the same block pair (the same conflict, more sharply stated) — keyed by the type-agnostic `blockPairKey` — so an incoming tension on a pair already carrying a contradiction is dropped, and `reconcileSweepContradictions` supersedes an existing tension a contradiction now covers. Before inserting, each candidate is checked against the document's dismissal suppressions (`isSpanSuppressed`): a span observation is suppressed when a prior dismissal shares its `(blockId + normalized anchorText)`; a `contradiction`/`strategic_tension` is suppressed when it shares the dismissed pair's `conflictPairKey`. Both fall back to the offset `spanSignature` for legacy suppressions. Matching by anchor identity (not offsets) means a dismissal **holds across edits that shift offsets**, and a dismissed per-section conflict also suppresses the ledger sweep's whole-block re-emission of the same pair. The G1 gate still applies first: high-severity / `contradiction` / `unsupported_claim` dismissals are span-scoped; lower-severity ones are category-wide. (`lifecycle_integrity` L5a.)
6. **Commit dirty-check hash (last)** — `saveBlockSummary` writes the summary + text hash only after steps 3–5 all succeed. The eval is **atomic**: if the strong call (or anything above) throws, the hash stays unsaved and the next trigger re-runs the whole eval instead of short-circuiting on a stale match. This is the `lifecycle_integrity` L3 fix — writing the hash before the strong call let a routine free-tier rate-limit (`Pool exhausted`) permanently wedge a section, its fast-call observations lost and stale ones never closing, until its text changed.

### `evaluateDocument` (`src/services/evaluator.ts`)

Doc-level judgment calls against the accumulated claim ledger: missing-topic, stage fit, and related cross-document observations. Does **not** do contradiction.

**Tier 1 materiality floor (R3.3, shipped 2026-07-17).** The `docStateHash` dirty-check folds in every summary's **text hash**, so any text change in any section re-earned a strong-tier call at the next 12s idle — roughly one strong call per long pause for a contemplative writer, against the binding ~20-RPD free-tier budget, even when the delta (a reworded sentence) can't change a `missing_topic`/`structure_flow` conclusion. A **materiality floor** (`src/services/docPassMateriality.ts`, pure — no DB/LLM) now sits **directly behind** that hash check: the byte-exact hash still short-circuits "nothing changed at all"; when the hash *did* change, the floor asks whether the change could matter before spending the call. It compares a `DocPassSnapshot` of the last **executed** pass (stage · maturity · sectionCount · ordered heading texts · per-block **normalized summary content** · sorted claim signatures) against the current idle's inputs, and runs the pass iff any of five clauses holds: **(1)** a claim added/removed/reworded-past-normalization, **(2)** section count or ordered headings differ, **(3)** a maturity edge, **(4)** a stage change, or **(5)** ≥ `SUMMARY_DELTA_FLOOR` (=2) blocks whose normalized summary *content* changed — so reword-only churn that doesn't change what a section *says* is absorbed for free. Accumulation is **structural**: the snapshot is written only when a pass actually runs, so every idle diffs against the last executed pass and small edits across sections add up; a sub-floor idle bumps `subFloorDirtyStreak` and **leaves `docStateHash` unwritten** (the doc stays hash-dirty so the next idle re-asks), and at `SUBFLOOR_FLUSH_STREAK` (=4) the pass runs anyway (reason `"flush"`) so a slowly-rewritten doc can never dead-end (which would re-open the UX-016 staleness in a new costume, and would slow doc-scope grace-closure). The snapshot rides the existing string-KV doc-eval-state store as JSON under **`${docId}::floor`** (no schema bump; cleared alongside `${docId}` / `${docId}::sweep`). The floor is entirely **before prompt assembly** and only ever *suppresses* — a pass that fires builds the identical prompt, so multi-section request hashes stay byte-identical and mock-replay/ratchet fixtures are unaffected. Heading texts come from the persisted `DocumentRecord.content` already loaded for OBS-035 ordering (non-persisted demo → `[]`, harmless — the demo never re-fires the floor). Constants ship **provisional**, V1-recalibrated (a separate Todo). Dev observability: a suppressed pass emits a harness `settle` event `{ trigger: "doc-idle-subfloor", reasons }`, so a scripted session can count the strong calls saved directly via `getApiStats()`. Tier 2 (arm off section-eval-completion state edges) is a separate decide-with-owner item, not built here. → see `docs/projects/trigger_rederivation.md` § Tier 1.

**Single-section docs earn the pass too (heading-cliff facet 3, shipped 2026-07-14).** The `meaningful.length < 2` summaries gate was written 2026-06-02 (per-*block* summaries — a content threshold); section-as-eval-unit re-based summaries to one-per-section a day later, silently turning it into a *heading requirement* that starved headingless docs of every doc-level check while the maturity proxy (paragraph-counting) armed doc-idle anyway. Now: at doc-idle fire time the editor resolves sections and, when the doc is exactly **one** section, threads its `combinedText` via `EvalContext.singleSectionText` → orchestrator → `evaluateDocument`. With one meaningful summary + supplied text, the pass runs with the **raw text inlined in place of the Block Summaries list**, framed as "The document is a single unbroken section (no headings). Full text: …" — so `structure_flow` judges internal consistency rather than hallucinating section ordering. Everything else (stage line, calibration block, maturity voice, claim ledger, `suggested_stage` ask, priors, reconciliation, dirty-check) is unchanged; the docStateHash already tracks the section's text hash, so edits re-fire and unchanged docs skip. Multi-section docs are byte-identical to before. Framing + quality validated by a live probe (2026-07-14): register-lint-clean, doc-scope observations at both tiers (free 2 / paid 5), including catching a planted cross-paragraph timeline conflict.

**Prompt input ordering (OBS-035).** The dirty-check hash sorts the block summaries and claims **alphabetically** (for a session-stable request hash the doc-level pass can be dirty-checked and mock-replayed). That hash order must **not** double as the model's positional `[1] … [2] …` input — feeding an alphabetised list made `structure_flow`/ordering observations reason over a scrambled sequence (the model correctly called "solution before problem" on an alphabetised doc). So the `Block Summaries` / `Claim Ledger` prompt sections are rebuilt from a **document-ordered** view: `evaluateDocument` reads the persisted `DocumentRecord.content` (TipTap JSON) via `loadDocument`, ranks summaries by their block's reading-order position and claims by their `sourceBlockId`'s position (stable secondary = the alphabetical order, so it stays deterministic), while the hash keeps using the alphabetical order. A block absent from the persisted content sorts to the tail (graceful degrade to the prior alphabetical order). Note: the keyless **demo** loads the example via `setContent(html, emitUpdate:false)`, so its document is never persisted (`documents` store empty) and its doc-scan uses the alphabetical fallback — harmless there (the curated demo has no `structure_flow` card). A real typing session persists the doc (onUpdate → debounced `saveDocument`, well before doc-idle), so it gets reading order. → see OBS-035.

**No internal-index / `§N` leak into copy (OBS-034).** `DOC_LEVEL_SYSTEM_PROMPT` forbids naming a summary/claim by its `[N]` bookkeeping index (quote/restate the author's words instead) and inventing `§N` section numbers the document doesn't use — mirroring the anti-index rule the four contradiction prompts already carry. Backstopped by the `registerLint` `claim-index` + `section-number` rules, now applied to the doc-level observation types (`registerLint.test.ts`). → see OBS-034.

The regenerated document-scope set is reconciled by `reconcileDocumentObservations` (three-pass, Tier 1 + Tier 2). Tier 1 is active for every model; Tier 2 resolution-aware passes require a **strong-capability** model (`capability.driveResolution` — see _Model capability_ below).

**Pass 0-pre — model-confirmed resolutions (paid, Tier 2).**
For a strong-capability model, the prior active doc-scope observations are listed (with 0-based indices) in the `evaluateDocument` user prompt alongside the regenerated observations. The model declares `resolved_prior: [i…]` for priors it judges no longer applicable, and `priorId: i` on any returned item that continues a listed prior. `resolved_prior` indices are mapped to existing ids and force-closed as `auto_closed` (archive reason `resolved_prior`) before the other passes run. This mirrors section-eval's `resolved_prior` handling.

**Pass 1 — model-confirmed persists (paid, Tier 2).**
Items with a valid `priorId` (not also resolved) are mapped to the existing obs id and added to `persistIds`. The existing card is kept (`saveObservation` with `missCount: 0, lastSeenAt: now`) — id and wording frozen. The item is **not** added to `newObs`, so the lexical pass never sees it and cannot insert a duplicate. This is the fix for the D1 accumulation problem: rephrasings of the same note map to the same card instead of spawning a second one.

**Pass 2 — lexical best-match fallback (all tiers).**
Runs over the remaining unmatched existing notes vs the `newObs` that had no `priorId` mapping (for a weak-capability model: all of them). Within each observation `type`, each incoming note is paired to the *most similar* existing note (lexical Jaccard ≥ `DOC_DEDUPE_FLOOR = 0.6`, greedy by descending score, each side used once). Incoming-vs-incoming near-duplicates collapse first. Matched notes keep their existing record and id (wording frozen, no flicker). Unmatched incoming → insert active. Unmatched existing → orphan, grace period applied (`DOC_GRACE_THRESHOLD = 2` consecutive misses before `auto_closed`). A re-match at any pass resets `missCount` to 0.

**Honest labels.** Doc-scope never emits a positional `superseded`; closures are `auto_closed` (grace-expired staleness) or `resolved_prior` (model-confirmed addressed). `supersededBy` never carries false cross-note links. State: `missCount` / `lastSeenAt` on `Observation` (DB v7).

This is doc-scope only. Block-scope `reconcileObservations` (span + text + `resolved_prior`) is unchanged. Since UX-012 the `stage-changed` path also uses this resolution-aware reconciler for genuine stage changes (and skips the wipe on the none→suggested transition) rather than the old wholesale supersede. See `docs/projects/doc_scope_reconciliation.md`.

### `evaluateLedgerContradictions` (`src/services/evaluator.ts`)

The bootstrap sweep (`block-paste` trigger). One strong-tier all-pairs call over the full ledger; emits `contradiction` / `strategic_tension` observations anchored whole-block to each claim's source. Dirty-checked (`${docId}::sweep`).

Reconciliation is gated by model capability (`capability.driveResolution`):

- **Weak-capability model:** additive only — inserts new conflict-pairs not already present, never closes existing ones. Safe to re-run; existing per-section contradictions are not disturbed. (A weak model could drop a real conflict on a stochastic miss, so it is not trusted to drive closures.)
- **Strong-capability model:** authoritative-with-grace (`reconcileSweepContradictions`). The sweep output is treated as the full conflict authority. Each existing active `contradiction` / `strategic_tension` observation is checked against the new set by `conflictPairKey` (`${type}::${lo}|${hi}`, order-independent block-pair). Re-emitted pairs have their `missCount` reset to 0. Absent pairs age out: `missCount` is bumped; once it reaches `DOC_GRACE_THRESHOLD = 2` consecutive missed sweeps the obs is `auto_closed`. This makes stale conflict notes close when the underlying claims change, without being brittle to a single stochastic omission (the grace guardrail). State is `missCount` / `lastSeenAt` on `Observation` (DB v7, same fields as doc-scope grace). New conflict-pairs not already covered are inserted active.

---

## Model capability (decoupled from the credential)

Several evaluator behaviours are calibrated to how strong the model is — confident vs hedged adjudication prompts, and whether the model is trusted to drive resolution-aware reconciliation (doc-scope `priorId`/`resolved_prior` mapping; authoritative-with-grace ledger sweep). These branch on a `ModelCapability` (`src/model/capability.ts`), **not** on `paidKey` presence.

- **`ModelTier`** = `"weak" | "strong"`; **`ModelCapability`** = `{ tier, adjudicateConfidently, driveResolution }`. Both flags track `strong` today but are separate fields so policy can diverge per-flag later.
- **Decided once at the App boundary** (`App.tsx`), from the key configuration. The `paidKey` routing slot (which `strong()` reaches) resolves in priority order: an env `VITE_GEMINI_PAID_KEY`, else a **UI paid key** (the optional second Gemini field, `writtten_gemini_paid_key`), else a free-field key whose tier **auto-detected** as paid (`ping.ts → detectGeminiTier` probes `gemini-2.5-pro`; persisted as `writtten_key_tier`). Any of the three makes capability `strong`. The free field feeds the free pool; if only a paid key is set it feeds both slots (one key does everything, billed). The two-field free+paid setup (shipped 2026-07-07) simply surfaces the free→paid fallback `rotation.ts` already runs. (Paid providers — OpenAI/Anthropic — are always strong capability.) The manual "capable model" checkbox was removed 2026-07-07 in favor of auto-detection.
- **Threaded** via `EvalContext.capability` → `evaluateSection` / `evaluateDocument` / `evaluateLedgerContradictions` → `reconcileSweepContradictions`. The evaluator never inspects a raw key string to guess capability (a key string is opaque). Default when unspecified: `WEAK_CAPABILITY` (the conservative floor).

The credential (`paidKey`) remains a pure routing/quota concern in the model router. See `docs/projects/byok_capability_model.md`.

---

## Timing constants (all in `src/editor/Editor.tsx`)

| Constant | Value | Purpose |
|---|---|---|
| `EVAL_DEBOUNCE_MS` | 3 000 ms | Typing-pause settle |
| `DOC_IDLE_MS` | 12 000 ms | Doc-idle trigger delay |
| `CONTENT_THRESHOLD_WORDS` | 150 | Min words before doc-idle arms |
| `COALESCE_MS` | 250 ms | Orchestrator double-fire window |
| `DOC_IDLE_RPM_DEFER_MS` | 30 000 ms | RPM backpressure deferral |
