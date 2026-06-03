import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { BlockId } from "./extensions/BlockId";
import { ObservationHighlighter } from "./extensions/ObservationHighlighter";
import { resolveSection, resolveSections } from "./section";
import { saveDocument, loadDocument, type Observation } from "../store/db";
import { scheduleEval } from "../services/orchestrator";
import type { EvalContext } from "../services/types";
import { harness } from "../debug/harness";
import { nanoid } from "nanoid";
import { Markdown } from "tiptap-markdown";
import { SemanticPaste } from "./extensions/SemanticPaste";
const DOC_ID = "default";
const SAVE_DEBOUNCE_MS = 1000;
/** Typing-pause settle: how long of silence (on this block) before we check. */
const EVAL_DEBOUNCE_MS = 3000;
/** No edits anywhere for this long → fire doc-level checks. */
const DOC_IDLE_MS = 12000;
/** Minimum word count before doc-level checks are worth running. */
const CONTENT_THRESHOLD_WORDS = 150;

interface Props {
  apiKey?: string;
  paidKey?: string;
  stage?: string;
  observations: Observation[];
  hoveredObservationId: string | null;
  onObservationCollapsed: (id: string) => void;
  onEvaluationComplete: () => void;
  onStageSuggestion?: (suggestion: string) => void;
  /** Called whenever the ordered list of blockIds changes (document-order, top→bottom). */
  onBlockOrderChange?: (ids: string[]) => void;
  clearTrigger?: number;
  importContent?: { content: string; timestamp: number };
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

/** Total word count across all top-level blocks. Used for doc-idle gating. */
function getWordCount(editor: ReturnType<typeof useEditor>): number {
  if (!editor) return 0;
  let count = 0;
  editor.state.doc.forEach((node) => {
    count += node.textContent.split(/\s+/).filter(Boolean).length;
  });
  return count;
}

/** Live top-level blocks with their text — fed to the dev harness so an agent
 *  can read the document structure (and spot duplicate block ids). */
function getBlocksWithText(
  editor: ReturnType<typeof useEditor>,
): { id: string; text: string }[] {
  const blocks: { id: string; text: string }[] = [];
  if (!editor) return blocks;
  editor.state.doc.forEach((node) => {
    const id = node.attrs?.blockId as string | undefined;
    if (id) blocks.push({ id, text: node.textContent });
  });
  return blocks;
}

export function Editor({
  apiKey,
  paidKey,
  stage,
  observations,
  hoveredObservationId,
  onObservationCollapsed,
  onEvaluationComplete,
  onStageSuggestion,
  onBlockOrderChange,
  clearTrigger,
  importContent,
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Per-section typing-pause debounce timers (keyed by sectionId). */
  const evalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  /** Doc-idle timer: fires after DOC_IDLE_MS of no edits anywhere. */
  const docIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Representative id of the section the cursor was last in (for departure). */
  const lastActiveSectionId = useRef<string | null>(null);
  /** Previous doc block-id set, for removal detection. */
  const prevBlockIds = useRef<Set<string>>(new Set());

  // Stable refs for props used inside event listeners / timers
  const apiKeyRef = useRef(apiKey);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  const paidKeyRef = useRef(paidKey);
  useEffect(() => { paidKeyRef.current = paidKey; }, [paidKey]);
  const stageRef = useRef(stage);
  useEffect(() => { stageRef.current = stage; }, [stage]);
  const onEvaluationCompleteRef = useRef(onEvaluationComplete);
  useEffect(() => { onEvaluationCompleteRef.current = onEvaluationComplete; }, [onEvaluationComplete]);
  const onStageSuggestionRef = useRef(onStageSuggestion);
  useEffect(() => { onStageSuggestionRef.current = onStageSuggestion; }, [onStageSuggestion]);
  const onBlockOrderChangeRef = useRef(onBlockOrderChange);
  useEffect(() => { onBlockOrderChangeRef.current = onBlockOrderChange; }, [onBlockOrderChange]);
  /** Last emitted ordered blockId string, for change-detection. */
  const prevBlockOrderKeyRef = useRef<string>("");

  /** Emit the document-order blockId array whenever it changes. */
  const emitBlockOrderIfChanged = (ed: ReturnType<typeof useEditor>) => {
    const ids: string[] = [];
    ed?.state.doc.forEach((node) => {
      const id = node.attrs?.blockId as string | undefined;
      if (id) ids.push(id);
    });
    const key = ids.join("|");
    if (key !== prevBlockOrderKeyRef.current) {
      prevBlockOrderKeyRef.current = key;
      onBlockOrderChangeRef.current?.(ids);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({
        transformPastedText: true,
      }),
      SemanticPaste,
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
            paidKey: paidKeyRef.current,
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

      // --- 2b. Emit updated document-order block ids to the feed ---
      emitBlockOrderIfChanged(editor);

      // --- 3. Track cursor's section and schedule a settle-pause eval ---
      const { selection } = editor.state;
      const $pos = selection.$from;
      let blockId: string | null = null;

      if ($pos.depth >= 1) {
        const node = $pos.node(1);
        if (node?.isBlock) {
          blockId = node.attrs.blockId as string | null;
        }
      }

      const activeSection = blockId ? resolveSection(editor.state.doc, blockId) : null;
      if (activeSection) {
        const sectionId = activeSection.sectionId;

        // Reset the settle-pause timer for this section
        const existing = evalTimers.current.get(sectionId);
        if (existing) {
          clearTimeout(existing);
          evalTimers.current.delete(sectionId);
        }

        const timer = setTimeout(() => {
          evalTimers.current.delete(sectionId);

          // Re-resolve from the live doc so the eval sees the current section.
          const fresh = resolveSection(editor.state.doc, sectionId);
          if (!fresh) return;

          const hasTerminalPunc = /[.!?"]\s*$/.test(fresh.combinedText);
          const hasMinLength = fresh.combinedText.trim().length >= 15;

          if (hasTerminalPunc && hasMinLength) {
            const ctx: EvalContext = {
              docId: DOC_ID,
              apiKey: apiKeyRef.current ?? "",
              paidKey: paidKeyRef.current,
              stage: stageRef.current,
              onStageSuggestion: onStageSuggestionRef.current,
            };
            scheduleEval(
              { kind: "block-settle-pause", sectionId, members: fresh.members },
              fresh.combinedText,
              ctx,
              () => onEvaluationCompleteRef.current(),
            );
          }
        }, EVAL_DEBOUNCE_MS);

        evalTimers.current.set(sectionId, timer);
      }

      // Reset the doc-idle timer on every edit. Fires a doc-level check after
      // DOC_IDLE_MS of silence, but only when there's enough content.
      const wordCount = getWordCount(editor);
      console.log(`[TIMER-DEBUG] onUpdate fired. wordCount=${wordCount}, timerExists=${!!docIdleTimer.current}`);
      if (docIdleTimer.current) {
        clearTimeout(docIdleTimer.current);
      }
      if (wordCount >= CONTENT_THRESHOLD_WORDS) {
        docIdleTimer.current = setTimeout(() => {
          console.log(`[TIMER-DEBUG] onUpdate timer FIRED. wordCount=${getWordCount(editor)}`);
          docIdleTimer.current = null;
          const ctx: EvalContext = {
            docId: DOC_ID,
            apiKey: apiKeyRef.current ?? "",
            paidKey: paidKeyRef.current,
            stage: stageRef.current,
            onStageSuggestion: onStageSuggestionRef.current,
          };
          scheduleEval(
            { kind: "doc-idle" },
            null,
            ctx,
            () => onEvaluationCompleteRef.current(),
          );
        }, DOC_IDLE_MS);
        console.log(`[TIMER-DEBUG] onUpdate set timer id=${docIdleTimer.current}`);
      }
    },

    onSelectionUpdate({ editor }) {
      // --- Section-departure trigger ---
      // Fire when the cursor crosses into a *different* section, evaluating the
      // section just left. Typing + Enter within a section, and pasting one
      // section then the next, produce the same departure event — so paste and
      // typing flow through one path. See docs/projects/section_as_eval_unit.md.
      const { selection } = editor.state;
      const $pos = selection.$from;
      let currentBlockId: string | null = null;

      if ($pos.depth >= 1) {
        const node = $pos.node(1);
        if (node?.isBlock) {
          currentBlockId = node.attrs.blockId as string | null;
        }
      }

      const currentSectionId = currentBlockId
        ? resolveSection(editor.state.doc, currentBlockId)?.sectionId ?? null
        : null;

      const departedSectionId = lastActiveSectionId.current;
      if (departedSectionId && departedSectionId !== currentSectionId) {
        // Re-resolve the departed section from the live doc to capture its
        // current content (it still exists; only the cursor moved).
        const departed = resolveSection(editor.state.doc, departedSectionId);

        // Cancel the settle-pause timer for the departed section — the blur
        // trigger fires immediately (after coalescing).
        const timer = evalTimers.current.get(departedSectionId);
        if (timer) {
          clearTimeout(timer);
          evalTimers.current.delete(departedSectionId);
        }

        if (departed && departed.combinedText.trim().length >= 10) {
          const ctx: EvalContext = {
            docId: DOC_ID,
            apiKey: apiKeyRef.current ?? "",
            paidKey: paidKeyRef.current,
            stage: stageRef.current,
            onStageSuggestion: onStageSuggestionRef.current,
          };
          scheduleEval(
            {
              kind: "block-settle-blur",
              sectionId: departedSectionId,
              members: departed.members,
              reason: "cursor-departed",
            },
            departed.combinedText,
            ctx,
            () => onEvaluationCompleteRef.current(),
          );
        }
      }

      lastActiveSectionId.current = currentSectionId;
    },
  });

  // --- Window-blur trigger ---
  // When the user alt-tabs away while the cursor is inside a block, treat it
  // as a settle-blur so the block is evaluated on return.
  useEffect(() => {
    const handleWindowBlur = () => {
      if (!editor) return;
      const sectionId = lastActiveSectionId.current;
      if (!sectionId) return;
      const section = resolveSection(editor.state.doc, sectionId);
      if (!section || section.combinedText.trim().length < 10) return;

      // Cancel the settle-pause timer — the blur trigger takes over
      const timer = evalTimers.current.get(sectionId);
      if (timer) {
        clearTimeout(timer);
        evalTimers.current.delete(sectionId);
      }

      const ctx: EvalContext = {
        docId: DOC_ID,
        apiKey: apiKeyRef.current ?? "",
        paidKey: paidKeyRef.current,
        stage: stageRef.current,
        onStageSuggestion: onStageSuggestionRef.current,
      };
      scheduleEval(
        {
          kind: "block-settle-blur",
          sectionId,
          members: section.members,
          reason: "window-blurred",
        },
        section.combinedText,
        ctx,
        () => onEvaluationCompleteRef.current(),
      );
    };

    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      if (docIdleTimer.current) clearTimeout(docIdleTimer.current);
    };
  }, [editor]); // re-bind once the editor instance is ready

  // Register live block read + fixture-doc write with the dev harness
  // (dev-only; stripped in prod).
  useEffect(() => {
    if (!import.meta.env.DEV || !editor) return;
    harness.registerBlockReader(() => getBlocksWithText(editor));
    harness.registerDocWriter((fixture) => {
      // Mint ids up front so they're known immediately (the BlockId plugin would
      // otherwise assign them asynchronously, after we'd want to schedule evals).
      const blocks = fixture.blocks.map((b) => ({ id: b.id ?? nanoid(10), text: b.text }));
      // A leading Markdown heading (`## Foo`) seeds a real heading node so the
      // section resolver groups it with its body — mirroring how a paste lands.
      const headingMatch = (text: string) => /^(#{1,6})\s+(.*)$/.exec(text.trim());
      editor.commands.setContent({
        type: "doc",
        content: blocks.map((b) => {
          const h = headingMatch(b.text);
          if (h) {
            return {
              type: "heading",
              attrs: { blockId: b.id, level: h[1].length },
              content: [{ type: "text", text: h[2] }],
            };
          }
          return {
            type: "paragraph",
            attrs: { blockId: b.id },
            ...(b.text ? { content: [{ type: "text", text: b.text }] } : {}),
          };
        }),
      });
      // Fire one settle per *section* (heading + body) so loadDoc exercises the
      // same section pipeline as typing/paste — never an isolated heading.
      const ctx: EvalContext = {
        docId: DOC_ID,
        apiKey: apiKeyRef.current ?? "",
        paidKey: paidKeyRef.current,
        stage: stageRef.current,
        onStageSuggestion: onStageSuggestionRef.current,
      };
      prevBlockIds.current = new Set(blocks.map((b) => b.id));
      // Emit document order immediately after seeding (setContent doesn't fire onUpdate).
      emitBlockOrderIfChanged(editor);
      const sections = resolveSections(editor.state.doc);
      // Seed cursor tracking at the last section so subsequent edits depart cleanly.
      lastActiveSectionId.current = sections.length > 0 ? sections[sections.length - 1].sectionId : null;
      for (const section of sections) {
        if (section.combinedText.trim().length >= 10) {
          scheduleEval(
            { kind: "block-settle-pause", sectionId: section.sectionId, members: section.members },
            section.combinedText,
            ctx,
            () => onEvaluationCompleteRef.current(),
          );
        }
      }
      // editor.commands.setContent() does not reliably fire onUpdate in
      // programmatic (non-user-input) contexts, so the doc-idle timer set
      // inside onUpdate never arms. Arm it explicitly here when the seeded
      // document crosses the word-count threshold — the semantics are identical
      // to what onUpdate would do: 12 s of silence → doc-level checks fire.
      //
      // Defer with a 0ms timeout so this runs after any pending React effects
      // (e.g. the clearContent effect from clear()) have flushed. Without the
      // defer, a clear() + loadDoc() sequence would have the clearContent
      // onUpdate clear our timer immediately after we set it.
      const seededWordCount = blocks.reduce(
        (sum, b) => sum + b.text.split(/\s+/).filter(Boolean).length,
        0,
      );
      console.log(`[TIMER-DEBUG] docWriter setContent done. seededWordCount=${seededWordCount}, threshold=${CONTENT_THRESHOLD_WORDS}`);
      if (seededWordCount >= CONTENT_THRESHOLD_WORDS) {
        setTimeout(() => {
          console.log(`[TIMER-DEBUG] docWriter setTimeout 0ms callback running. timerExists=${!!docIdleTimer.current}`);
          if (docIdleTimer.current) {
            clearTimeout(docIdleTimer.current);
          }
          docIdleTimer.current = setTimeout(() => {
            console.log(`[TIMER-DEBUG] docWriter timer FIRED. currentWordCount=${getWordCount(editor)}`);
            docIdleTimer.current = null;
            scheduleEval(
              { kind: "doc-idle" },
              null,
              ctx,
              () => onEvaluationCompleteRef.current(),
            );
          }, DOC_IDLE_MS);
          console.log(`[TIMER-DEBUG] docWriter set timer id=${docIdleTimer.current}`);
        }, 0);
      }
    });
  }, [editor]);

  // Load persisted document on mount
  useEffect(() => {
    if (!editor) return;
    loadDocument(DOC_ID).then((record) => {
      if (record?.content) {
        editor.commands.setContent(record.content);
      }
      // setContent() may not fire onUpdate; emit order explicitly after load.
      emitBlockOrderIfChanged(editor);
    });
  }, [editor]);

  // Reset editor content when clearTrigger increments
  useEffect(() => {
    if (!editor || clearTrigger === undefined || clearTrigger === 0) return;
    editor.commands.clearContent(true);
    prevBlockIds.current = new Set();
    // Emit empty order on clear.
    emitBlockOrderIfChanged(editor);
  }, [editor, clearTrigger]);

  // Handle imported content: set doc, then fire one fast-tier section eval per
  // section so the sidecar lights up immediately. The doc-idle (strong-tier)
  // pass is intentionally NOT armed here — it fires only after the user's first
  // edit, same as any freshly opened document. BlockId's appendTransaction
  // handles ID assignment; no manual loop needed.
  useEffect(() => {
    if (!editor || !importContent) return;
    // false = don't emit update so onUpdate doesn't race with our eval dispatch below
    editor.commands.setContent(importContent.content, false);
    prevBlockIds.current = new Set();

    // BlockId's appendTransaction fires synchronously on the next state update;
    // defer by one tick so IDs are stable before we resolve sections.
    setTimeout(() => {
      if (editor.isDestroyed) return;
      const ctx: EvalContext = {
        docId: DOC_ID,
        apiKey: apiKeyRef.current ?? "",
        paidKey: paidKeyRef.current,
        stage: stageRef.current,
        onStageSuggestion: onStageSuggestionRef.current,
      };
      prevBlockIds.current = getBlockIds(editor);
      emitBlockOrderIfChanged(editor);
      const sections = resolveSections(editor.state.doc);
      for (const section of sections) {
        if (section.combinedText.trim().length >= 15) {
          scheduleEval(
            { kind: "block-settle-pause", sectionId: section.sectionId, members: section.members },
            section.combinedText,
            ctx,
            () => onEvaluationCompleteRef.current(),
          );
        }
      }
    }, 0);
  }, [editor, importContent]);

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
