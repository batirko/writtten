import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlockId } from "./extensions/BlockId";
import { ObservationHighlighter } from "./extensions/ObservationHighlighter";
import { saveDocument, loadDocument, type Observation } from "../store/db";
import { scheduleEval } from "../services/orchestrator";
import type { EvalContext } from "../services/types";

const DOC_ID = "default";
const SAVE_DEBOUNCE_MS = 1000;
/** Typing-pause settle: how long of silence (on this block) before we check. */
const EVAL_DEBOUNCE_MS = 3000;

interface Props {
  apiKey?: string;
  stage?: string;
  observations: Observation[];
  hoveredObservationId: string | null;
  onObservationCollapsed: (id: string) => void;
  onEvaluationComplete: () => void;
  clearTrigger?: number;
}

/** Extract the set of blockIds currently present in the document. */
function getBlockIds(editor: ReturnType<typeof useEditor>): Set<string> {
  const ids = new Set<string>();
  if (!editor) return ids;
  editor.state.doc.forEach((node) => {
    const id = node.attrs?.blockId as string | undefined;
    if (id) ids.add(id);
  });
  return ids;
}

export function Editor({
  apiKey,
  stage,
  observations,
  hoveredObservationId,
  onObservationCollapsed,
  onEvaluationComplete,
  clearTrigger,
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Per-block typing-pause debounce timers. */
  const evalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const lastActiveBlockId = useRef<string | null>(null);
  const lastActiveBlockText = useRef<string>("");
  /** Previous doc block-id set, for removal detection. */
  const prevBlockIds = useRef<Set<string>>(new Set());

  // Stable refs for props used inside event listeners / timers
  const apiKeyRef = useRef(apiKey);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  const stageRef = useRef(stage);
  useEffect(() => { stageRef.current = stage; }, [stage]);
  const onEvaluationCompleteRef = useRef(onEvaluationComplete);
  useEffect(() => { onEvaluationCompleteRef.current = onEvaluationComplete; }, [onEvaluationComplete]);

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
      // --- 1. Debounced save ---
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDocument({
          id: DOC_ID,
          content: editor.getJSON(),
          updatedAt: Date.now(),
        });
      }, SAVE_DEBOUNCE_MS);

      // --- 2. Detect removed blocks and fire block-removed triggers ---
      const currentBlockIds = getBlockIds(editor);
      for (const id of prevBlockIds.current) {
        if (!currentBlockIds.has(id)) {
          const ctx: EvalContext = {
            docId: DOC_ID,
            apiKey: apiKeyRef.current ?? "",
            stage: stageRef.current,
          };
          scheduleEval(
            { kind: "block-removed", blockId: id },
            null,
            ctx,
            () => onEvaluationCompleteRef.current(),
          );
        }
      }
      prevBlockIds.current = currentBlockIds;

      // --- 3. Track cursor position and schedule settle-pause eval ---
      const { selection } = editor.state;
      const $pos = selection.$from;
      let blockId: string | null = null;
      let blockText = "";

      if ($pos.depth >= 1) {
        const node = $pos.node(1);
        if (node?.isBlock) {
          blockId = node.attrs.blockId as string | null;
          blockText = node.textContent;
        }
      }

      if (blockId) {
        lastActiveBlockText.current = blockText;

        // Reset the settle-pause timer for this block
        const existing = evalTimers.current.get(blockId);
        if (existing) {
          clearTimeout(existing);
          evalTimers.current.delete(blockId);
        }

        const capturedBlockId = blockId;
        const capturedText = blockText;
        const timer = setTimeout(() => {
          evalTimers.current.delete(capturedBlockId);

          const hasTerminalPunc = /[.!?"]\s*$/.test(capturedText);
          const hasMinLength = capturedText.trim().length >= 15;

          if (hasTerminalPunc && hasMinLength) {
            const ctx: EvalContext = {
              docId: DOC_ID,
              apiKey: apiKeyRef.current ?? "",
              stage: stageRef.current,
            };
            scheduleEval(
              { kind: "block-settle-pause", blockId: capturedBlockId },
              capturedText,
              ctx,
              () => onEvaluationCompleteRef.current(),
            );
          }
        }, EVAL_DEBOUNCE_MS);

        evalTimers.current.set(blockId, timer);
      }
    },

    onSelectionUpdate({ editor }) {
      // --- Cursor-departure trigger ---
      const { selection } = editor.state;
      const $pos = selection.$from;
      let currentBlockId: string | null = null;
      let currentBlockText = "";

      if ($pos.depth >= 1) {
        const node = $pos.node(1);
        if (node?.isBlock) {
          currentBlockId = node.attrs.blockId as string | null;
          currentBlockText = node.textContent;
        }
      }

      const departedBlockId = lastActiveBlockId.current;
      if (departedBlockId && departedBlockId !== currentBlockId) {
        const departedText = lastActiveBlockText.current;

        // Cancel the settle-pause timer for the departed block — the blur
        // trigger fires immediately (after coalescing), so no need for the
        // 3 s wait on top.
        const timer = evalTimers.current.get(departedBlockId);
        if (timer) {
          clearTimeout(timer);
          evalTimers.current.delete(departedBlockId);
        }

        if (departedText.trim().length >= 10) {
          const ctx: EvalContext = {
            docId: DOC_ID,
            apiKey: apiKeyRef.current ?? "",
            stage: stageRef.current,
          };
          scheduleEval(
            { kind: "block-settle-blur", blockId: departedBlockId, reason: "cursor-departed" },
            departedText,
            ctx,
            () => onEvaluationCompleteRef.current(),
          );
        }
      }

      lastActiveBlockId.current = currentBlockId;
      lastActiveBlockText.current = currentBlockText;
    },
  });

  // --- Window-blur trigger ---
  // When the user alt-tabs away while the cursor is inside a block, treat it
  // as a settle-blur so the block is evaluated on return.
  useEffect(() => {
    const handleWindowBlur = () => {
      const blockId = lastActiveBlockId.current;
      const text = lastActiveBlockText.current;
      if (!blockId || text.trim().length < 10) return;

      // Cancel the settle-pause timer — the blur trigger takes over
      const timer = evalTimers.current.get(blockId);
      if (timer) {
        clearTimeout(timer);
        evalTimers.current.delete(blockId);
      }

      const ctx: EvalContext = {
        docId: DOC_ID,
        apiKey: apiKeyRef.current ?? "",
        stage: stageRef.current,
      };
      scheduleEval(
        { kind: "block-settle-blur", blockId, reason: "window-blurred" },
        text,
        ctx,
        () => onEvaluationCompleteRef.current(),
      );
    };

    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, []); // refs are stable — no deps needed

  // Load persisted document on mount
  useEffect(() => {
    if (!editor) return;
    loadDocument(DOC_ID).then((record) => {
      if (record?.content) {
        editor.commands.setContent(record.content);
      }
    });
  }, [editor]);

  // Reset editor content when clearTrigger increments
  useEffect(() => {
    if (!editor || clearTrigger === undefined || clearTrigger === 0) return;
    editor.commands.clearContent(true);
    prevBlockIds.current = new Set();
  }, [editor, clearTrigger]);

  // Sync observations with the highlighter extension
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta("setObservations", observations));
  }, [editor, observations]);

  // Sync hovered observation with the highlighter extension
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(
      editor.state.tr.setMeta("setHoveredObservationId", hoveredObservationId),
    );
  }, [editor, hoveredObservationId]);

  return (
    <div className="editor-wrap">
      <EditorContent editor={editor} />
    </div>
  );
}
