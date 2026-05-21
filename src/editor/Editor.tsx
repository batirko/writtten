import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlockId } from "./extensions/BlockId";
import { saveDocument, loadDocument } from "../store/db";

const DOC_ID = "default";
const SAVE_DEBOUNCE_MS = 1000;

interface Props {
  onBlockSettle?: (blockId: string, text: string) => void;
}

export function Editor({ onBlockSettle: _onBlockSettle }: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, BlockId],
    content: "<p>Start writing…</p>",
    editorProps: {
      attributes: { class: "tiptap" },
    },
    onUpdate({ editor }) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDocument({
          id: DOC_ID,
          content: editor.getJSON(),
          updatedAt: Date.now(),
        });
      }, SAVE_DEBOUNCE_MS);
    },
  });

  // Load persisted document on mount
  useEffect(() => {
    if (!editor) return;
    loadDocument(DOC_ID).then((record) => {
      if (record?.content) {
        editor.commands.setContent(record.content);
      }
    });
  }, [editor]);

  return (
    <div className="editor-wrap">
      <EditorContent editor={editor} />
    </div>
  );
}
