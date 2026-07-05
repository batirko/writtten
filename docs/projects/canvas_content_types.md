---
status: in-progress
kind: spec
phases: [6, 7]
summary: Decide and bound which rich-content types the writing canvas accepts (on paste) and lets the user create — tables, images, task lists, code blocks, links — and how each interacts with the section/eval model and Markdown round-trip. Today the canvas is StarterKit-only, so pasting a table or image silently loses content; this is a current trust bug with no design owner.
---

# Canvas content types (paste-in & create)

> Written 2026-06-17 from a coverage review. The **copy/export** (egress) side is specced in `egress.md`; this doc is the **ingest + authoring** side — what the canvas can hold in the first place. The two must agree: we can only export/copy faithfully what the schema can represent.

## Status

**In progress — Phase 6 floor shipped; Phase 7 (images/task-lists as real nodes) remains.** The Phase 6 supported-set decision, the degradation mechanism, and the eval-model interaction were locked 2026-06-18 and are now built: editable tables (eval-inert), a slash-menu "Table" insert, and image paste-degradation. What remains (Phase 7) is richer authoring — images and task lists as real nodes, gated on the local-first storage story.

**Decision (2026-06-18):** the Phase 6 floor is **degradation + editable tables + links** (the option the table below recommends) — add `@tiptap/extension-table` (with cell/row/header) and `@tiptap/extension-link`, plus a predictable-degradation transform for every still-unsupported node (images, task lists). Images and task lists stay Phase 7.

The editor runs `@tiptap/starter-kit` only (`src/editor/Editor.tsx` extensions list). StarterKit covers paragraphs, headings, lists, blockquote, code block, horizontal rule, hard break, and the basic inline marks — but **not tables, images, or task/check lists**. So:

- **Pasting a table** (from Google Docs, Word, Confluence, a spreadsheet) → the table structure is dropped; cells flatten into paragraphs or are lost. Observed live.
- **Pasting an image** → dropped silently.
- **Creating** any of these in-canvas → not possible (no node, no input rule, no toolbar — see the related `Editor formatting UX` / UX-004 milestone for the _control surface_ question, which is distinct from _schema support_).

Silent content loss on paste is a **trust bug** (the user's material disappears), which is why this is scoped now rather than left to post-traction. But _which_ types we support is a real product decision with eval-pipeline consequences, so it gets a design doc, not a blind "add all the extensions."

Read alongside:

- `egress.md` — the copy/export side; whatever we accept here must round-trip there (`toMarkdown`/`toHtml`).
- `section_as_eval_unit.md` — the eval unit is a semantic **section** (heading + body). Non-text nodes don't fit that model cleanly (see § Eval-model interaction).
- `quality_remediation_synthesis.md` (UX-004, "Editor formatting UX") — the _discoverability_ of formatting controls; orthogonal to which nodes exist.
- `CLAUDE.md` invariant 5 (local-first) — images especially raise a storage/egress question (where do bytes live? do they leave the machine?).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **6** | **Stop the silent loss.** Decide the supported set; at minimum make unsupported paste content **visible** (degrade predictably — e.g. a pasted table → a fenced/plaintext block the user can see and fix — rather than vanishing). Tables are the highest-value add for the PM persona (PRDs use them constantly). |
| **7** | **Richer authoring** (images, task lists) once the persona need and the local-first storage story justify the schema + eval-model weight. Don't pre-build.                                                                                                                                                         |

## Todo

_Decisions are settled (2026-06-18); the list below is now a **build** checklist, not open design._

- [x] **Decide the supported set** (§ The decision). **Settled:** editable **tables** (`@tiptap/extension-table` + `table-row`/`table-header`/`table-cell`) and **links** (`@tiptap/extension-link`), with predictable degradation for everything else.
- [ ] **Inventory the loss.** Confirm exactly what StarterKit drops on paste for each source (Google Docs / Word / Confluence / Notion / raw HTML / a spreadsheet range). Capture as fixtures. _(Build prep — informs the degradation transform's match list; not a design blocker. Images are handled; the wider long-tail inventory is deferred.)_
- [x] **Add the table + link extensions** and confirm the BlockId extension applies a `blockId` attr to the top-level `table` node. Done: `@tiptap/extension-table` + row/header/cell registered in `Editor.tsx`; `table` added to the `BlockId` global-attribute whitelist (`BlockId.ts`); a "Table" slash-menu insert added (`SlashMenu.ts`). Links were already covered by UX-004.
- [x] **Predictable degradation for the unsupported** (§ Degradation contract). `SemanticPaste.transformPastedHTML` (`src/editor/extensions/SemanticPaste.ts`) now rewrites a pasted `<img>` → visible, editable `![alt](src)` text (base64 data-URIs collapsed to `embedded-image`, no bytes stored — invariant 5) instead of a silent drop. Tables are real nodes now, so the common table-loss case is fixed by support; this is the safety net for the long tail.
- [x] **Eval-model interaction** (§). A table is **inert** — it carries a `blockId` (section resolution intact) but its cell text is **excluded from `combinedText`** (`section.ts` `buildCombined` skips `isTable` members) **and from the body check** (`evaluator.ts` `hasBody` excludes `isTable`, so a heading+table-only section stays bodyless and doesn't hallucinate). No claims from cells, no span checks inside cells. Doc-level table→prose context deferred to Phase 7.
- [x] **Offset-mapping safety.** Added a fixture (`ObservationHighlighter.test.ts`) proving `charOffsetToPmPos` maps a highlight in a paragraph that _follows_ a table to the correct chars — the mapping is block-relative, so a preceding table (which only shifts the block's absolute pos) doesn't drift it.
- [x] **Round-trip with egress.** `export.test.ts` asserts a table serializes to GFM pipe-table syntax via `toMarkdown` (header row + delimiter row + body row). `tiptap-markdown` handles this out of the box.
- [ ] **`data-testid` / harness** — the dev harness `loadDoc` seeds text blocks; seeding a full table node isn't wired yet. Deferred (live paste covers table verification for now); a small follow-up if fixture-driven table tests are needed.

_Phase 7 (not in this scope):_

- [ ] **Local-first check for images.** If images are accepted later, decide storage (base64-in-IndexedDB vs object URL vs reject external `<img src>` to avoid silent egress). Do **not** introduce an upload server (invariant 5). Until then, pasted images degrade per the contract above.

## Design

### The decision: which types?

**Settled 2026-06-18.** Bias toward **the PM persona's real documents**, not editor completeness. Phase 6 adds **tables + links** as real editable nodes and degrades everything else; images + task lists are Phase 7. A PRD/spec/decision-doc routinely contains:

| Type                   | Persona need                                                  | Cost                                                             | Recommendation                                                                    |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Tables**             | High — comparison matrices, metric tables, RACI, option grids | Med (extension + section/eval interaction + Markdown round-trip) | **Phase 6.** Highest-value gap; the most common silent-loss case.                 |
| **Links**              | High — references to tickets, docs, dashboards                | Low                                                              | **Phase 6** (verify StarterKit coverage; add `@tiptap/extension-link` if absent). |
| **Task / check lists** | Med — action items, acceptance checklists                     | Low–Med                                                          | Phase 7, unless dogfooding shows demand.                                          |
| **Images / diagrams**  | Med — screenshots, flow diagrams                              | High (local-first storage + egress decision)                     | Phase 7, gated on the storage decision.                                           |
| **Code blocks**        | Low (already in StarterKit)                                   | —                                                                | Already supported.                                                                |

### Eval-model interaction (the reason this isn't just "add extensions")

The pipeline's atomic eval unit is a **section** = heading + body text (`section_as_eval_unit.md`), and the claim ledger extracts claims from **text**. Non-text and structured nodes don't fit. The mechanics that pin the v1 decision:

- `resolveSections` → `topLevelBlocks` (`src/editor/section.ts`) walks top-level nodes, **skips any node without a `blockId` attr**, and reads `node.textContent`. A table's `textContent` is the concatenation of all cell text. So there are two failure modes to avoid: (a) if the table has _no_ `blockId`, it's silently dropped and — worse — it can no longer separate the heading/body around it, mis-grouping the section; (b) if it _does_ carry a `blockId`, its flattened cell text lands in `combinedText` as an unstructured blob and pollutes the LLM's view of the section.
- **v1 decision (settled 2026-06-18):** the **table carries a `blockId`** (failure mode (a) avoided — section boundaries stay correct) but the section resolver is taught to **exclude table-node `textContent` from `combinedText`** (failure mode (b) avoided). Net: a table is **inert** — no claims extracted, no span checks inside cells, and the surrounding section still evaluates on its prose. Concretely, `topLevelBlocks` records `isTable` (e.g. `node.type.name === "table"`) and `buildCombined` skips table members' text while keeping the block in the members list for anchoring continuity.
- **Open question, deferred to Phase 7:** should table cell text feed _doc-level_ context (a metric in a table is exactly the kind of thing a `contradiction` should catch against prose)? Powerful but harder (needs structured extraction, not a flat blob); revisit with corpus evidence (`field_validation.md`).
- An **image** (Phase 7) is fully inert (no text). Until then images degrade per the contract below.
- The highlighter's `charOffsetToPmPos` / `reanchorOffset` assume text nodes; the table node must be verified against the offset-mapping path so highlights in a section that _contains_ a table don't drift (covered by the offset-mapping safety todo).

### Degradation contract (mechanism)

The non-negotiable: **paste never silently loses content.** If a node type isn't in the schema, the pasted content degrades to something _visible and editable_ (plaintext, or a Markdown fence), so the user can see what arrived and fix it.

**Where it lives:** the existing `SemanticPaste` extension (`src/editor/extensions/SemanticPaste.ts`) already owns `transformPastedHTML` (today it promotes faux-headings). Extend that same transform: after the table + link extensions claim what they can, walk the remaining DOM for nodes the schema still can't represent (`<img>`, task-list checkboxes, anything exotic) and rewrite each into a visible, editable representation rather than letting ProseMirror's schema-strip drop it:

- An `<img>` → a fenced/inline placeholder carrying the source URL or alt text (`![alt](src)` as literal text inside a code/paragraph node) so the reference survives and the user can act on it. (No bytes are stored — invariant 5 — until the Phase 7 image decision.)
- A structure the table extension can't parse → a fenced plaintext block of its text content.

Because tables and links are now first-class, the _common_ silent-loss cases (a pasted comparison table, a hyperlink) are fixed by real support; the degradation transform is the safety net for the long tail. This keeps the Phase 6 floor — **nothing the user pastes ever just vanishes** — while richer support lands incrementally.

### Out of scope

- The _control surface_ for creating formatted content (toolbar / bubble menu / slash menu) — that's `Editor formatting UX` (UX-004) in `quality_remediation_synthesis.md`. This doc is about which nodes the schema supports; that one is about how a user discovers how to make them.
- Binary-format **import** (DOCX/PDF via markitdown) — deferred, `ai_tooling_integration.md`. (Distinct from in-editor paste.)
- Export/copy serialization — `egress.md` (this doc only requires that whatever we add is representable there).
