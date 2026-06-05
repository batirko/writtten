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

### 2. Cursor-departure settle (`block-settle-blur`, reason `cursor-departed`)

Source: `onSelectionUpdate` in `src/editor/Editor.tsx`

Fires when the cursor crosses from one section into a different one. Evaluates the section just *left*, if its text is ≥ **10 chars**. Cancels that section's pending pause-timer (departure wins). Typing-then-Enter produces this event, as does *manually pasting one section, moving the cursor, then pasting the next*. A single bulk paste does **not** (see §"Paste — current gap").

> Window-blur (alt-tab) was deliberately removed as a settle trigger — it caused premature evals and 4–6 paid calls per paste (OBS-014, OBS-020).

### 3. Dev harness `loadDoc` seed (`block-settle-pause`, one per section)

Source: `src/editor/Editor.tsx` harness doc-writer

`window.__sidecar__.loadDoc(...)` fires one `block-settle-pause` per resolved section (≥ 10 chars), exercising the same pipeline as typing. Also explicitly arms the doc-idle timer (see §B2 below).

### 4. Content import (`block-settle-pause`, one per section)

Source: `importContent` effect in `src/editor/Editor.tsx`

When `importContent` is set, after block IDs stabilize (1 tick defer), fires one `block-settle-pause` per section (≥ **15 chars**). The doc-idle pass is intentionally *not* armed — it waits for the user's first edit.

---

## Paste — current gap

⚠️ **A single bulk paste of multi-section text does not fire section-level evaluation.** This is a known gap, not intended behaviour.

When a user pastes a whole draft (e.g. a full PRD copied from elsewhere), here is what actually happens:

- **The middle sections get nothing.** `onUpdate` arms a pause-timer only for the cursor's *current* section, and a paste lands the cursor at the end of the blob — so only the **last** section is even a candidate. Every section above it is never scheduled.
- **The last section usually won't settle either.** It must end in terminal punctuation (`/[.!?"]\s*$/`) and be ≥ 15 chars. Drafts frequently end on a bare token (`Release: Week 6`), so the gate fails.
- **Cursor-departure never fires.** A bulk paste is one selection jump, not a sweep across sections, so the §2 departure trigger doesn't see each pasted section.

**Net effect:** pasting a multi-section document produces zero section-level observations (clarity / unsupported_claim / jargon) until the user starts editing.

### What is *not* part of this gap (intentional, do not "fix")

- **Document-level checks staying silent below 150 words is by design.** The content threshold gating cross-document contradiction and missing-topic is a load-bearing product principle — Invariant #4 ("never critique an under-threshold document; silence during idea formation is a feature"), R3.2, `docs/features.md` §"Document checks start only after the document crosses a content threshold". A short pasted draft *should* light up section-level observations but *should not* surface cross-document contradiction until it grows past the threshold.

### Design context

The `section_as_eval_unit.md` design doc (status `done`) explicitly concluded "no special paste mode is needed" — but on the assumption that users paste *section by section, moving the cursor between pastes*. That assumption fails for a single bulk paste, which is the more common gesture. The conclusion is a blind spot, not a deliberate decision against bulk-paste eval. The intended model is architecture.md's **bootstrap pass** — first threshold crossing builds the outline/summary/ledger.

### Aligned fix (when implemented)

A `block-paste` trigger kind exists for exactly this case but is an unimplemented **Phase 3 stub** — `scheduleEval` currently no-ops it (`orchestrator.ts`). The aligned fix dispatches **fast-tier** section evals per pasted section (as `loadDoc`/import already do), independent of cursor position and the terminal-punctuation gate — and **defers the strong-tier contradiction call to the single doc-idle pass** rather than firing one per section, to avoid the paid-tier burst the R1 remediation (OBS-014/OBS-020) fought.

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

When the user edits the stage/context field and it re-settles (**3 s** debounce), all active document-scoped observations are superseded (graded against the old stage) and doc-level checks re-run. Guarded with a ref so it doesn't fire on mount.

---

## No-LLM cascade trigger

### Block-removed (`block-removed`)

Source: `onUpdate` in `src/editor/Editor.tsx`

Fires for every blockId present in the previous snapshot but absent from the current doc. No model call — synchronously orphans the block's claims, deletes its summary, and auto-closes observations anchored to or conflicting with that block.

> `block-paste` exists as a trigger kind but is a Phase 3 stub; `scheduleEval` currently no-ops it. Pasted blocks settle via the normal pause/departure paths.

---

## Orchestrator shaping (between trigger and eval)

Even after a trigger fires, the orchestrator reshapes *when* the actual eval runs:

| Mechanism | Detail |
|---|---|
| **Coalescing** | 250 ms window (`COALESCE_MS`) collapses a near-simultaneous pause+blur double-fire for the same section into one dispatch |
| **Serialization** | If a section is already in-flight, the new trigger is queued (`pendingAfterInflight`) and dispatched as a `rerun` when the in-flight call resolves |
| **Doc-idle serialization** | Doc-idle waits if any section eval is in-flight, so a doc-level strong call never overlaps a section's contradiction strong call (OBS-020) |
| **RPM deferral** | Doc-idle is deferred **30 s** (`DOC_IDLE_RPM_DEFER_MS`) if `isNearLimit()` reports free-tier RPM backpressure |

---

## Sub-evaluations inside a single eval

### `evaluateSection` (`src/services/evaluator.ts`)

1. **Hash check** — if section text hash matches the stored summary, skip entirely (idempotent).
2. **Short-circuit** — if text < 10 chars, retire claims/observations and return (no model call).
3. **Merged fast call** — one round-trip: summary + claim extraction + span checks (`clarity`, `unsupported_claim`, `undefined_jargon`). Injects the existing glossary of defined terms and prior active observations so the model can confirm resolutions.
4. **Strong contradiction call** — only when there are both new claims *and* existing other-block claims. Prefiltered to the top-10 most semantically relevant ledger claims. Uses a hedged prompt on free tier, confident prompt on paid-key tier.

### `evaluateDocument` (`src/services/evaluator.ts`)

Doc-level judgment calls against the accumulated claim ledger: missing-topic, stage fit, and related cross-document observations.

---

## Timing constants (all in `src/editor/Editor.tsx`)

| Constant | Value | Purpose |
|---|---|---|
| `EVAL_DEBOUNCE_MS` | 3 000 ms | Typing-pause settle |
| `DOC_IDLE_MS` | 12 000 ms | Doc-idle trigger delay |
| `CONTENT_THRESHOLD_WORDS` | 150 | Min words before doc-idle arms |
| `COALESCE_MS` | 250 ms | Orchestrator double-fire window |
| `DOC_IDLE_RPM_DEFER_MS` | 30 000 ms | RPM backpressure deferral |
