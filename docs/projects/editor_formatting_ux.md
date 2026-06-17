---
status: idea
kind: spec
phases: [6]
summary: Discoverable formatting for the writing canvas — a selection bubble menu (inline marks + links) and a slash menu (block types), both appear-on-demand with zero standing chrome, plus a Link extension. Closes UX-004: rich-text/markdown formatting already works but is invisible to a user without markdown muscle-memory.
---

# Editor Formatting UX (UX-004)

## Status

> Canonical status lives in the frontmatter above and is mirrored in the Projects Index in `docs/plan.md`. This block carries the human-readable scope only.

**Idea — Phase 6 (design fully written, ready to build).** Promoted out of the R7b "scanning affordances" grab-bag because discoverable formatting is core to a _writing_ tool, not a feed affordance. The capability already exists — TipTap StarterKit + `tiptap-markdown` input rules + keyboard shortcuts (`src/editor/Editor.tsx:160`) — but it's **invisible**: there is no toolbar or menu, so a user without markdown muscle-memory has no discoverable way to make a heading, list, or emphasis. This spec adds the _control surface_; the _styling_ of formatted elements is already specced in `visual_style.md` § Editor canvas.

Read alongside:

- `docs/projects/visual_style.md` — the menus are styled to its tokens; this spec _extends_ its component language with the two menu surfaces.
- `docs/projects/ui_interaction_mechanics.md` — the menus reuse its motion/reveal language (one interaction vocabulary across the app).
- `docs/projects/accessibility.md` — both menus must be fully keyboard-operable (the a11y invariant: no mouse-only interaction).
- `docs/projects/egress.md` — links must round-trip through the existing Markdown export/copy.
- `docs/projects/quality_remediation_synthesis.md` (R7 · UX-004) — the origin of the requirement.

**Two decisions settled 2026-06-17:**

1. **Bubble menu + slash menu** — a selection **bubble menu** for inline marks (appears only when text is selected, floats by the selection) and a **slash menu** for block types (appears only when `/` is typed on an empty line). Both are appear-on-demand with **zero standing chrome**, honoring visual_style principle #1 ("the page is for reading"). No persistent toolbar. Markdown input rules and keyboard shortcuts stay for power users.
2. **Current set + hyperlinks** — expose the existing StarterKit set and **add a Link extension** (PMs link to tickets/specs constantly; it round-trips to Markdown and fits the bubble menu). Tables/images are explicitly out of scope (§ Scope boundaries).

## Phased Plan

| Phase | Contributes                                                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6** | The bubble menu (inline marks + link), the slash menu (block types), the Link extension with a link-edit popover and Markdown round-trip, full keyboard operability for both menus, and the menu component styling — all additive over the existing markdown/keyboard formatting, which is left intact. |

## Todo

Anchor file: `src/editor/Editor.tsx` (extension registration), new `src/editor/extensions/SlashMenu.tsx` + `src/editor/menus/BubbleMenu.tsx` (or colocated), `src/styles.css` (menu styling via visual_style tokens). New deps: `@tiptap/extension-link`, `@tiptap/extension-bubble-menu` (or the `BubbleMenu` React component from `@tiptap/react`), and `@tiptap/suggestion` for the slash trigger.

- [ ] **Bubble menu** — a `BubbleMenu` shown on non-empty text selection (suppressed inside code blocks and on node selections): buttons for **bold · italic · strike · inline-code · link**, each with an active state reflecting the mark at the selection. Styled per § The bubble menu; keyboard-reachable (§ Accessibility).
- [ ] **Slash menu** — a `Suggestion`-driven menu triggered by `/` at the start of an empty text block: items **Heading 1/2/3 · Bulleted list · Numbered list · Quote · Code block · Divider**, filterable by typed query, full keyboard nav (↑/↓/Enter/Esc), inserting the block and removing the `/query`. Styled per § The slash menu.
- [ ] **Link extension** — add `@tiptap/extension-link` (autolink off or conservative; `openOnClick` off in-editor); a link button in the bubble menu opens a small URL popover (set / edit / remove); sanitize (`javascript:`/unsafe schemes rejected); `rel="noopener nofollow"` on render; verify Markdown round-trip via `tiptap-markdown` (§ Links).
- [ ] **Preserve existing paths** — confirm markdown input rules (`# `, `- `, `> `, `**…**`, `` ` ``) and keyboard shortcuts still work unchanged; the menus are additive, not a replacement.
- [ ] **Accessibility** — both menus operable without a mouse: bubble menu reachable from the selection (a shortcut to focus it, e.g. the existing marks are already keyboard-bound; the menu is a _visible_ aid, not the only path), slash menu fully keyboard-driven with `role`/`aria` per § Accessibility. Honor `prefers-reduced-motion`.
- [ ] **Harness hooks** — `data-testid` on the bubble menu, each bubble button, the slash menu, and slash items so the agent harness can drive formatting deterministically.

## Design

### Principles

1. **Discoverable, but zero standing chrome.** Both surfaces appear only in response to an intent (selecting text; typing `/`). At rest, the canvas is pure paper. This is how we get discoverability _without_ a toolbar competing with the reading surface (visual_style #1).
2. **Markdown stays underneath.** The menus are an additive aid for users who don't know the shortcuts; they never replace the input rules or keyboard bindings. A power user never has to touch them.
3. **One interaction language.** The menus use the same reveal/motion tokens as the rest of the app (ui_interaction_mechanics) — they feel like the same product, not a bolted-on editor widget.
4. **Inline vs. block, cleanly split.** The bubble menu owns _marks on a selection_; the slash menu owns _block-type on an empty line_. The two never overlap, so neither is crowded.

### The bubble menu (inline marks + link)

- **Trigger:** a non-empty text selection. Hidden when the selection is empty, when the selection is inside a `codeBlock` (no inline marks there), and on node/gap selections.
- **Contents (in order):** Bold · Italic · Strikethrough · Inline code · Link. Each button shows an **active** state (`is-active`) when its mark covers the selection, so the menu doubles as a "what's applied here" readout.
- **Placement:** floats just above the selection (TipTap default), flipping below when near the top edge; never covers the selected text.
- **Styling:** a small `--color-surface` pill, `--radius-md`, `--elev-hover`, hairline border; sans (`--font-sans`); icon buttons with the standard ghost-button hover. Reveal is a quick `--dur-fast` opacity/scale (origin at the selection), reduced-motion → instant.
- **Dismissal:** collapsing the selection, pressing Esc, or clicking away.

### The slash menu (block types)

- **Trigger:** `/` typed at the **start of an empty text block** (paragraph). Uses the `@tiptap/suggestion` utility (the same mechanism Mention uses). Typing after the `/` filters items live.
- **Items:** Heading 1 · Heading 2 · Heading 3 · Bulleted list · Numbered list · Quote · Code block · Divider (horizontal rule). Each row: an icon, a label, and (optional) the equivalent markdown hint (e.g. "# ", "- ") so the menu also _teaches_ the shortcut.
- **Behaviour:** selecting an item removes the `/query` text and applies the block transform at the cursor. Keyboard: ↑/↓ to move, Enter to choose, Esc to dismiss (leaving the literal `/` text). Mouse hover highlights the row; click chooses.
- **Placement:** anchored below the cursor line, flipping above near the bottom edge.
- **Styling:** a `--color-surface` card, `--radius-md`, `--elev-hover`, hairline border; rows use `--text-ui`; the active row gets `--color-accent-tint`. Reveal `--dur-fast` opacity, reduced-motion → instant.
- **Empty filter:** if the typed query matches nothing, show a single muted "No matches" row (the `/` is harmless literal text if dismissed).

### Links

- **Extension:** `@tiptap/extension-link`, configured `openOnClick: false` (clicking in the editor places the cursor, doesn't navigate — you're editing), `autolink` conservative or off (avoid surprise-linking while typing), `protocols` limited to http/https/mailto.
- **Set/edit:** the bubble menu's Link button opens a tiny inline popover with a URL field — Enter sets the link on the selection, a "Remove" clears it, editing an existing link pre-fills the field. Styled to visual_style tokens (input = `--radius-sm`, focus ring `--color-accent-strong`).
- **Render:** links render in `--color-accent` (the brand ink-indigo — links are a brand moment, not a semantic one), underlined; `rel="noopener nofollow"` always.
- **Security:** reject/sanitize unsafe schemes (`javascript:`, `data:`); never render an unsanitized href. (Local-first: no link preview/unfurl — that would phone out and break Invariant 5.)
- **Round-trip:** verify a link survives Markdown export/copy and re-import via `tiptap-markdown` (the egress milestone's formats), so `[text](url)` is lossless.

### Accessibility

- **Slash menu:** `role="listbox"` with `role="option"` rows, `aria-activedescendant` tracking the highlighted row, full arrow/Enter/Esc operation — usable with zero mouse. Announced changes via the suggestion popup.
- **Bubble menu:** the underlying marks are already keyboard-bound (StarterKit shortcuts), so keyboard users are never _blocked_; the bubble menu is a visible aid. Make its buttons real `<button>`s with `aria-label`s and an active state, reachable in the tab order when shown. The link popover traps focus while open and restores it on close.
- **Reduced motion:** both reveals collapse to instant per the global guard.

### Relationship to existing formatting

Purely additive. Markdown input rules, keyboard shortcuts, semantic paste, and the markdown-friendly schema are unchanged — the menus sit on top. The only schema change is the **Link** mark (new), which the export/copy formats must serialize (already markdown-based, so low-risk).

### Scope boundaries

| Concern                       | Decision                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persistent toolbar            | **Rejected** — competes with the calm canvas (visual_style #1).                                                                                           |
| Tables, images                | **Out of scope** — real complexity (schema, export, local-first image storage); revisit only if dogfooding demands. Note as a future option, don't build. |
| Menu _styling tokens_         | Defined here, drawn from `visual_style.md`; this spec extends its component language with the two menu surfaces.                                          |
| Markdown shortcuts / keyboard | Unchanged (kept as the power-user path).                                                                                                                  |

## Verification

1. Mouse: select text → bubble menu appears with working B/I/S/code/link and correct active states; type `/` on an empty line → slash menu filters and inserts the right block.
2. Keyboard-only (mouse unplugged): `/` menu fully drivable (arrows/Enter/Esc); marks via shortcuts still work; link popover focus-traps and restores.
3. Round-trip: create a link, export Markdown and copy-as-Markdown → `[text](url)` intact; re-import → link preserved.
4. Reduced-motion on → menus appear instantly, no animation.
5. Calm check: at rest (no selection, no `/`) the canvas shows no formatting chrome at all.
