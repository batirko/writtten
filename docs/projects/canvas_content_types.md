---
status: idea
kind: spec
phases: [5, 6]
summary: Decide and bound which rich-content types the writing canvas accepts (on paste) and lets the user create — tables, images, task lists, code blocks, links — and how each interacts with the section/eval model and Markdown round-trip. Today the canvas is StarterKit-only, so pasting a table or image silently loses content; this is a current trust bug with no design owner.
---

# Canvas content types (paste-in & create)

> Written 2026-06-17 from a coverage review. The **copy/export** (egress) side is specced in `egress.md`; this doc is the **ingest + authoring** side — what the canvas can hold in the first place. The two must agree: we can only export/copy faithfully what the schema can represent.

## Status

**Idea — Phase 5/6.** The editor runs `@tiptap/starter-kit` only (`src/editor/Editor.tsx` extensions list). StarterKit covers paragraphs, headings, lists, blockquote, code block, horizontal rule, hard break, and the basic inline marks — but **not tables, images, or task/check lists**. So:

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
| **5** | **Stop the silent loss.** Decide the supported set; at minimum make unsupported paste content **visible** (degrade predictably — e.g. a pasted table → a fenced/plaintext block the user can see and fix — rather than vanishing). Tables are the highest-value add for the PM persona (PRDs use them constantly). |
| **6** | **Richer authoring** (images, task lists) once the persona need and the local-first storage story justify the schema + eval-model weight. Don't pre-build.                                                                                                                                                         |

## Todo

- [ ] **Inventory the loss.** Confirm exactly what StarterKit drops on paste for each source (Google Docs / Word / Confluence / Notion / raw HTML / a spreadsheet range). Capture as fixtures.
- [ ] **Decide the supported set** (§ The decision). Recommended Phase 5 floor: **tables** (`@tiptap/extension-table` + cell/row/header) and **links** (if not already covered), with predictable degradation for everything else.
- [ ] **Predictable degradation for the unsupported.** A paste that contains an unsupported node must not vanish — convert to a visible representation (plaintext/Markdown fence) so the user sees their content and can decide. Never silent drop.
- [ ] **Eval-model interaction** (§) — define how a table/image is treated by the section resolver and claim ledger. Default: a table is **inert** for span checks (no claims extracted from cells in v1), but its surrounding section still evaluates; an image is fully inert. Decide whether table _text_ feeds doc-level context.
- [ ] **Round-trip with egress.** Whatever is added must serialize through `export.ts` `toMarkdown`/`toHtml` and survive copy→paste into a rich target. Add to `export.test.ts`.
- [ ] **Local-first check for images.** If images are accepted, decide storage (base64-in-IndexedDB vs object URL vs reject external `<img src>` to avoid silent egress). Do **not** introduce an upload server (invariant 5).
- [ ] **`data-testid` / harness** — if the supported set grows, ensure `loadDoc` fixtures and the dev harness can seed a doc containing the new node types.

## Design

### The decision: which types?

Bias toward **the PM persona's real documents**, not editor completeness. A PRD/spec/decision-doc routinely contains:

| Type                   | Persona need                                                  | Cost                                                             | Recommendation                                                                    |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Tables**             | High — comparison matrices, metric tables, RACI, option grids | Med (extension + section/eval interaction + Markdown round-trip) | **Phase 5.** Highest-value gap; the most common silent-loss case.                 |
| **Links**              | High — references to tickets, docs, dashboards                | Low                                                              | **Phase 5** (verify StarterKit coverage; add `@tiptap/extension-link` if absent). |
| **Task / check lists** | Med — action items, acceptance checklists                     | Low–Med                                                          | Phase 6, unless dogfooding shows demand.                                          |
| **Images / diagrams**  | Med — screenshots, flow diagrams                              | High (local-first storage + egress decision)                     | Phase 6, gated on the storage decision.                                           |
| **Code blocks**        | Low (already in StarterKit)                                   | —                                                                | Already supported.                                                                |

### Eval-model interaction (the reason this isn't just "add extensions")

The pipeline's atomic eval unit is a **section** = heading + body text (`section_as_eval_unit.md`), and the claim ledger extracts claims from **text**. Non-text and structured nodes don't fit:

- A **table** has no obvious "section text." v1 stance: a table is **inert** for span checks (clarity/jargon/unsupported_claim don't fire inside cells) and produces **no ledger claims** — but it must not break section resolution (`resolveSections` must skip or contain it gracefully, not crash or mis-group the surrounding heading/body). Open question: should table cell text feed _doc-level_ context (a metric in a table is exactly the kind of thing a `contradiction` should catch against prose)? Powerful but harder; defer to a Phase 6 decision with corpus evidence.
- An **image** is fully inert (no text). Its only pipeline concern is not breaking anchoring/offset math in its section.
- The highlighter's `charOffsetToPmPos` / `reanchorOffset` assume text nodes; new node types must be verified against the offset-mapping path so highlights in a section containing a table don't drift.

### Degradation contract (the Phase 5 floor, even if we add nothing)

The non-negotiable: **paste never silently loses content.** If a node type isn't in the schema, the pasted content degrades to something _visible and editable_ (plaintext, or a Markdown fence), so the user can see what arrived and fix it. This alone fixes the trust bug for the common case while the richer support lands incrementally.

### Out of scope

- The _control surface_ for creating formatted content (toolbar / bubble menu / slash menu) — that's `Editor formatting UX` (UX-004) in `quality_remediation_synthesis.md`. This doc is about which nodes the schema supports; that one is about how a user discovers how to make them.
- Binary-format **import** (DOCX/PDF via markitdown) — deferred, `ai_tooling_integration.md`. (Distinct from in-editor paste.)
- Export/copy serialization — `egress.md` (this doc only requires that whatever we add is representable there).
