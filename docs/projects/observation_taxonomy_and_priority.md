---
status: in-progress
kind: quality
phases: [4, 9]
summary: Extend the observation model with three structured axes (kind, severity, confidence → priority), close the decision-rigor gap in the type taxonomy, add a reflection/mirror kind, and wire a budget-based noisiness model into the feed.
---

# Observation Taxonomy and Priority

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Phase scope (reprioritized 2026-06-03):** split across two phases. Milestones **A · B · E** (priority axes → priority function → budget/calm feed) are **Phase 4 — the current core-experience target**, because a calm, priority-ranked feed _is_ the core recommendation experience. Milestones **C** (decision-rigor taxonomy, research-gated) and **D** (reflection kind) are **Phase 9 (post-traction)**. Do Milestone A first; everything else depends on it.

Read alongside:

- `docs/features.md` (current type taxonomy and lifecycle states — this doc extends both).
- `docs/architecture.md` (claim ledger, model router — both are inputs to the priority function).
- `docs/projects/message_generation_workflow.md` (feed lifecycle — Milestone E modifies the sort/display contract defined there).
- `docs/projects/evaluation_signal_quality.md` (§Open questions: "Suggestions vs warnings" and "Confidence/importance badge" — both are resolved by this design).

---

## Phased Plan

Five milestones with a strict dependency spine, now split across Phase 4 (A·B·E) and Phase 9 (C·D):

**A → B → E** (sequential — each depends on the previous).  
**C** and **D** hang off A and can proceed in parallel with B and each other.

| Milestone | Name                                  | Dependencies | Notes                                            |
| --------- | ------------------------------------- | ------------ | ------------------------------------------------ |
| **A**     | Metadata axes in the data model       | none         | Foundation; ships invisibly (no UX change)       |
| **B**     | Priority as a pure, testable function | A            | New `priority.ts` module; fully unit-testable    |
| **C**     | Decision-rigor taxonomy gap           | A            | Research-gated; requires corpus validation first |
| **D**     | Reflection kind (document mirror)     | A            | Client-side only; zero new LLM calls             |
| **E**     | Feed: budget model + noisiness        | B, D         | UX work; the noisiness slider is the last piece  |

---

## Todo

### Milestone A — Metadata axes

- [ ] In `src/store/db.ts`: rename `nature: "defect" | "opportunity"` → `kind: "problem" | "opportunity" | "reflection"`. Old `defect` → `problem`. No existing `"opportunity"` values change.
- [ ] Add three fields to `Observation`: `severity: "low" | "medium" | "high"`, `confidence: "low" | "medium" | "high"`, `priority: number` (computed sort key; higher = more urgent).
- [ ] Bump the IndexedDB version; write a migration that backfills all existing records: map old `nature` to `kind`, set `severity` and `confidence` to `"medium"` as neutral defaults, compute initial `priority` via the type-prior table (see §Priority function below).
- [ ] In `src/services/evaluator.ts`: update the two `nature: "defect"` literals and all `addDocObs` calls to use `kind:`; stamp `severity` and `confidence` on each new observation at write time.
- [ ] In `src/sidecar/SidecarFeed.tsx`: remove the `observation-${obs.type}` nature-implicit styling; read `kind` explicitly for any kind-dependent UI. (No feed behaviour change yet — that is Milestone E.)

### Milestone B — Priority function

- [x] Create `src/services/priority.ts` exporting a pure `computePriority(obs: ObservationInput, claimKind?: ClaimKind): number` function.
- [x] Implement the type-prior table (see §Priority function). No LLM calls; no async.
- [x] Apply structural escalation rules: contradiction between two `commitment` claims escalates severity before computing priority. Claim kind is available in the ledger at observation write time.
- [x] Formalize confidence at generation time: contradiction produced by the free-tier hedged prompt → `confidence: "low"`; paid-key confident prompt → `confidence: "high"`. Optionally add an optional `confidence` field to the JSON schema the model returns for future types.
- [x] Unit tests covering the full type-prior table plus escalation cases. Tests live in `src/services/priority.test.ts`.
- [x] Wire `computePriority` into the observation write path in `src/services/evaluator.ts` so every new or updated observation carries a correct `priority` at the moment it enters IndexedDB.

### Milestone C — Decision-rigor taxonomy gap

- [ ] **Validate before writing prompts.** Assemble 15–20 real PRD / decision docs. Run the tool (record/replay harness — quota-free). Separately, run a strong model over each doc and collect all margin notes it would write. Categorize the residual notes that map to no existing type. The residual pile is the empirical candidate list. Adjust the candidates below based on findings.
- [ ] Candidate types to add (per brainstorm; confirm against corpus residual):
  - `unstated_assumption` — a claim resting on a premise never made explicit. Scope: span. Kind: `problem`. Distinct from `unsupported_claim` (which is about external facts; this is about an internal load-bearing belief). Example: "Users will prefer push notifications" — implicitly assumes users have push enabled.
  - `alternatives_not_considered` — a direction is asserted but competing options are never mentioned. Scope: document. Kind: `opportunity`. Stage-dependent: early drafts are exempt.
  - `unmeasurable_criteria` — a stated goal with no metric, or a metric with no target/timeframe. Scope: span. Kind: `problem`. Complement to the existing `unsupported_claim` carve-out for success targets — the carve-out protects _set_ targets; this flags targets that have not been set.
  - `scope_ambiguity` — what is in/out is undefined or contradicted. Scope: document. Kind: `problem`.
  - `ownerless_commitment` — a `commitment`-kind claim with no named owner or timeframe. Scope: span. Kind: `problem`. Signal is already in the ledger (`kind: "commitment"` claims) — may be derivable client-side without a new LLM call.
- [ ] For each confirmed type: add enum value to `Observation["type"]` in `src/store/db.ts`; add prompt section to the appropriate call (merged fast or doc-level); set `kind`, `scope`, and type-prior severity in `computePriority`.
- [ ] **Watch for prompt-bloat.** The merged fast call already returns five outputs. Bolting on three more span checks will degrade recall on flash-lite. Measure recall before/after on the corpus. If recall degrades, split into a second fast call for the decision-rigor cluster, or route document-scoped types (`alternatives_not_considered`, `scope_ambiguity`) to the doc-level strong call where they fit better anyway.
- [ ] Update `docs/features.md` with the new types once confirmed.

### Milestone D — Reflection kind (document mirror)

- [ ] Create `src/services/reflections.ts`: a pure, synchronous function that reads the in-memory ledger and block summaries and produces `reflection` observations. Zero LLM calls.
- [ ] Initial reflection types (derive from ledger; no new ML):
  - Commitment accounting: "X commitments in this doc; Y have no named date."
  - Term-usage: "You define '{term}' here and use it N times in later sections."
  - Claim-kind distribution: summary of how many commitments, facts, constraints, metrics the doc contains.
  - Tone-shift flag (defer — requires per-section tone model; not derivable from the ledger alone).
- [ ] Reflections do not enter the main `observations` IDB store. They are ephemeral, recomputed on every relevant ledger change, and held in React state only.
- [ ] In `src/sidecar/SidecarFeed.tsx`: render reflections in a **distinct, quiet panel** below the active observations — not interleaved. Default collapsed; user expands. Distinct visual treatment (muted, non-alert).
- [ ] Reflections are never dismissable (they are facts, not flags) and never suppressed. No changes to `DismissalSuppression`.
- [ ] `data-testid="reflections-panel"` · `data-testid="reflection-entry"`.

### Milestone E — Feed: budget model + noisiness

- [x] In `src/sidecar/SidecarFeed.tsx`: sort active observations by `priority` (descending) instead of arrival order. _(Budget-select by priority; display in document-order — see `src/sidecar/feedBudget.ts`.)_ **Revised 2026-07-02 (UX-015):** pure document-order display buried high-priority doc-scoped observations at the bottom; display is moving to a priority _blend_ (priority bands, document-order within each band). → see `docs/logs/ux_quality_observations.md` (UX-015), `docs/projects/message_generation_workflow.md` §8, `docs/plan.md` Phase 6.
- [x] Implement a **budget model** (not a threshold): show the top-N observations by priority; the rest move into an "also noticed" drawer (collapsed by default). Initial N = 7 (tune after dogfooding). The drawer keeps everything visible on demand without the feed becoming a wall.
- [x] Kind floors and ceilings on the budget:
  - [x] `contradiction` observations always surface regardless of N (floor = show even if outside top-N, unless dismissed). _(Open: the floor has no **ceiling** — a doc with many contradictions surfaces them all, which the **discomfort budget** (R6.3) warns is demoralizing. Whether to cap floored items is owned by `docs/projects/philosophy_guardrails.md` (G4), not here.)_
  - [x] `reflection` observations are never shown in the main feed count — they live in the reflections panel (Milestone D). They do not consume budget slots.
  - [ ] `opportunity` observations can be toggled off without affecting `problem` observations. _(Part of noisiness control — deferred.)_
- [ ] Add a **noisiness control** — a discrete three-step switch (not a slider). _(Was deferred to dogfood the default N=7 first; now build-ready and **pulled into Phase 6** as the single conceded control of the Smart-feed-vs-manual-control milestone — see `docs/projects/smart_feed_curation.md` (R2c). Spec below is executable as-is.)_

  **Build spec (🟢 ready):**
  - [ ] Define the mode → partition-config map next to `partitionFeed` in `src/sidecar/feedBudget.ts`:
    ```ts
    export type Noisiness = "key" | "balanced" | "everything";
    // Maps a mode to the budget + the kinds eligible for the visible set.
    export const NOISINESS: Record<Noisiness, { budget: number; kinds: Observation["kind"][] }> = {
      key: { budget: 5, kinds: ["problem"] }, // problems/contradictions only
      balanced: { budget: 7, kinds: ["problem", "opportunity"] }, // current default
      everything: { budget: Infinity, kinds: ["problem", "opportunity"] }, // no cap
    };
    ```
  - [ ] Extend `FeedPartitionOptions` with `noisiness: Noisiness` (default `"balanced"`). In `partitionFeed`, before grouping, additionally filter `eligible` by `NOISINESS[noisiness].kinds` (reflection is already excluded), and use `NOISINESS[noisiness].budget` as the budget. `Infinity` budget ⇒ everything visible, empty "also noticed". Keep the contradiction-priority behavior unchanged. Add unit tests in `feedBudget.test.ts` for each mode (key hides opportunities; everything empties the drawer).
  - [ ] Persist the mode like the other settings: `localStorage["writtten_noisiness"]` in `App.tsx` (mirror `writtten_stage`/`writtten_key_tier`), default `"balanced"`; thread it into the `partitionFeed` call in `SidecarFeed.tsx`.
  - [ ] Render a three-segment control in the settings panel (`SidecarFeed.tsx`, in a new `.setting-group` near the jargon control) — Key issues / Balanced / Everything — with `data-testid="noisiness-control"` on the group and `data-testid="noisiness-key|noisiness-balanced|noisiness-everything"` on the segments. Copy: "Key issues only / Balanced / Everything".
  - [ ] Reflections-panel auto-expand under "Everything" is **deferred with Milestone D** (no reflections produced yet) — note it, don't build it.

- [x] `data-testid="also-noticed-drawer"` _(drawer delivered; `data-testid="noisiness-control"` ships with the control above)_.
- [x] Update `docs/projects/message_generation_workflow.md` to reflect the new feed sort/budget contract.

---

## Design

### The two axes

Everything in this project is built on keeping two concepts distinct. Collapsing them creates a mess that is hard to untangle later.

**Kind** is what register is this observation in? It is a fixed, intrinsic attribute of the observation _type_ — not per-instance. A `contradiction` is always a `problem`; a `missing_topic` is always an `opportunity`; a claim-count reflection is always a `reflection`. There is no such thing as a `missing_topic` that is sometimes a `problem` and sometimes a `suggestion`. Resist any design where kind varies per-instance.

**Priority** carries all the per-instance variation — how urgent is this specific occurrence? It is a computed scalar derived from structural signals, not a fuzzy LLM score.

The feed's noisiness control rides on `priority`. Visual styling and panel placement ride on `kind`. They compose cleanly because they are independent.

### Kind taxonomy

Three values replace the current binary `nature: "defect" | "opportunity"`:

| Kind          | Old `nature`  | Register                                                                | Visual treatment                         |
| ------------- | ------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `problem`     | `defect`      | Something is wrong or missing that could hurt this doc's effectiveness. | Alert weight; red/amber accent.          |
| `opportunity` | `opportunity` | Something could be stronger; a gap worth filling.                       | Softer weight; blue/teal accent.         |
| `reflection`  | _(new)_       | Neutral, non-judgmental awareness of what the doc is doing.             | Muted; no accent colour; distinct panel. |

Existing type → kind mapping (all existing types keep their scope and kind assignment):

| Type                 | Kind          |
| -------------------- | ------------- |
| `clarity`            | `problem`     |
| `contradiction`      | `problem`     |
| `unsupported_claim`  | `problem`     |
| `undefined_jargon`   | `problem`     |
| `audience_mismatch`  | `problem`     |
| `structure_flow`     | `problem`     |
| `missing_topic`      | `opportunity` |
| `underexposed_topic` | `opportunity` |

New types under Milestone C will each have a fixed kind assigned at the time they are confirmed (candidates listed in the Todo).

### Priority function

`priority = typeBaseSeverity × confidenceFactor`

All inputs are structural — no LLM vibe scores.

**Type-prior severity** (default; overridable by escalation):

| Type                                        | Base severity |
| ------------------------------------------- | ------------- |
| `contradiction`                             | `medium`      |
| `unsupported_claim`                         | `medium`      |
| `missing_topic`                             | `medium`      |
| `unmeasurable_criteria` _(candidate)_       | `medium`      |
| `unstated_assumption` _(candidate)_         | `medium`      |
| `ownerless_commitment` _(candidate)_        | `medium`      |
| `clarity`                                   | `low`         |
| `undefined_jargon`                          | `low`         |
| `underexposed_topic`                        | `low`         |
| `audience_mismatch`                         | `low`         |
| `structure_flow`                            | `low`         |
| `scope_ambiguity` _(candidate)_             | `low`         |
| `alternatives_not_considered` _(candidate)_ | `low`         |

> **Implementation note (Option A, resolved 2026-06-03):** `contradiction` and `unsupported_claim` are base `medium` (not `high`). The escalation rules below target exactly these two types — they need headroom below `high` to do real work. A commitment×commitment conflict or unsupported-claim-underpinning-a-commitment escalates to `high`. This is the only internally-coherent reading of "conflicting commitments are the most damaging" given the escalation rules' target types.

**Structural escalation rules** (applied before computing priority):

- Contradiction between two `commitment` claims: escalate severity one step (medium → high; high stays high). Commitments are the hardest assertions in a PM doc; conflicting commitments are the most damaging.
- Contradiction between two `metric` claims: same escalation.
- `unsupported_claim` whose substring overlaps a `commitment` ledger entry: escalate. The doc is asserting a fact as the basis for a commitment — that needs support.

**Confidence factor** (multiplier on the priority number):

| Confidence | Factor |
| ---------- | ------ |
| `high`     | 1.0    |
| `medium`   | 0.75   |
| `low`      | 0.5    |

Confidence sources:

- `contradiction` via hedged prompt (free tier) → `low`.
- `contradiction` via confident prompt (paid key) → `high`.
- All other types default to `medium` until the LLM optionally returns an explicit confidence field.

`priority` is stored as a float in `[0, 3]`. The feed sorts descending. The budget clips at N.

### Budget model vs. threshold

The feed shows the **top-N active observations by priority**; remaining observations move into a collapsed "also noticed" drawer. This is deliberately not a priority-threshold filter.

Why budget beats threshold:

- Threshold gives an inconsistent feed size — 40 cards on a messy doc, 0 on a clean one. The cognitive load the user experiences is not about doc quality; it is about the number of cards they have to process.
- Budget makes the feed feel consistent — "I always see my top concerns" — regardless of doc state.
- Doc quality changes _what_ is in the top-N, not _how many_ you are hit with.
- The slider becomes an attention budget (cognitive load), which is the thing the user actually wants to control.

Floors override the budget: a `contradiction` with `priority > 0` always appears in the main feed even if outside top-N. The user may dismiss it, which removes it from the budget calculation entirely.

### Reflection as the most differentiated kind

The reflection panel is the product's clearest distance from Grammarly-with-extra-steps. Grammarly has warnings and suggestions. Nobody has a calm, running structural mirror of a PM doc.

Key properties:

- Derived client-side from the claim ledger and block summaries — no LLM, no latency, no cost.
- Ephemeral — recomputed in memory, never persisted. If IndexedDB is cleared, reflections regenerate instantly on next ledger read.
- Non-judgmental by construction — they are counts and facts, not flags. "7 commitments, 3 undated" is awareness, not a problem declaration.
- Cannot be dismissed (they are not observations that resolve; they are running state).
- Always gated behind user expansion — they should never be the loudest thing in the panel.

### Taxonomy validation method

The candidate decision-rigor types (Milestone C) are based on reasoning, not data. They must be validated against real docs before prompts are written.

Method:

1. Collect 15–20 PRDs and decision docs from the target persona (PMs; mix of quality and doc type).
2. Run each through the existing tool in record mode. Capture observations produced.
3. Independently, run a strong model (e.g. `gemini-2.5-pro`) with a prompt asking for _all_ margin notes a senior PM reviewer would write on each doc. Collect and categorize.
4. The residual set — notes from step 3 that map to no existing type — is the empirical taxonomy gap. Compare against the candidate list.
5. Only types that appear in the residual set get built. Types in the candidate list that do not appear get dropped or deferred.

This method produces real evidence without a user research study and is completable in one session using the record/replay harness.

---

## Open questions and decisions

### Noisiness slider granularity _(open)_

Three discrete steps (Key issues / Balanced / Everything) vs. a continuous 1–10 slider. Three steps is simpler to implement and reason about; a slider allows fine-tuning. Recommendation: ship three steps; upgrade to slider only if dogfooding reveals that users want intermediate positions.

### `ownerless_commitment` as a client-side check _(open)_

`commitment`-kind claims are already in the ledger with their source block. Checking for missing owner/date may be doable with a lightweight regex scan of the claim text (no LLM call required) — "we will…" with no name, "by Q3" with no named owner. Validate against corpus whether the false-positive rate is acceptable before adding an LLM-based version.

### Reflection: tone-shift detection _(deferred)_

A tone-shift flag ("tone shifts from analytical to promotional around §4") requires per-section tone classification. This is derivable from block summaries if they include a tone signal, but the current summary schema does not include one. Defer until summaries are extended with tone metadata. Do not build the LLM-per-section tone call speculatively.

### Priority decay over session time _(deferred)_

An observation that has been in the feed for 20 minutes without dismissal is probably not actionable right now. Decaying its `priority` gently over session time could keep the feed fresh without forcing dismissal. This is a UX refinement — do not build until there is evidence from dogfooding that stale-but-undismissed cards are a real problem.

### Interaction with dismissal suppression _(open)_

Currently dismissal suppression is keyed on `(type, spanSignature)`. With kind added, should suppression also reset when kind changes? No — kind is a fixed attribute of a type, so kind and type always move together. The existing suppression key is sufficient.
