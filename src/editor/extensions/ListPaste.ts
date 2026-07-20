import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";

/**
 * Pasting a run of line-break-separated lines into a list item used to produce
 * ONE item holding N stacked paragraphs — `listItem` content is `paragraph
 * block*`, so the pasted paragraphs nest inside the current item instead of
 * splitting it into siblings. Pasting three lines into a bullet gave
 * `<li><p>a</p><p>b</p><p>c</p></li>` rather than three bullets (UX-023).
 *
 * When the cursor is inside a list item and the pasted slice is a plain run of
 * two or more paragraphs, rewrap each paragraph as its own `listItem`. The
 * slice is returned open at depth 2 on both sides so ProseMirror merges the
 * first paragraph into the item the cursor is in and leaves the last one open
 * for the cursor — the same shape a list-to-list paste produces. Because the
 * items carry no list type of their own, they fit whichever list encloses the
 * cursor, so bullet and ordered lists both work.
 *
 * Anything else passes through untouched: a single paragraph, or a slice
 * carrying headings/tables/nested lists, keeps ProseMirror's default handling.
 */
export const ListPaste = Extension.create({
  name: "listPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("listPaste"),
        props: {
          transformPasted(slice, view) {
            const { state } = view;
            const { listItem, paragraph } = state.schema.nodes;
            if (!listItem || !paragraph) return slice;

            // Only rewrite when the cursor actually sits inside a list item.
            const $from = state.selection.$from;
            let inListItem = false;
            for (let depth = $from.depth; depth > 0; depth--) {
              if ($from.node(depth).type === listItem) {
                inListItem = true;
                break;
              }
            }
            if (!inListItem) return slice;

            const children: PMNode[] = [];
            slice.content.forEach((node) => children.push(node));

            // A run of >= 2 bare paragraphs is the case worth rewriting; mixed
            // content is left alone so richer pastes degrade predictably.
            if (children.length < 2) return slice;
            if (!children.every((node) => node.type === paragraph)) return slice;

            const items = children.map((node) => listItem.create(null, node));
            return new Slice(Fragment.from(items), 2, 2);
          },
        },
      }),
    ];
  },
});
