import { Extension } from "@tiptap/core";

/**
 * Backspace on an empty list item should leave the list, the way Enter on an
 * empty item already does (that path is `splitListItem`'s built-in behaviour).
 *
 * Without this, Backspace on the empty nth bullet only deletes the item and
 * drops the cursor at the end of the previous one — so the list has exactly one
 * exit, and the key most people reach for to back out of it silently keeps them
 * inside (UX-024).
 *
 * `liftListItem` outdents one level: from a top-level item that means becoming
 * a plain paragraph after the list; from a nested item it un-indents to the
 * parent list, which is the expected step-by-step way out. Returning `false`
 * for every other case lets ListKeymap and the default Backspace handle
 * non-empty items, text selections, and everything outside a list.
 *
 * Priority sits above ListKeymap (100) so this runs before its own Backspace
 * handling, which would otherwise join the empty item into the previous one.
 */
export const ListEscape = Extension.create({
  name: "listEscape",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const listItem = state.schema.nodes.listItem;
        if (!listItem) return false;

        const $from = selection.$from;
        let itemDepth = -1;
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type === listItem) {
            itemDepth = depth;
            break;
          }
        }
        if (itemDepth === -1) return false;

        // Only an item that is genuinely empty — no text, and no nested list or
        // extra block hanging off it that lifting would silently restructure.
        const item = $from.node(itemDepth);
        if (item.textContent.length > 0 || item.childCount > 1) return false;

        return this.editor.commands.liftListItem(listItem.name);
      },
    };
  },
});
