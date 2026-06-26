---
status: done
kind: spec
phases: [4]
summary: Redesign the evaluation unit from individual ProseMirror blocks to semantic sections (heading + body), unifying the typing and paste workflows and eliminating the heading-hallucination class of bugs.
---

# Section as Evaluation Unit

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Status: `done`** (2026-06-03). Implemented as the structural half of Chunk 1. This work directly resolves `evaluation_signal_quality.md` Finding 1 (heading-only block hallucination) and is the prerequisite for clean Phase 4 import/paste behaviour. Implementation: `src/editor/section.ts` (resolver), section-keyed triggers in `src/editor/Editor.tsx`, section-keyed orchestrator state in `src/services/orchestrator.ts`, `evaluateSection` + member re-anchoring in `src/services/evaluator.ts`.

The core shift: the **section** (heading + all body nodes until the next heading) becomes the atomic unit of evaluation. The **block** (individual ProseMirror node) remains the unit of _anchoring_ — observations still reference spans within blocks, highlights still track through edits — but the LLM never sees a heading without its body.

## Phased Plan

| Phase       | Contribution                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 4** | Implement section resolver, replace per-block settle triggers with section-departure triggers, update orchestrator dispatch, verify paste + import workflow. |

## Todo

- [x] Implement `resolveSection(doc, blockId)` — pure function, returns section boundary given any member block. → `src/editor/section.ts` (+ `resolveSections`); unit tests in `src/editor/section.test.ts`.
- [x] Add `sectionId` + `members` to trigger payloads; change orchestrator to key in-flight tracking on section, not block. → `src/services/types.ts`, `src/services/orchestrator.ts` (`inFlightSections`).
- [x] Update `Editor.tsx` cursor tracking to detect section-departure rather than block-departure. → `onSelectionUpdate` / `onUpdate` / window-blur in `src/editor/Editor.tsx`.
- [x] Update the eval call site to pass `heading + body combinedText` as the eval input. → `evaluateSection(docId, sectionId, combinedText, members, …)`; `evaluateBlock` kept as a one-member wrapper.
- [x] Preserve per-block anchoring: observations still carry `blockId` + `substring`; section context is input-only. → `anchorSubstring` re-anchors each span to its member block.
- [x] Update `loadDoc` harness method to work with the section model. → docWriter parses a leading Markdown heading into a heading node and fires one settle per resolved section. `loadLedger` unchanged (keyed by id).
- [x] Acceptance test (browser harness): paste `## Heading\nbody`; assert no observation anchors to heading alone; assert "section is empty" never fires. _(Covered by resolver unit tests + manual harness verification; manual acceptance run verified 2026-06-03.)_
- [x] Acceptance test (browser harness): type a section vs. paste a section; assert both produce the same `settle` event shape (`sectionId`). _(Same path by construction; manual acceptance run verified 2026-06-03.)_

---

## Background — why blocks alone are insufficient

TipTap / ProseMirror represents every top-level node as a separate block, each with its own stable `blockId`. A heading is a block. A paragraph is a block. A bullet list is one block (all bullets concatenated). There is no schema-level "section" node.

The current evaluation pipeline fires on individual blocks: a `settle-blur` or `settle-pause` trigger captures the _active block's_ text and dispatches it to the evaluator. When a section is pasted, the heading and its body arrive as separate blocks, both qualifying for evaluation (the blur path requires only `text.trim().length >= 10`, no terminal-punctuation check). The heading is therefore evaluated in isolation — with no body — which is the source of the hallucination class documented in `evaluation_signal_quality.md` §Finding 1.

Fixing this by "skip headings" or "merge heading with next block" is a patch, not a fix: it handles the simple case but not sections that span multiple paragraphs, bullet lists, and sub-headings. The right level of abstraction is the **section**.

---

## Design

### Section resolver

A pure function over the ProseMirror doc tree. It has no side effects and requires no schema changes — sections are derived, not stored.

```
resolveSection(doc, blockId) → {
  sectionId,          // = the heading's blockId (or first-block id for intro)
  headingText,        // empty string if no heading precedes
  memberBlockIds[],   // ordered list of all top-level block ids in this section
  combinedText,       // heading + "\n\n" + body text, joined in document order
}
```

Algorithm: walk top-level nodes; start a new section at each `heading` node (any level); accumulate all following non-heading nodes until the next heading or end of doc. Content before the first heading is an implicit intro section keyed by its first block's id.

**Schema unchanged.** Sections are not persisted — they are re-derived on each eval call from the live doc state. This is intentional: sections shift as the user edits headings or adds structure, and re-derivation is cheap (one linear walk).

### Trigger redesign

Replace _block-departure_ with _section-departure_ as the primary eval trigger.

Current: the cursor tracks the active block; blur/pause fires on that block.

New: the cursor tracks the active **section** (call `resolveSection` to find which section the active block belongs to). A section evaluates when:

1. The cursor leaves the section (moves to a block in a different section).
2. The window blurs while the cursor is in the section.
3. The section reaches the settle-pause threshold (3 s silence with terminal punctuation in any member block).
4. A new heading is inserted — creating a section boundary — and the cursor moves into the new section.

**Paste / import unification:** when a section is pasted, the cursor lands at the end of the last pasted block (typically the last block of the pasted section). The user then pastes the next section, moving the cursor forward — which triggers section-departure on the just-pasted section. This is the same event sequence as typing a section and pressing Enter to start a new one.

> **Correction (2026-06-05):** this only holds for _section-by-section_ pasting that moves the cursor between pastes. A single **bulk paste** of a whole draft is one selection jump — the cursor lands only in the last section, so departure never fires for the sections above it and they go unevaluated. Bulk paste/import therefore _does_ need explicit handling. See `docs/projects/bulk_paste_evaluation.md`.

Within-section edits reset the section's debounce timer but do not fire intermediate evaluations. This reduces call frequency for sections that are typed incrementally.

### Eval payload

The `evaluateBlock` call receives `combinedText = heading + "\n\n" + body` as its content input instead of a single block's text. The section title is therefore always present in the LLM's view, making "section is empty" structurally impossible (if the heading evaluates, the body is in the payload; if there is no body yet, the section hasn't departed and no eval fires).

The `blockId` passed to `evaluateBlock` becomes the **section's representative id** (the heading block's id, or first-block id for intro sections). Claims extracted from the section are ledgered under this id.

### Anchoring — per-block spans survive

The eval payload contains combined text, but the LLM still returns `substring` values anchoring observations to exact quoted text. On write, the observation engine already resolves `substring` against the live doc to find its host block — this is unchanged. A clarity observation quoting `"overly aggressive rules"` will still anchor to the paragraph block that contains it, regardless of whether the eval was triggered by section-departure.

The one addition: the observation also records the `sectionId` (the heading block's id) as optional context for feed display ("in the Background section") — but this is display metadata, not structural.

### Claim ledger impact

Today claims are keyed by `blockId`. After this change, claims from a section eval are keyed by the **section's representative id** (heading block's id). For documents without headings, behaviour is unchanged (first block id). For documents with headings, a section re-eval (triggered by an edit deep in the body) will **overwrite** previous claims for that section under the same key — which is the correct behaviour (the section's claim set has changed).

The prefilter and contradiction check are unaffected: they operate on the ledger's claim texts, not on block/section ids.

### Harness

`loadDoc({ blocks: [...] })` already seeds blocks in document order. The section resolver will correctly derive sections from seeded blocks. No harness API change required for seeding.

For acceptance tests that need to assert "this section evaluated as one unit," the `getEvents(sinceSeq)` stream will show a single `settle` event with `sectionId` rather than multiple per-block events — testable without mocking.

---

## Constraints and non-goals

- **No schema change.** Do not introduce a `section` node type. It would require custom input rules, auto-wrap paste handling, and interfere with Markdown import/export (Phase 4). The derived-section approach is equivalent without the schema cost.
- **No change to anchoring or highlight mechanics.** `ObservationHighlighter.ts` and the position-mapping logic are not touched. Sections are input context only.
- **Very long sections.** A section that exceeds a token threshold (e.g. a 2,000-word background narrative) should fall back to evaluating the body in chunks and merging claims — but this is an edge case; defer until observed in practice. Add a `MAX_SECTION_CHARS` guard that logs a warning and truncates gracefully if needed.
- **Sub-headings.** `## H2` followed by `### H3` creates a nested section hierarchy. For v1, treat every heading at any level as a section boundary (flat sections). Hierarchical sections are a later refinement.

---

## Known gap — span checks lack cross-section context (OBS-027)

The section is the atomic eval unit, and the LLM's view is one section's `combinedText` + stage + glossary (see _Eval payload_). That is correct for **extraction** (claims, summary) but lossy for **reference-resolving span checks** — `clarity`, `undefined_jargon`, `unsupported_claim` — which need to know what the *rest of the document* has already defined or asserted. Surfaced 2026-06-25: the "Out of scope" section was flagged for an undefined "this notification pattern" (defined two sections up in §Solution) and for an ambiguous "Multiple retries" (which sits under the section's own "Out of scope" header). Both are false positives caused by the section being judged alone.

Fix reuses artifacts that already exist: inject the other sections' **block summaries** (already computed for the doc-quality call) and/or the **active claim ledger** into the section-eval prompt as "context the document has already established — do not flag these as undefined/unsupported"; secondarily, instruct the model to treat the section heading as governing intent. Tracked as **OBS-027** (`docs/logs/prompt_quality_observations.md`) and a Phase-6 Signal-quality milestone in `docs/plan.md`. Distinct from OBS-026 (cross-*block* contradiction anchoring drop).

## Open questions & decisions

### Semantic paste (Markdown and Rich-text) is a correctness requirement

**The problem:** Real-world testing revealed that TipTap's default clipboard paste does not reliably parse headers (e.g. `### Background` in markdown, or `<b>Background</b>` styled text from an external rich-text editor) into semantic `heading` nodes. As a result, when a user pastes a document, the section resolver sees zero headings and treats the entire document as a single, massive section. This silently disables cross-section checks (Contradiction) and doc-level checks (which require ≥2 sections), while massively inflating token cost as the single block is repeatedly re-evaluated.

**Decision:** "Semantic paste" (parsing both raw markdown hashes and external HTML/rich-text styling into proper semantic `heading` nodes) is not just a nice-to-have for Phase 4; it is a **correctness requirement** for the section model to function on imported text. Until the editor is configured to parse pasted text into semantic nodes, the `section_as_eval_unit` architecture will degenerate to "whole-doc-as-one-blob" for pasted content. This must be prioritized as part of the Phase 4 Import milestone.
