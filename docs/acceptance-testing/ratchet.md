# Evaluator Quality Ratchet — How to Add a Fixture

The evaluator quality ratchet is a labeled fixture corpus + two-tier scorer that prevents recommendation quality from silently regressing as prompts and pipeline code change.

**Quick reference:**

| Command | What it does |
|---|---|
| `npm test` | Runs Tier 1 (offline, quota-free). The ratchet is included. |
| `npm run eval:record` | Re-record ALL fixture LLM responses from the live model. |
| `EVAL_RECORD_ID=<id> npm run eval:record` | Re-record one fixture only. |
| `EVAL_LIVE=1 npm run eval:live` | Run Tier 2 live scorer (real API, precision/recall scorecard). |

---

## Tier 1 — deterministic replay (default CI)

Replays frozen LLM responses and asserts the pipeline produces exactly the ground-truth `expected` observations.

- Zero network calls, zero quota, runs in under a second.
- Catches breakage in: anchoring, reconciliation, dedup, priority, aggregation, contradiction/tension routing.
- Does NOT catch prompt-quality regressions (the LLM output is frozen).

## Tier 2 — live prompt scorer (opt-in)

Runs real prompts, computes per-type precision/recall, prints a scorecard.

- Requires `VITE_GEMINI_API_KEY` in `.env.local`.
- Soft-asserts aggregate precision ≥ 0.6 and recall ≥ 0.7.
- `knownGaps` (documented known prompt misses/FPs) are reported but not asserted.
- Use this to confirm a prompt fix actually improved accuracy before committing.

---

## Adding a fixture

### 1. Create the fixture file

```ts
// src/services/eval-fixtures/my-new-case.ts
import type { EvalFixture } from "./types";

const fixture: EvalFixture = {
  id: "my-new-case",
  description: "One sentence description",
  stage: "PRD — optional",
  sections: [
    { id: "s1", text: "First section text..." },
    { id: "s2", text: "Second section text..." },   // order matters for ledger
  ],
  recordings: {},   // will be populated by eval:record
  expected: [
    // Add labels AFTER recording so they match what the pipeline actually produces.
    // { type: "contradiction", sectionId: "s2", substring: "Q2" },
  ],
  knownGaps: [
    // Observations the prompt currently misses or fires incorrectly.
    // These are tracked in Tier 2 but don't count against the score.
  ],
};
export default fixture;
```

### 2. Register it in the corpus barrel

Add an import + array entry to `src/services/eval-fixtures/index.ts`.

### 3. Record the LLM responses

```bash
EVAL_RECORD_ID="my-new-case" npm run eval:record
```

This runs the sections against the live model, captures all LLM responses, and writes them into `recordings: { ... }` in the fixture file.

### 4. Label the expected observations

Run the Tier 1 ratchet to see what the pipeline actually produced:

```bash
npx vitest run src/services/evalRatchet.test.ts
```

The test will fail (recall=NaN or 0) and print the produced observations. Copy them into `expected`. Then rerun — it should pass.

**Ground-truth labelling rule:** `expected` should reflect what the pipeline *should* produce from these inputs. If the pipeline produces a correct observation that you didn't expect, add it. If it produces a false positive, add it to `knownGaps` instead and leave it out of `expected`.

### 5. Verify Tier 1 passes

```bash
npm test
```

### 6. Optionally verify Tier 2

```bash
EVAL_LIVE=1 npm run eval:live
```

Check the scorecard and confirm the known-gaps report matches your expectations.

### 7. Commit

Commit the new fixture file + the updated `index.ts`. The recorded responses are committed too — they are the source of truth for the deterministic test.

---

## Re-recording an existing fixture

If you update an evaluator prompt and need the recordings to reflect the new behaviour:

```bash
EVAL_RECORD_ID="my-fixture-id" npm run eval:record
```

Then re-check the `expected` labels (some may now mismatch the new responses). Update `expected` and/or `knownGaps` accordingly, and commit.

**Note:** Re-recording is a deliberate action. The recordings being committed is what makes Tier 1 deterministic — never re-record silently.

---

## Fixture corpus

Current seed cases in `src/services/eval-fixtures/`:

| id | Covers |
|---|---|
| `contradiction-timeline` | Hard contradiction (Q2 vs Q3 commit) — port of the Phase 1 acceptance test |
| `strategic-tension-fraud` | Tradeoff routes to `strategic_tension`, NOT `contradiction` (OBS-004 regression lock) |
| `clarity-vague` | Vague passage fires `clarity`; content-sig dedup collapses duplicate messages |
| `unsupported-vs-attributed` | Genuine `unsupported_claim` fires; attributed claim must NOT fire (OBS-001 tracking) |
| `jargon-allowlist` | Preset terms suppressed; genuinely undefined term fires (OBS-003/005 tracking) |
| `clean-doc` | Clean, specific section → zero observations (false-positive guard) |

Corpus grows over time. The `prompt_quality_observations.md` remediation sprint will add regression cases for each OBS-001…005 fix.
