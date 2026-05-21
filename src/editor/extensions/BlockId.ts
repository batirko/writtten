import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { nanoid } from "nanoid";

const BLOCK_ID_ATTR = "data-block-id";
const pluginKey = new PluginKey("blockId");

/**
 * Assigns a stable data-block-id attribute to every top-level block node.
 * IDs survive edits, survive serialization, and are unique across splits.
 */
export const BlockId = Extension.create({
  name: "blockId",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "bulletList", "orderedList", "blockquote", "codeBlock"],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el) => el.getAttribute(BLOCK_ID_ATTR),
            renderHTML: (attrs) =>
              attrs.blockId ? { [BLOCK_ID_ATTR]: attrs.blockId } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        appendTransaction(_transactions, _oldState, newState) {
          const { doc, tr } = newState;
          let modified = false;

          doc.descendants((node, pos) => {
            // Only top-level blocks (depth 1 in ProseMirror = direct children of doc)
            if (doc.resolve(pos).depth !== 0) return;
            if (!node.isBlock) return;
            if (node.attrs.blockId) return; // already has an id

            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              blockId: nanoid(10),
            });
            modified = true;
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
