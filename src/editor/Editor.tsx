import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { BlockId } from "./extensions/BlockId";
import { ObservationHighlighter } from "./extensions/ObservationHighlighter";
import { SlashMenu } from "./extensions/SlashMenu";
import { EditorBubbleMenu } from "./menus/BubbleMenu";
import { resolveSection, resolveSections } from "./section";
import { saveDocument, loadDocument, type Observation } from "../store/db";
import { scheduleEval } from "../services/orchestrator";
import type { EvalContext } from "../services/types";
import type { ModelCapability } from "../model/capability";
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
  /** Model capability (decoupled from the credential) — threaded into every
   *  EvalContext so the evaluator branches on it. See byok_capability_model.md. */
  capability?: ModelCapability;
  stage?: string;
  /** Terms that should never be flagged as undefined jargon (in addition to
   *  the hardcoded preset). One entry per term; case-insensitive. */
  jargonAllowlist?: string[];
  observations: Observation[];
  hoveredObservationId: string | null;
  onObservationCollapsed: (id: string) => void;
  onEvaluationComplete: () => void;
  onStageSuggestion?: (suggestion: string) => void;
  /** Called whenever the ordered list of blockIds changes (document-order, top→bottom). */
  onBlockOrderChange?: (ids: string[]) => void;
  clearTrigger?: number;
  importContent?: { content: string; timestamp: number };
  onReady?: (editor: import("@tiptap/react").Editor) => void;
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
function getBlocksWithText(editor: ReturnType<typeof useEditor>): { id: string; text: string }[] {
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
  capability,
  stage,
  jargonAllowlist,
  observations,
  hoveredObservationId,
  onObservationCollapsed,
  onEvaluationComplete,
  onStageSuggestion,
  onBlockOrderChange,
  clearTrigger,
  importContent,
  onReady,
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
  /** Set by handlePaste so the next onUpdate dispatches a per-section bulk eval
   *  instead of the normal single-section pause. See bulk_paste_evaluation.md. */
  const pastePendingRef = useRef(false);

  // Stable refs for props used inside event listeners / timers
  const apiKeyRef = useRef(apiKey);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);
  const paidKeyRef = useRef(paidKey);
  useEffect(() => {
    paidKeyRef.current = paidKey;
  }, [paidKey]);
  const capabilityRef = useRef(capability);
  useEffect(() => {
    capabilityRef.current = capability;
  }, [capability]);
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  const jargonAllowlistRef = useRef(jargonAllowlist);
  useEffect(() => {
    jargonAllowlistRef.current = jargonAllowlist;
  }, [jargonAllowlist]);
  const onEvaluationCompleteRef = useRef(onEvaluationComplete);
  useEffect(() => {
    onEvaluationCompleteRef.current = onEvaluationComplete;
  }, [onEvaluationComplete]);
  const onStageSuggestionRef = useRef(onStageSuggestion);
  useEffect(() => {
    onStageSuggestionRef.current = onStageSuggestion;
  }, [onStageSuggestion]);
  const onBlockOrderChangeRef = useRef(onBlockOrderChange);
  useEffect(() => {
    onBlockOrderChangeRef.current = onBlockOrderChange;
  }, [onBlockOrderChange]);
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
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
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
      Link.configure({
        openOnClick: false,
        autolink: false,
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: { rel: "noopener nofollow" },
      }),
      SlashMenu,
    ],
    content: "",
    editorProps: {
      attributes: { class: "tiptap", "aria-label": "Document" },
      // Flag a paste so the next onUpdate treats it as a bulk insert and fires
      // one fast-tier eval per pasted section (not just the cursor's section).
      // Return false: let ProseMirror insert the content normally.
      handlePaste() {
        pastePendingRef.current = true;
        return false;
      },
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
            capability: capabilityRef.current,
            stage: stageRef.current,
            jargonAllowlist: jargonAllowlistRef.current,
          };
          scheduleEval({ kind: "block-removed", blockId: id }, null, ctx, () =>
            onEvaluationCompleteRef.current()
          );
        }
      }
      prevBlockIds.current = currentBlockIds;

      // --- 2b. Emit updated document-order block ids to the feed ---
      emitBlockOrderIfChanged(editor);

      // --- 2c. Bulk paste: fire one fast-tier eval per pasted section ---
      // A single paste lands the cursor in just the last section, so the normal
      // single-section path (step 3) would leave every section above it
      // unevaluated. Dispatch all sections fast-tier (skipContradiction) and let
      // the block-paste sweep cover contradiction once the ledger is built.
      // See docs/projects/bulk_paste_evaluation.md.
      if (pastePendingRef.current) {
        pastePendingRef.current = false;
        // Defer one tick so BlockId's appendTransaction has assigned ids.
        setTimeout(() => {
          if (editor.isDestroyed) return;
          const ctx: EvalContext = {
            docId: DOC_ID,
            apiKey: apiKeyRef.current ?? "",
            paidKey: paidKeyRef.current,
            capability: capabilityRef.current,
            stage: stageRef.current,
            jargonAllowlist: jargonAllowlistRef.current,
            onStageSuggestion: onStageSuggestionRef.current,
            skipContradiction: true,
          };
          prevBlockIds.current = getBlockIds(editor);
          const sections = resolveSections(editor.state.doc);
          lastActiveSectionId.current =
            sections.length > 0 ? sections[sections.length - 1].sectionId : null;
          for (const section of sections) {
            if (section.combinedText.trim().length >= 15) {
              scheduleEval(
                {
                  kind: "block-settle-pause",
                  sectionId: section.sectionId,
                  members: section.members,
                },
                section.combinedText,
                ctx,
                () => onEvaluationCompleteRef.current()
              );
            }
          }
          // Once the ledger is built, run a single contradiction sweep — but
          // only once the draft crosses the doc-level content threshold.
          if (getWordCount(editor) >= CONTENT_THRESHOLD_WORDS) {
            scheduleEval(
              { kind: "block-paste", blockIds: [...prevBlockIds.current] },
              null,
              ctx,
              () => onEvaluationCompleteRef.current()
            );
          }
        }, 0);
        return;
      }

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
              capability: capabilityRef.current,
              stage: stageRef.current,
              jargonAllowlist: jargonAllowlistRef.current,
              onStageSuggestion: onStageSuggestionRef.current,
            };
            scheduleEval(
              { kind: "block-settle-pause", sectionId, members: fresh.members },
              fresh.combinedText,
              ctx,
              () => onEvaluationCompleteRef.current()
            );
          }
        }, EVAL_DEBOUNCE_MS);

        evalTimers.current.set(sectionId, timer);
      }

      // Reset the doc-idle timer on every edit. Fires a doc-level check after
      // DOC_IDLE_MS of silence, but only when there's enough content.
      const wordCount = getWordCount(editor);
      if (docIdleTimer.current) {
        clearTimeout(docIdleTimer.current);
      }
      if (wordCount >= CONTENT_THRESHOLD_WORDS) {
        docIdleTimer.current = setTimeout(() => {
          docIdleTimer.current = null;
          const ctx: EvalContext = {
            docId: DOC_ID,
            apiKey: apiKeyRef.current ?? "",
            paidKey: paidKeyRef.current,
            capability: capabilityRef.current,
            stage: stageRef.current,
            jargonAllowlist: jargonAllowlistRef.current,
            onStageSuggestion: onStageSuggestionRef.current,
          };
          scheduleEval({ kind: "doc-idle" }, null, ctx, () => onEvaluationCompleteRef.current());
        }, DOC_IDLE_MS);
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
        ? (resolveSection(editor.state.doc, currentBlockId)?.sectionId ?? null)
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
            capability: capabilityRef.current,
            stage: stageRef.current,
            jargonAllowlist: jargonAllowlistRef.current,
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
            () => onEvaluationCompleteRef.current()
          );
        }
      }

      lastActiveSectionId.current = currentSectionId;
    },
  });

  useEffect(() => {
    const handleCardActivate = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      const { id } = customEvent.detail;
      if (!editor || !id) return;

      const el = editor.view.dom.querySelector(`.obs-highlight[data-obs-id="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const pos = editor.view.posAtDOM(el, 0);
        if (pos >= 0) {
          editor.commands.setTextSelection(pos);
          editor.view.focus();
        }
      }
    };
    window.addEventListener("obs-card-activate", handleCardActivate);
    return () => window.removeEventListener("obs-card-activate", handleCardActivate);
  }, [editor]);

  // Cleanup: cancel any pending doc-idle timer when the editor instance changes
  // or the component unmounts. Alt-tab (window blur) no longer triggers a settle —
  // that was causing premature evaluations and 4-6 paid invocations per paste
  // (OBS-014, OBS-020). Settles now fire only on cursor-departure, typing-pause,
  // and doc-idle.
  useEffect(() => {
    return () => {
      if (docIdleTimer.current) clearTimeout(docIdleTimer.current);
    };
  }, [editor]);

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
        capability: capabilityRef.current,
        stage: stageRef.current,
        onStageSuggestion: onStageSuggestionRef.current,
      };
      prevBlockIds.current = new Set(blocks.map((b) => b.id));
      // Emit document order immediately after seeding (setContent doesn't fire onUpdate).
      emitBlockOrderIfChanged(editor);
      const sections = resolveSections(editor.state.doc);
      // Seed cursor tracking at the last section so subsequent edits depart cleanly.
      lastActiveSectionId.current =
        sections.length > 0 ? sections[sections.length - 1].sectionId : null;
      for (const section of sections) {
        if (section.combinedText.trim().length >= 10) {
          scheduleEval(
            { kind: "block-settle-pause", sectionId: section.sectionId, members: section.members },
            section.combinedText,
            ctx,
            () => onEvaluationCompleteRef.current()
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
        0
      );
      console.log(
        `[TIMER-DEBUG] docWriter setContent done. seededWordCount=${seededWordCount}, threshold=${CONTENT_THRESHOLD_WORDS}`
      );
      if (seededWordCount >= CONTENT_THRESHOLD_WORDS) {
        setTimeout(() => {
          console.log(
            `[TIMER-DEBUG] docWriter setTimeout 0ms callback running. timerExists=${!!docIdleTimer.current}`
          );
          if (docIdleTimer.current) {
            clearTimeout(docIdleTimer.current);
          }
          docIdleTimer.current = setTimeout(() => {
            console.log(
              `[TIMER-DEBUG] docWriter timer FIRED. currentWordCount=${getWordCount(editor)}`
            );
            docIdleTimer.current = null;
            scheduleEval({ kind: "doc-idle" }, null, ctx, () => onEvaluationCompleteRef.current());
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
  // section so the sidecar lights up immediately. Like bulk paste, these run
  // skipContradiction — a single block-paste sweep covers contradiction once the
  // ledger is built (avoids N paid-tier calls per import). The doc-idle
  // (strong-tier) pass is intentionally NOT armed here — it fires only after the
  // user's first edit, same as any freshly opened document. BlockId's
  // appendTransaction handles ID assignment; no manual loop needed.
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
        capability: capabilityRef.current,
        stage: stageRef.current,
        onStageSuggestion: onStageSuggestionRef.current,
        skipContradiction: true,
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
            () => onEvaluationCompleteRef.current()
          );
        }
      }
      // Cover contradiction with a single ledger sweep once past threshold.
      if (getWordCount(editor) >= CONTENT_THRESHOLD_WORDS) {
        scheduleEval({ kind: "block-paste", blockIds: [...prevBlockIds.current] }, null, ctx, () =>
          onEvaluationCompleteRef.current()
        );
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
    editor.view.dispatch(editor.state.tr.setMeta("setHoveredObservationId", hoveredObservationId));
  }, [editor, hoveredObservationId]);

  // Notify parent that editor is ready
  useEffect(() => {
    if (editor && onReady) {
      onReady(editor);
    }
  }, [editor, onReady]);

  return (
    <div className="editor-wrap">
      {editor && <EditorBubbleMenu editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
