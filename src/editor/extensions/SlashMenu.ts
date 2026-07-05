import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import SlashMenuRenderer from "../menus/SlashMenuRenderer";
import type { SlashMenuHandle } from "../menus/SlashMenuRenderer";

export type SlashItem = {
  label: string;
  hint: string;
  command: (props: { editor: Editor; range: Range }) => void;
};

const ITEMS: SlashItem[] = [
  {
    label: "Heading 1",
    hint: "#",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    label: "Heading 2",
    hint: "##",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    label: "Heading 3",
    hint: "###",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    label: "Bullet list",
    hint: "-",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    hint: "1.",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    label: "Quote",
    hint: ">",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setBlockquote().run(),
  },
  {
    label: "Code block",
    hint: "```",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  {
    label: "Divider",
    hint: "---",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    label: "Table",
    hint: "▦",
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
];

export const SlashMenu = Extension.create({
  name: "slashMenu",

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        startOfLine: true,
        allow({ state }) {
          // Only activate inside a plain paragraph (not inside headings, lists, etc.)
          return state.selection.$from.parent.type.name === "paragraph";
        },
        items({ query }) {
          return ITEMS.filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase())
          );
        },
        command({ editor, range, props }) {
          (props as SlashItem).command({ editor, range });
        },
        render() {
          let renderer: ReactRenderer;
          let popup: HTMLElement;

          function reposition(clientRect: (() => DOMRect | null) | null | undefined) {
            if (!popup || !clientRect) return;
            const rect = clientRect();
            if (!rect) return;
            popup.style.left = `${rect.left}px`;
            popup.style.top = `${rect.bottom + 4}px`;
          }

          return {
            onStart(props) {
              renderer = new ReactRenderer(SlashMenuRenderer, {
                props,
                editor: props.editor,
              });
              popup = renderer.element as HTMLElement;
              popup.style.cssText = "position:fixed;z-index:9999;";
              document.body.appendChild(popup);
              reposition(props.clientRect);
            },

            onUpdate(props) {
              renderer.updateProps(props);
              reposition(props.clientRect);
            },

            onKeyDown({ event }) {
              if (event.key === "Escape") {
                popup.style.display = "none";
                return true;
              }
              return (renderer.ref as SlashMenuHandle | null)?.onKeyDown(event) ?? false;
            },

            onExit() {
              renderer.destroy();
              popup.remove();
            },
          };
        },
      }),
    ];
  },
});
