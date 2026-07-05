import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { type Node as PMNode } from "@tiptap/pm/model";
import { nanoid } from "nanoid";

const BLOCK_ID_ATTR = "data-block-id";
const pluginKey = new PluginKey("blockId");

/**
 * Ensure every top-level block carries a unique `blockId`, mutating `tr` in
 * place. A block keeps its id when it's the first to claim it; a null id — or
 * one that duplicates a block seen earlier in the document — gets a fresh
 * `nanoid(10)`.
 *
 * The collision branch is what fixes the Enter-split bug: ProseMirror copies
 * the source node's attrs (including `blockId`) into the new paragraph, so the
 * duplicate must be reissued rather than skipped (which would leave two blocks
 * sharing one id and let the second's claims overwrite the first's in the
 * ledger — see docs/acceptance-testing/phase1-results.md observation #1).
 *
 * @returns whether any node was modified (i.e. whether `tr` should be applied).
 */
export function assignBlockIds(doc: PMNode, tr: Transaction): boolean {
  let modified = false;
  const seen = new Set<string>();

  doc.descendants((node, pos) => {
    // Only top-level blocks (depth 0 resolve = direct children of doc)
    if (doc.resolve(pos).depth !== 0) return;
    if (!node.isBlock) return;

    const id = node.attrs.blockId as string | null;
    if (id && !seen.has(id)) {
      seen.add(id);
      return; // unique, stable id — leave it untouched
    }

    const newId = nanoid(10);
    seen.add(newId);
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: newId });
    modified = true;
  });

  return modified;
}

/**
 * Assigns a stable data-block-id attribute to every top-level block node.
 * IDs survive edits, survive serialization, and are unique across splits.
 */
export const BlockId = Extension.create({
  name: "blockId",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "bulletList",
          "orderedList",
          "blockquote",
          "codeBlock",
          // A top-level table must carry a blockId so the section resolver keeps
          // it as a section member (preserving heading/body boundaries around
          // it) rather than silently dropping it. Its cell text is still
          // excluded from the eval input — see section.ts (isTable). A table is
          // eval-inert, not eval-invisible. (canvas_content_types.md)
          "table",
        ],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (el) => el.getAttribute(BLOCK_ID_ATTR),
            renderHTML: (attrs) => (attrs.blockId ? { [BLOCK_ID_ATTR]: attrs.blockId } : {}),
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
          return assignBlockIds(doc, tr) ? tr : null;
        },
      }),
    ];
  },
});
