import { Extension } from "@tiptap/core";

/**
 * Backspace at the start of a list item should leave the list, taking the
 * item's text with it — the same move Notion, Google Docs and Word make.
 *
 * Two things went wrong without this (UX-024). On an *empty* item, Backspace
 * merged it into the previous item as a stray second paragraph, so the list had
 * exactly one exit — Enter, via `splitListItem`'s built-in behaviour — and the
 * key most people reach for kept them inside. On an item *with text*,
 * ListKeymap's join-backward appended that text to the previous bullet instead
 * of unlisting it, which silently destroys a line the author meant to keep as
 * its own paragraph.
 *
 * The rule is positional rather than emptiness-based: if the cursor sits at the
 * very start of the item's first block, lift the item out. That covers both
 * cases with one behaviour, and it leaves ordinary Backspace alone everywhere
 * else — mid-text, in a later paragraph of a multi-block item, across a
 * selection, or outside a list — where ListKeymap and the default handler still
 * apply.
 *
 * `liftListItem` outdents one level: from a top-level item that means becoming
 * a plain paragraph (before or after the list, depending where the item sat);
 * from a nested item it un-indents to the parent list, which is the expected
 * step-by-step way out.
 *
 * Priority sits above ListKeymap (100) so this runs before its own Backspace
 * handling, which would otherwise do the joining described above.
 *
 * On ListKeymap: its Backspace path ends in a catch-all `liftListItem` for
 * anything it can't join, which is wrong at the start of a list item's second
 * or later block — there it lifts the entire item out of the list instead of
 * merging the block upward. StarterKit alone gets that case right, so
 * registering ListKeymap regressed it; the `index !== 0` branch above restores
 * the base behaviour. ListKeymap stays registered because it is still the only
 * thing that gets **Delete** right: at the end of an item with a following
 * item, it merges the two items, where the base keymap leaves a single item
 * holding two paragraphs.
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

        // The cursor must be in a block that is a direct child of the item…
        if ($from.depth !== itemDepth + 1) return false;
        // …and at that block's very start. Anywhere else, Backspace means
        // "delete a character" and must keep meaning that.
        if ($from.parentOffset !== 0) return false;

        // Start of a *later* block inside the item (a list item can hold more
        // than one paragraph): merge it into the block above, which is what the
        // base keymap does on its own. ListKeymap would otherwise fall through
        // to its catch-all `liftListItem` and yank the whole item out of the
        // list — see the note on why it is still registered, below.
        if ($from.index(itemDepth) !== 0) {
          return this.editor.commands.joinBackward();
        }

        return this.editor.commands.liftListItem(listItem.name);
      },
    };
  },
});
