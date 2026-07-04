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

Once the per-section fast evals have populated the ledger, **one** strong-tier call finds contradicting claim *pairs* across the whole document (all-pairs prompt), instead of N per-section contradiction calls. `handleBootstrapSweep` mirrors `handleDocIdle`: it defers until `inFlightSections` drains (so it sees the full ledger) and under RPM backpressure. The sweep is dirty-checked (separate `${docId}::sweep` state key) and its reconcile is **additive** — it inserts only conflict-pairs not already present and never auto-closes, so it can't duplicate a per-section contradiction or churn on re-run. Anchoring is **whole-block** (`0..9999`) since ledger claims carry no span offsets.

### Threshold discipline (intentional silence — not a gap)

The sweep is gated ≥ 150 words by the editor, so a short pasted draft lights up section-level observations but correctly stays silent on cross-document contradiction — Invariant #4 ("never critique an under-threshold document; silence during idea formation is a feature"), R3.2, `docs/features.md` §"Document checks start only after the document crosses a content threshold". This is by design, not missing coverage.

---

## Document-level triggers (strong tier)

Cross-document checks (missing-topic, stage fit) and contradiction adjudication run at this grain.

### 1. Doc-idle (`doc-idle`)

Source: `onUpdate` in `src/editor/Editor.tsx`

Reset on **every** edit. Fires after **12 s** (`DOC_IDLE_MS`) of silence, **only if** word count ≥ **150** (`CONTENT_THRESHOLD_WORDS`).

### 2. Doc-idle armed after `loadDoc`

Source: `src/editor/Editor.tsx` harness doc-writer

Because `setContent` doesn't reliably fire `onUpdate`, when a seeded doc crosses 150 words the 12 s timer is armed explicitly via a 0 ms timeout (to let any pending `clearContent` effects flush first).

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
| **Doc-idle serialization** | Doc-idle waits if any section eval is in-flight, so a doc-level strong call never overlaps a section's contradiction strong call (OBS-020) |
| **Bootstrap-sweep serialization** | The `block-paste` sweep waits (`pendingBootstrapSweep`) until `inFlightSections` drains, so it runs against the fully-populated ledger |
| **RPM deferral** | Doc-idle *and* the bootstrap sweep are deferred **30 s** (`DOC_IDLE_RPM_DEFER_MS`) if `isNearLimit()` reports free-tier RPM backpressure |

---

## Sub-evaluations inside a single eval

### `evaluateSection` (`src/services/evaluator.ts`)

1. **Hash check** — if section text hash matches the stored summary, skip entirely (idempotent). The hash is the dirty-check key; see step 6 for when it is committed.
2. **Short-circuit (inert section)** — if the section text is < 10 chars **or the section is a bodyless heading** (no non-heading member carries non-empty text — `isHeading` is set per member by `resolveSections`), retire claims/observations and return with an empty summary (no model call). A heading long enough to clear the 10-char guard is still inert: without this, a title-only section (a block-type toggle, a heading typed before its body, a body deleted under a heading) is handed to the model with nothing but a title, and the model **fabricates a whole section** — invented claims that pollute the ledger and drive a paid contradiction call surfacing a garbage tension. This is the OBS-029 fix (a regression of the exact hallucination class `section_as_eval_unit` targeted). Same write-order as step 6: claims + reconcile first, hash last. → see `docs/projects/section_eval_precision.md` (OBS-029).
3. **Merged fast call** — one round-trip: summary + claim extraction + span checks (`clarity`, `unsupported_claim`, `undefined_jargon`). Injects the existing glossary of defined terms and prior active observations so the model can confirm resolutions. Claims are persisted here (the contradiction call reads the ledger); the summary + hash are **not** — they wait for step 6.
4. **Strong contradiction call** — only when there are both new claims *and* existing other-block claims, **and `skipContradiction` is not set** (it is, for bulk paste / import). Prefiltered to the top-10 most semantically relevant ledger claims. Uses a hedged prompt for a weak-capability model, confident prompt for a strong-capability one (`capability.adjudicateConfidently` — see _Model capability_ below).
5. **Reconcile** — `reconcileObservations` writes the new span + contradiction observations and auto-closes unmatched existing ones for the section's member blocks. **Conflict types** (`contradiction`/`strategic_tension`) are deduped by their order-independent `conflictPairKey` — the same identity the ledger sweep uses — so a per-section emission and the sweep's re-emission of the same block pair coalesce into one card (a reworded re-emission keeps the existing record, freezing id + wording and preserving sweep grace state); all other types use the `contentSig`/`spanSig`/overlap path. Before inserting, each candidate is checked against the document's dismissal suppressions (`isSpanSuppressed`): a span observation is suppressed when a prior dismissal shares its `(blockId + normalized anchorText)`; a `contradiction`/`strategic_tension` is suppressed when it shares the dismissed pair's `conflictPairKey`. Both fall back to the offset `spanSignature` for legacy suppressions. Matching by anchor identity (not offsets) means a dismissal **holds across edits that shift offsets**, and a dismissed per-section conflict also suppresses the ledger sweep's whole-block re-emission of the same pair. The G1 gate still applies first: high-severity / `contradiction` / `unsupported_claim` dismissals are span-scoped; lower-severity ones are category-wide. (`lifecycle_integrity` L5a.)
6. **Commit dirty-check hash (last)** — `saveBlockSummary` writes the summary + text hash only after steps 3–5 all succeed. The eval is **atomic**: if the strong call (or anything above) throws, the hash stays unsaved and the next trigger re-runs the whole eval instead of short-circuiting on a stale match. This is the `lifecycle_integrity` L3 fix — writing the hash before the strong call let a routine free-tier rate-limit (`Pool exhausted`) permanently wedge a section, its fast-call observations lost and stale ones never closing, until its text changed.

### `evaluateDocument` (`src/services/evaluator.ts`)

Doc-level judgment calls against the accumulated claim ledger: missing-topic, stage fit, and related cross-document observations. Does **not** do contradiction.

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
- **Decided once at the App boundary** (`App.tsx`), from the key configuration: an env `VITE_GEMINI_PAID_KEY`, or a UI-entered BYO key the user marked "capable" via the `[data-testid="key-tier-toggle"]` checkbox (persisted as `writtten_key_tier`). A strong declaration also promotes the key into the `paidKey` routing slot so `strong()` reaches the paid pool.
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
