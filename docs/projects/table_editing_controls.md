---
status: done
kind: spec
phases: [6]
summary: Structural editing controls for tables — add/remove row & column and delete table — wiring the @tiptap/extension-table commands to a UI surface. Shipped Option A, a floating in-table menu (bubble-menu language). Option B (Notion-style hover grip handles) was the considered alternative, not pursued.
---

# Table editing controls (row/column)

> Written 2026-07-03 from a live dogfood of the tables feature (`canvas_content_types.md`). Pasting and creating editable tables worked, but there was **no way to change a table's structure** once it existed — no add/remove row, no add/remove column, no delete-table. This doc scoped that gap. **Decision (2026-07-03): Option A, the floating in-table menu.** Shipped and verified live.

## Status

**Done — Phase 6.** Shipped **Option A — the floating in-table menu** (`src/editor/menus/TableMenu.tsx`), wiring the `@tiptap/extension-table` commands (`addRowAfter`, `deleteRow`, `addColumnAfter`, `deleteColumn`, `deleteTable`). The menu is a bubble-menu-style pill (`+ Row · − Row · + Col · − Col · Delete table`) that appears only when the caret is inside a table and hides when it leaves — zero standing chrome. Deleting the last row/column removes the whole table (a dimension guard) rather than leaving an invalid empty one. Eval-inertness is preserved (the table keeps its `blockId`; cell text stays out of `combinedText`). **Option B (hover grip handles) was the considered alternative — not pursued** (Option A is keyboard-native and consistent with the shipped menu language). Merge/split cells, header-row toggle, and column resize remain out of scope (§ Out of scope).

Read alongside:

- `docs/projects/canvas_content_types.md` — the tables feature this completes (schema + eval-inertness + paste degradation). This doc is the _authoring controls_ for those tables.
- `docs/projects/editor_formatting_ux.md` — the established appear-on-demand menu language (selection bubble menu + slash menu, **zero standing chrome**). Option A extends that language directly.
- `docs/projects/visual_style.md` — menus/handles must draw from its tokens (`--color-surface`, `--radius-md`, `--elev-hover`, hairline border, `--dur-fast`).
- `docs/projects/ui_interaction_mechanics.md` — reuse its reveal/motion vocabulary so a table control feels like the same product.
- `docs/projects/accessibility.md` — whichever surface wins **must** be fully keyboard-operable (a11y invariant: no mouse-only path).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | Pick one surface (A or B), then build: add/remove row, add/remove column, delete table — keyboard-operable, styled to `visual_style` tokens, appear-on-demand (no standing chrome). Merge/split cells and header-row toggle are optional stretch, not required for the floor. |

## Todo

- [x] **Decide the control surface** — **Option A (floating in-table menu)** chosen (2026-07-03); Option B (hover grip handles) not pursued.
- [x] **Build the chosen surface** — `TableMenu.tsx`: a `BubbleMenu` (`pluginKey "tableMenu"`, `shouldShow` = caret inside a table with an empty selection) wiring `addRowAfter` / `deleteRow` / `addColumnAfter` / `deleteColumn` / `deleteTable`. Appears in-table, hides on leave. Mounted alongside `EditorBubbleMenu` in `Editor.tsx`.
- [x] **Keyboard operability** — real `<button>`s with `aria-label`s in tab order; a text selection in a cell instead surfaces the inline marks menu (cell formatting stays available).
- [x] **Styling** — `.table-menu-btn` (labelled variant) shares the `.bubble-menu` pill and tokens; a subtle danger hover for delete-table. Reduced-motion honoured via the global guard.
- [x] **Harness hooks** — `data-testid` on the menu (`table-menu`) and each action (`table-add-row`, `table-del-row`, `table-add-col`, `table-del-col`, `table-delete`).
- [x] **Guard rails** — deleting the last row/column deletes the whole table (a `tableDims()` check → `deleteTable`) rather than leaving an invalid empty one; `blockId` and eval-inertness confirmed intact after restructure.
- [x] **Tests** — verified live (menu appear/hide on caret enter/leave; add/remove row & column; delete-table + last-row guard; no console errors). Following the existing `BubbleMenu` precedent, no brittle jsdom component test was added; the command wiring is thin over the well-tested extension.

## Design

### The gap

A pasted or slash-inserted table is a first-class, editable node, but ProseMirror/TipTap ships **no default UI** for table structure — only imperative commands. Today a user can edit cell _text_ but cannot add a column, remove a row, or delete the table without retyping. That makes tables feel half-built. This is the missing authoring layer.

### Shared requirements (both options)

- **Appear-on-demand, zero standing chrome** (visual_style #1 — "the page is for reading"). The control surface is visible only while the caret/selection is inside a table, and vanishes when it leaves. No persistent table toolbar.
- **Actions (floor):** add row above/below, add column left/right, delete row, delete column, delete table. **Stretch (optional):** toggle header row, merge/split cells.
- **Keyboard-operable** — no mouse-only path (a11y invariant).
- **Eval-inertness preserved** — a structural edit must not change the fact that the table carries a `blockId` and its cell text stays excluded from `combinedText` (`section.ts`) and the `hasBody` check (`evaluator.ts`). No new eval triggers from restructuring.
- **Styled to `visual_style` tokens**; reduced-motion → instant.

### Option A — Floating in-table menu (extends the bubble-menu language)

A compact floating control that appears when the caret is inside a table, positioned near the table (e.g. above it), with icon buttons for the actions. Mechanically a sibling of the existing `EditorBubbleMenu` (`src/editor/menus/BubbleMenu.tsx`) but gated on `editor.isActive('table')` (or the selection being inside a table node) instead of a text selection.

```
Caret in a cell → a pill floats above the table:
[ +Row ] [ −Row ] [ +Col ] [ −Col ]  |  [ 🗑 Table ]
```

- **Pros:** reuses the shipped bubble-menu pattern and tokens almost verbatim (fast, consistent, "same product" feel); trivially keyboard-reachable (real `<button>`s in tab order); one obvious place to look.
- **Cons:** less spatially precise — buttons act on the _current_ row/column (where the caret is), so the user must place the caret first; slightly more chrome than handles when it's showing.
- **Build:** a new `TableMenu.tsx` mounted next to `EditorBubbleMenu` in `Editor.tsx`; `shouldShow` = selection inside a table; buttons chain the table commands; `data-testid` per button. Low–Med.

### Option B — Hover grip handles (Notion-style)

Grips that reveal on hovering a row's left edge or a column's top edge; a grip offers an inline insert (`+`) and a small context menu (delete row/column, etc.). Acting directly on the hovered row/column, not the caret's.

```
Hover the left edge of a row  → a ⋮ grip → Insert above / Insert below · Delete row
Hover the top edge of a column → a ⋮ grip → Insert left / Insert right · Delete column
```

- **Pros:** most spatially precise and discoverable (the control is _on_ the thing it edits); the polished, familiar table-editing feel; minimal chrome (handles are tiny and edge-anchored).
- **Cons:** more build (edge hit-zones, per-row/col positioning that survives edits, a popover) and a harder **keyboard story** — hover handles are inherently mouse-first, so we must add an explicit keyboard path (e.g. caret-in-cell → a command/menu) to satisfy the a11y invariant, which partly re-introduces Option A anyway.
- **Build:** decoration/overlay tracking row & column boundaries + a popover; careful position-mapping through edits. Med.

### Decision criteria

- **Consistency vs. polish:** Option A is the on-brand, low-risk extension of the existing menu language; Option B is more polished/precise but a bigger, more novel build with a mouse-first default that needs a bolted-on keyboard path.
- **a11y:** Option A is keyboard-native; Option B needs an explicit keyboard equivalent designed in from the start.
- **Effort:** A ≈ Low–Med, B ≈ Med.
- A pragmatic hybrid exists (grips for mouse discoverability **+** a caret-in-table menu for keyboard), but that's the most work; only pursue if dogfooding shows both are wanted.

### Out of scope

- Column resizing (`resizable:false` is set today — keep it for v1).
- Cell background/color, alignment per cell — not persona-critical; revisit with evidence.
- Any change to table eval semantics — tables stay inert (that's `canvas_content_types.md`).

## Verification

1. With the chosen surface: caret in a table → controls appear; add a row/column → the table grows correctly; delete a row/column → shrinks; delete table → gone; controls vanish when the caret leaves the table.
2. Keyboard-only (mouse unplugged): every action reachable and operable.
3. Reduced-motion on → controls appear instantly.
4. Harness: after a restructure, the table still carries a `blockId` and the section produces no claims/observations from cell text (eval-inertness intact).
