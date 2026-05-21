import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlockId } from "./extensions/BlockId";
import { ObservationHighlighter } from "./extensions/ObservationHighlighter";
import { saveDocument, loadDocument, type Observation } from "../store/db";
import { evaluateBlock } from "../services/evaluator";

const DOC_ID = "default";
const SAVE_DEBOUNCE_MS = 1000;
const EVAL_DEBOUNCE_MS = 3000;

interface Props {
  apiKey?: string;
  stage?: string;
  observations: Observation[];
  hoveredObservationId: string | null;
  onObservationCollapsed: (id: string) => void;
  onEvaluationComplete: () => void;
}

export function Editor({
  apiKey,
  stage,
  observations,
  hoveredObservationId,
  onObservationCollapsed,
  onEvaluationComplete,
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const lastActiveBlockId = useRef<string | null>(null);
  const lastActiveBlockText = useRef<string>("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      BlockId,
      ObservationHighlighter.configure({
        onObservationCollapsed(id) {
          onObservationCollapsed(id);
        },
      }),
    ],
    content: "<p>Start writing…</p>",
    editorProps: {
      attributes: { class: "tiptap" },
    },
    onUpdate({ editor }) {
      // 1. Debounced save of the whole document
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDocument({
          id: DOC_ID,
          content: editor.getJSON(),
          updatedAt: Date.now(),
        });
      }, SAVE_DEBOUNCE_MS);

      // 2. Track current block text changes and handle typing pause settle trigger
      const { selection } = editor.state;
      const $pos = selection.$from;
      let blockId = null;
      let blockText = "";

      if ($pos.depth >= 1) {
        const node = $pos.node(1);
        if (node && node.isBlock) {
          blockId = node.attrs.blockId;
          blockText = node.textContent;
        }
      }

      if (blockId) {
        lastActiveBlockText.current = blockText;

        // Clear existing evaluation timer for this block
        const existingTimer = evalTimers.current.get(blockId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          evalTimers.current.delete(blockId);
        }

        // Set a new timer for the typing pause trigger
        const timer = setTimeout(async () => {
          evalTimers.current.delete(blockId);
          // Check terminal punctuation & min length
          const hasTerminalPunc = /[.!?"]\s*$/.test(blockText);
          const hasMinLength = blockText.trim().length >= 15;

          if (hasTerminalPunc && hasMinLength) {
            await evaluateBlock(DOC_ID, blockId, blockText, stage, apiKey);
            onEvaluationComplete();
          }
        }, EVAL_DEBOUNCE_MS);

        evalTimers.current.set(blockId, timer);
      }
    },

    onSelectionUpdate({ editor }) {
      // Handle cursor departure trigger
      const { selection } = editor.state;
      const $pos = selection.$from;
      let currentBlockId = null;
      let currentBlockText = "";

      if ($pos.depth >= 1) {
        const node = $pos.node(1);
        if (node && node.isBlock) {
          currentBlockId = node.attrs.blockId;
          currentBlockText = node.textContent;
        }
      }

      const departedBlockId = lastActiveBlockId.current;
      if (departedBlockId && departedBlockId !== currentBlockId) {
        // User departed from a block! Evaluate it immediately
        const departedText = lastActiveBlockText.current;

        // Clear any pending typing-pause timer for the departed block to prevent double evaluation
        const timer = evalTimers.current.get(departedBlockId);
        if (timer) {
          clearTimeout(timer);
          evalTimers.current.delete(departedBlockId);
        }

        if (departedText.trim().length >= 10) {
          evaluateBlock(DOC_ID, departedBlockId, departedText, stage, apiKey).then(() => {
            onEvaluationComplete();
          });
        }
      }

      lastActiveBlockId.current = currentBlockId;
      lastActiveBlockText.current = currentBlockText;
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

  // Sync observations with the highlighter extension
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta("setObservations", observations));
  }, [editor, observations]);

  // Sync hovered observation with the highlighter extension
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta("setHoveredObservationId", hoveredObservationId));
  }, [editor, hoveredObservationId]);

  return (
    <div className="editor-wrap">
      <EditorContent editor={editor} />
    </div>
  );
}
