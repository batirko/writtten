import { useState } from "react";
import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { LinkPopover } from "./LinkPopover";

interface Props {
  editor: Editor;
}

export function EditorBubbleMenu({ editor }: Props) {
  const [linkOpen, setLinkOpen] = useState(false);

  function shouldShow() {
    const { selection, doc } = editor.state;
    if (selection.empty) return false;
    if (selection instanceof NodeSelection) return false;
    if (editor.isActive("codeBlock")) return false;
    // Exclude empty selections that land inside a code block node
    const { $from } = selection;
    if ($from.parent.type.name === "codeBlock") return false;
    // Ensure there's actual text selected
    const text = doc.textBetween(selection.from, selection.to, "");
    return text.length > 0;
  }

  const btnClass = (name: string, attrs?: Record<string, unknown>) =>
    `bubble-btn${editor.isActive(name, attrs) ? " is-active" : ""}`;

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 120, placement: "top" }}
      shouldShow={shouldShow}
    >
      <div data-testid="bubble-menu" className="bubble-menu">
        <button
          data-testid="bubble-bold"
          className={btnClass("bold")}
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
        >
          <strong>B</strong>
        </button>
        <button
          data-testid="bubble-italic"
          className={btnClass("italic")}
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleItalic().run();
          }}
        >
          <em>I</em>
        </button>
        <button
          data-testid="bubble-strike"
          className={btnClass("strike")}
          aria-label="Strikethrough"
          aria-pressed={editor.isActive("strike")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleStrike().run();
          }}
        >
          <s>S</s>
        </button>
        <button
          data-testid="bubble-code"
          className={btnClass("code")}
          aria-label="Inline code"
          aria-pressed={editor.isActive("code")}
          onMouseDown={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleCode().run();
          }}
        >
          {"</>"}
        </button>
        <div className="bubble-divider" />
        <button
          data-testid="bubble-link"
          className={btnClass("link")}
          aria-label="Link"
          aria-pressed={editor.isActive("link")}
          onMouseDown={(e) => {
            e.preventDefault();
            setLinkOpen((v) => !v);
          }}
        >
          🔗
        </button>
        {linkOpen && (
          <LinkPopover
            editor={editor}
            onClose={() => setLinkOpen(false)}
          />
        )}
      </div>
    </BubbleMenu>
  );
}
