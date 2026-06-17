---
status: idea
kind: spec
phases: [5]
summary: Give doc-level checks (structure_flow, underexposed_topic, audience_mismatch) the ability to anchor to the text they're about — section-level via blockId with an optional substring fallback — and tighten the prompts so categories stop bleeding (audience_mismatch absorbing claim-evidence complaints; structure_flow drifting into depth). Resolves R4 / OBS-015, OBS-016, OBS-018, UX-001, UX-009.
---

# Doc-level Anchoring & Category Discipline (R4)

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 5 (design fully written, ready to build).** Graduated from root cause **R4** in `docs/projects/quality_remediation_synthesis.md` into its own spec, the same way R3b → `archive_trust.md` and R3 → `doc_scope_reconciliation.md` did. The strong-tier doc-level schema returns only `{text}`, so doc-level critiques are architecturally second-class:

- They **can't anchor** — `structure_flow` / `underexposed_topic` point at text that _exists_ but can't highlight it (OBS-015 / UX-001), and there's nothing for auto-scroll to target (UX-009).
- With no proper home, the model **dumps** unsupported-claim (claim-vs-evidence) complaints into `audience_mismatch` (OBS-018).
- Phrasing **blurs categories** — `structure_flow` ("before _fully defining_ the problem") reads as a depth critique when the real issue is ordering (OBS-016).

The precedent is the shipped `strategic_tension` split (OBS-004): give the model the right bucket / the right output shape and the misclassification stops.

Read alongside:

- `docs/projects/quality_remediation_synthesis.md` (R4) — the root-cause analysis this executes.
- `docs/projects/ui_interaction_mechanics.md` — C6 (doc-scope hover affordance) is refined here: doc-scope **with** a blockId → section highlight; **without** → the whole-document affordance. C2 (click→scroll-to-span) and UX-009 consume the anchor target this produces.
- `src/services/evaluatorPrompts.ts` (`DOC_LEVEL_SYSTEM_PROMPT`) — the prompt+schema changed here.
- `src/services/evaluatorAnchoring.ts` — the substring→span resolver reused for the fallback.

**Decision settled 2026-06-17: section-level anchoring + optional substring fallback.** The doc-level model reasons over **block summaries + the claim ledger, not verbatim prose**, so requiring exact substrings would invite hallucinated/not-found anchors — the very failure R4 exists to fix. Instead, the model cites the **block** its observation is about (section-level, always resolvable) and _may_ add a substring for a finer highlight, which we use only when it's found verbatim, else fall back to the section.

**No DB migration.** The `Observation` interface already carries `blockId?`, `startOffset?`, `endOffset?`, `anchorText?` (`src/store/db.ts:69`). Anchored doc-level observations simply populate these optional fields; `scope` stays `"document"`.

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **5** | Extend the doc-level input (block references) and output schema (optional `blockId` + `substring`), add the three-tier anchor resolver, populate the existing Observation anchor fields, and tighten the four doc-level category prompts. Unit/ratchet tests guard the category discipline and the fallback. |

## Todo

Anchor files: `src/services/evaluatorPrompts.ts` (`DOC_LEVEL_SYSTEM_PROMPT` + the doc-level parse), `src/services/evaluatorAnchoring.ts` (reuse the substring resolver), `src/services/evaluatorReconcile.ts` / wherever doc-level observations are constructed, `src/services/eval-fixtures/` (category-discipline fixtures).

- [ ] **Doc-level input carries block refs** — include a stable per-block reference (the `blockId`, shown like `[Block <id>]`) alongside each block summary in the doc-level prompt input, so the model can cite which block an observation is about.
- [ ] **Schema extension** — the three _anchorable_ doc-level arrays (`underexposed_topic_observations`, `structure_flow_observations`, `audience_mismatch_observations`) accept `{text, blockId?, substring?}`; `missing_topic_observations` stays `{text}` (absent text → nothing to anchor). Update the parser to read the new optional fields and ignore an unknown/stale `blockId`.
- [ ] **Three-tier anchor resolver** — for each doc-level observation: (1) if `substring` is present **and** found verbatim in the cited block → set `blockId` + `startOffset`/`endOffset`/`anchorText` (a span anchor, reusing `evaluatorAnchoring`); (2) else if `blockId` is valid → set `blockId` only (section-level anchor, no offsets); (3) else → leave unanchored (whole-document). `missing_topic` is always tier 3.
- [ ] **Category discipline — prompt tightening** (§ Category discipline): `audience_mismatch` must not absorb claim-evidence / unsupported-claim complaints; `structure_flow` is strictly ordering/flow, never depth (that's `underexposed_topic`). Add the negative instructions + corrected examples.
- [ ] **Feed/highlight wiring** — a doc-scope observation with a `blockId` highlights its **section** on hover and is a valid scroll target on click (C2 / UX-009); without a `blockId` it shows the whole-document affordance (C6). Confirm the highlighter resolves a blockId-only (no-offset) anchor to a section highlight.
- [ ] **Tests** — (a) an anchored `structure_flow` resolves to a section highlight; (b) substring-found → span anchor, substring-not-found → graceful section fallback (no broken highlight); (c) a claim-evidence issue no longer surfaces as `audience_mismatch`; (d) an ordering issue surfaces as `structure_flow`, a depth issue as `underexposed_topic`. Wire the category-discipline asserts into the Tier-1 ratchet.

## Design

### The anchoring decision (section-level + optional substring fallback)

The doc-level check is deliberately coarse-grained — it reasons over the _shape_ of the document (summaries + ledger), not the exact words. So its natural unit of reference is the **block/section**, not the phrase. Requiring a verbatim substring from a model that never saw verbatim text is how you get the hallucinated anchors R4 is trying to kill. Hence:

- **Primary:** the model returns the `blockId` its observation concerns. Always resolvable to a section highlight; supports auto-scroll (UX-009).
- **Optional refinement:** the model may also return a `substring`. We use it **only if** it's found verbatim in the cited block (via the existing span resolver); otherwise we silently fall back to the section. The user never sees a broken highlight — worst case the highlight is a whole section instead of a phrase.
- **Whole-document:** `missing_topic` (and any observation the model declines to anchor) carries no `blockId` and uses the whole-document affordance (C6).

### Schema shape

```
underexposed_topic_observations: { text: string, blockId?: string, substring?: string }[]
structure_flow_observations:     { text: string, blockId?: string, substring?: string }[]
audience_mismatch_observations:  { text: string, blockId?: string, substring?: string }[]
missing_topic_observations:      { text: string }[]    // whole-document only
suggested_stage:                 string | null         // unchanged
```

The prompt instructs: _include `blockId` when the observation is about content that exists in a specific block; add `substring` only if you can quote the exact offending text; omit both for whole-document observations._

### Anchor resolution (three tiers, in order)

1. **Span** — `substring` present and found verbatim in `blockId`'s text → populate `blockId` + offsets + `anchorText`. Renders as a phrase highlight.
2. **Section** — `blockId` valid (exists in the current doc) but no usable `substring` → populate `blockId` only. Renders as a section highlight; the highlighter maps a no-offset blockId anchor to the block's full range.
3. **Document** — no valid `blockId` → unanchored; whole-document affordance (C6). Always the case for `missing_topic`.

A stale `blockId` (block deleted/changed since the eval) degrades to tier 3 rather than erroring.

### Category discipline (prompt tightening)

The schema change fixes _anchoring_; these prompt edits fix _misclassification_:

- **`audience_mismatch` — stop absorbing claim-evidence complaints (OBS-018).** Add an explicit negative: _audience_mismatch is about tone, depth, jargon, or assumptions that don't fit the stated audience — NOT about whether a claim is supported by evidence. Unsupported assertions are handled elsewhere; do not report them here._ (Claim-vs-evidence is the fast-tier `unsupported_claim` check's job.)
- **`structure_flow` — strictly ordering/flow, never depth (OBS-016).** Tighten to: _structure_flow is about content being out of logical order or disconnected from the document's flow — sequencing, not sufficiency. If the issue is that a topic is underdeveloped, that is underexposed_topic, not structure_flow._ Replace the "before fully defining" style example (which reads as a depth critique) with a pure ordering example (e.g. "the rollout plan appears before the problem statement").
- **Anchoring instruction** (above) is added to the same prompt so the model knows when to cite a block.

### Which types anchor

| Type                 | Anchors?                | Why                                                                     |
| -------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `missing_topic`      | Never (whole-doc)       | It's about _absent_ content — nothing to point at.                      |
| `underexposed_topic` | Section (optional span) | About a topic that _is_ present but thin — the block exists.            |
| `structure_flow`     | Section (optional span) | About a section being mis-ordered/disconnected — points at the section. |
| `audience_mismatch`  | Optional section        | Often whole-doc (tone), but can point at a specific offending passage.  |

### Scope boundaries

- This is the **strong-tier doc-level** schema + prompt only. It does not touch the fast-tier span checks (clarity / unsupported_claim / undefined_jargon) or the contradiction check.
- It **produces** anchor targets; it does not **build** the auto-scroll/split-context UX — that's C2 (ui_interaction_mechanics) and UX-009 (R7b), which consume the `blockId` this provides.
- **Free-tier note:** on the free tier the doc-level check runs on a weak (flash-lite) model; anchoring still applies but precision is lower. Not a blocker — degrades to section/whole-doc gracefully, consistent with the free-vs-paid quality gap tracked in `field_validation.md` V1.
