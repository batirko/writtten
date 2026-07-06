import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { BlockId } from "./extensions/BlockId";
import {
  ObservationHighlighter,
  charOffsetToPmPos,
  reanchorOffset,
} from "./extensions/ObservationHighlighter";
import { SlashMenu } from "./extensions/SlashMenu";
import { EditorBubbleMenu } from "./menus/BubbleMenu";
import { TableMenu } from "./menus/TableMenu";
import { ContradictionPeek } from "./ContradictionPeek";
import { bothSpansFit } from "./spanFit";
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

/** Reverse hover (UX-006): how long the pointer must rest on a highlighted span
 *  before its card surfaces — long enough that a mouse merely crossing the
 *  document fires nothing, short enough to feel intentional. */
const SPAN_HOVER_DWELL_MS = 600;

/** Activation pulse duration (UX-009 / C2) — matches the `obsPulse` keyframe. */
const PULSE_MS = 1200;

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
  /** Ids of observations surfaced in the feed budget — only these get a visible
   *  highlight (downgraded ones render an invisible anchor). See UX-006/R7b. */
  surfacedIds?: Set<string>;
  hoveredObservationId: string | null;
  /** Reverse hover (UX-006): fires the observation id of a highlighted span the
   *  pointer has *dwelled* on (see SPAN_HOVER_DWELL_MS), or null on leave. */
  onSpanHover?: (obsId: string | null) => void;
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
  surfacedIds,
  hoveredObservationId,
  onSpanHover,
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
      // Tables are editable but eval-inert: the top-level `table` node carries a
      // blockId (BlockId whitelist) so section boundaries stay correct, while
      // section.ts excludes its cell text from the eval input. resizable:false
      // keeps v1 simple. See docs/projects/canvas_content_types.md.
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
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
      // A net gain in top-level blocks means a block was just added — the
      // signature of pressing Enter to complete a paragraph. Captured before
      // prevBlockIds is overwritten below; used by the block-completion trigger
      // in step 3 (UX-013).
      const blockAdded = currentBlockIds.size > prevBlockIds.current.size;
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

        // --- 3a. Parallel block-completion trigger (UX-013) ---
        // Pressing Enter to finish a paragraph adds a block but keeps the cursor
        // inside the *same* section, so the cursor-departure trigger never fires
        // and only the 3s pause would eventually pick it up — the feed feels
        // unresponsive while drafting a single-heading doc. When a block was just
        // added (Enter/split, not the bulk-paste path, which returned above) and
        // the section reads as settled — terminal punctuation + min length, the
        // same gates the pause timer applies so Invariant #4 (quiet while
        // generating) still holds — dispatch the section eval immediately, in
        // parallel with the pause timer below. Coalescing (250 ms window) + the
        // evaluateSection hash short-circuit collapse the double-fire into a
        // single dispatch with no redundant model call.
        if (blockAdded) {
          const hasTerminalPunc = /[.!?"]\s*$/.test(activeSection.combinedText);
          const hasMinLength = activeSection.combinedText.trim().length >= 15;
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
              { kind: "block-settle-completion", sectionId, members: activeSection.members },
              activeSection.combinedText,
              ctx,
              () => onEvaluationCompleteRef.current()
            );
          }
        }

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

  // --- Card activation → scroll-to-span + pulse (C2), and the distant-
  // contradiction peek (UX-009). ---
  // `pinned` = opened by a feed-card click (scrolls, interactive: Jump + ×,
  // dismissed on Escape/scroll). `hover` = a transient read-only glance opened by
  // dwelling on a cross-claim span (no scroll, no controls, fades on hover-end).
  const [peek, setPeek] = useState<{
    quote: string;
    top: number;
    left: number;
    mode: "pinned" | "hover";
  } | null>(null);
  /** Mirror of `peek?.mode` for the [editor]-deps hover listener to read. */
  const peekModeRef = useRef<"pinned" | "hover" | null>(null);
  useEffect(() => {
    peekModeRef.current = peek?.mode ?? null;
  }, [peek]);
  /** Positions + texts for the active contradiction, so Jump can flip sides. */
  const peekSpans = useRef<{
    primaryStart: number;
    conflictingStart: number;
    primaryText: string;
    conflictingText: string;
    anchor: "primary" | "conflicting";
  } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observationsRef = useRef(observations);
  useEffect(() => {
    observationsRef.current = observations;
  }, [observations]);

  const prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /** Absolute PM start position of a span (block + char offset), re-anchored. */
  const spanStartPos = useCallback(
    (blockId: string, startOffset: number, endOffset: number, anchorText?: string): number | null => {
      if (!editor) return null;
      const doc = editor.state.doc;
      let blockPos: number | null = null;
      doc.descendants((node, pos) => {
        if (blockPos !== null) return false;
        if (doc.resolve(pos).depth === 0 && node.isBlock && node.attrs.blockId === blockId) {
          blockPos = pos;
          return false;
        }
      });
      if (blockPos === null) return null;
      const blockNode = doc.nodeAt(blockPos);
      if (!blockNode) return null;
      const len = blockNode.textContent.length;
      const re = reanchorOffset(blockNode.textContent, anchorText ?? "", startOffset, endOffset);
      const raw = Math.max(0, Math.min(re.start, len));
      return charOffsetToPmPos(blockNode, blockPos, raw, false);
    },
    [editor]
  );

  const scrollToPos = useCallback(
    (pos: number) => {
      if (!editor) return;
      editor.commands.setTextSelection(pos);
      const el = editor.view.domAtPos(pos)?.node as HTMLElement | undefined;
      const target = el?.nodeType === 1 ? el : el?.parentElement;
      target?.scrollIntoView?.({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    },
    [editor]
  );

  const pulse = useCallback(
    (id: string) => {
      if (!editor) return;
      editor.view.dispatch(editor.state.tr.setMeta("setPulseObsId", id));
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => {
        if (editor && !editor.isDestroyed) {
          editor.view.dispatch(editor.state.tr.setMeta("setPulseObsId", null));
        }
      }, PULSE_MS);
    },
    [editor]
  );

  const dismissPeek = useCallback(() => {
    peekSpans.current = null;
    setPeek(null);
  }, []);

  /** Float the peek quoting the span *other* than `anchor`, placed under the
   *  anchor span. `scroll` (default true) navigates to the anchor first — off for
   *  the hover glance, where the user is already looking at it. `mode` tags the
   *  peek pinned (interactive) vs hover (read-only, fades on hover-end). */
  const anchorPeek = useCallback(
    (
      anchor: "primary" | "conflicting",
      { scroll = true, mode = "pinned" as "pinned" | "hover" } = {}
    ) => {
      const s = peekSpans.current;
      if (!s || !editor) return;
      const anchorPos = anchor === "primary" ? s.primaryStart : s.conflictingStart;
      const quote = anchor === "primary" ? s.conflictingText : s.primaryText;
      s.anchor = anchor;
      if (scroll) scrollToPos(anchorPos);
      // Place the peek under the anchor span — flip above if it would overflow the
      // viewport bottom. When scrolling, wait for the smooth scroll to settle.
      const place = () => {
        if (!editor || editor.isDestroyed) return;
        const coords = editor.view.coordsAtPos(anchorPos);
        const PEEK_W = 280;
        const EST_H = 132;
        const below = coords.bottom + 8;
        const flip = below + EST_H > window.innerHeight;
        const top = flip ? Math.max(8, coords.top - EST_H - 8) : below;
        const left = Math.min(Math.max(8, coords.left), window.innerWidth - PEEK_W - 8);
        setPeek({ quote, top, left, mode });
      };
      if (!scroll || prefersReducedMotion()) place();
      else setTimeout(place, 260);
    },
    [editor, scrollToPos]
  );

  const activateObservation = useCallback(
    (id: string) => {
      if (!editor) return;
      const obs = observationsRef.current.find((o) => o.id === id);
      if (!obs || !obs.blockId) {
        dismissPeek();
        return;
      }
      const primaryStart = spanStartPos(
        obs.blockId,
        obs.startOffset ?? 0,
        obs.endOffset ?? 9999,
        obs.anchorText
      );
      if (primaryStart === null) return;
      pulse(id);

      // Contradiction / tension: measure both spans; peek only when they can't
      // share the viewport. Otherwise a plain scroll + dual-pulse suffices.
      if (obs.conflictingBlockId) {
        const conflictingStart = spanStartPos(
          obs.conflictingBlockId,
          obs.conflictingStartOffset ?? 0,
          obs.conflictingEndOffset ?? 9999,
          obs.conflictingAnchorText
        );
        if (conflictingStart !== null) {
          const aTop = editor.view.coordsAtPos(primaryStart).top;
          const bTop = editor.view.coordsAtPos(conflictingStart).top;
          if (!bothSpansFit(aTop, bTop, window.innerHeight)) {
            peekSpans.current = {
              primaryStart,
              conflictingStart,
              primaryText: obs.anchorText ?? "",
              conflictingText: obs.conflictingAnchorText ?? "",
              anchor: "primary",
            };
            anchorPeek("primary");
            return;
          }
        }
      }
      // Single span, or a contradiction whose sides both fit: just scroll.
      dismissPeek();
      scrollToPos(primaryStart);
    },
    [editor, spanStartPos, pulse, scrollToPos, anchorPeek, dismissPeek]
  );

  useEffect(() => {
    const handleCardActivate = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      if (id) activateObservation(id);
    };
    window.addEventListener("obs-card-activate", handleCardActivate);
    return () => window.removeEventListener("obs-card-activate", handleCardActivate);
  }, [activateObservation]);

  // Reverse hover on a *cross-claim* span (contradiction / strategic_tension):
  // dwelling on it floats a read-only glance of the OTHER conflicting side next to
  // the span the pointer is on — no scroll (you're already there). Only when the
  // two spans can't share the viewport; if both fit, the card float + dual
  // highlight already show both. Complements the card float; both fade on out.
  const openHoverPeek = useCallback(
    (id: string, spanEl: HTMLElement) => {
      if (!editor || editor.isDestroyed) return;
      const obs = observationsRef.current.find((o) => o.id === id);
      if (!obs || !obs.blockId || !obs.conflictingBlockId) return;
      const primaryStart = spanStartPos(
        obs.blockId,
        obs.startOffset ?? 0,
        obs.endOffset ?? 9999,
        obs.anchorText
      );
      const conflictingStart = spanStartPos(
        obs.conflictingBlockId,
        obs.conflictingStartOffset ?? 0,
        obs.conflictingEndOffset ?? 9999,
        obs.conflictingAnchorText
      );
      if (primaryStart === null || conflictingStart === null) return;
      const aTop = editor.view.coordsAtPos(primaryStart).top;
      const bTop = editor.view.coordsAtPos(conflictingStart).top;
      if (bothSpansFit(aTop, bTop, window.innerHeight)) return;
      // Which side is under the pointer? Anchor the glance there, quote the other.
      const hovPos = editor.view.posAtDOM(spanEl, 0);
      const hoveredSide: "primary" | "conflicting" =
        Math.abs(hovPos - primaryStart) <= Math.abs(hovPos - conflictingStart)
          ? "primary"
          : "conflicting";
      peekSpans.current = {
        primaryStart,
        conflictingStart,
        primaryText: obs.anchorText ?? "",
        conflictingText: obs.conflictingAnchorText ?? "",
        anchor: hoveredSide,
      };
      anchorPeek(hoveredSide, { scroll: false, mode: "hover" });
    },
    [editor, spanStartPos, anchorPeek]
  );
  const openHoverPeekRef = useRef(openHoverPeek);
  useEffect(() => {
    openHoverPeekRef.current = openHoverPeek;
  }, [openHoverPeek]);
  const dismissPeekRef = useRef(dismissPeek);
  useEffect(() => {
    dismissPeekRef.current = dismissPeek;
  }, [dismissPeek]);

  // Dismiss the peek on Escape or a user scroll gesture. We key off wheel/
  // touchmove (real intent) rather than the `scroll` event, because our own
  // smooth scrollIntoView fires `scroll` and would self-dismiss.
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissPeek();
    };
    const onUserScroll = () => dismissPeek();
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onUserScroll, { passive: true });
    window.addEventListener("touchmove", onUserScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onUserScroll);
      window.removeEventListener("touchmove", onUserScroll);
    };
  }, [peek, dismissPeek]);

  useEffect(() => {
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, []);

  // --- Reverse hover (UX-006): span → feed ---
  // Dwell on a highlighted span to surface its card. A fast sweep across the
  // document fires nothing; only resting on one span past SPAN_HOVER_DWELL_MS
  // emits. Leaving emits null immediately — the close *grace* (so the pointer
  // can travel onto a floating card) lives in App, where the float renders.
  const onSpanHoverRef = useRef(onSpanHover);
  useEffect(() => {
    onSpanHoverRef.current = onSpanHover;
  }, [onSpanHover]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingId: string | null = null; // armed, not yet fired
    let firedId: string | null = null; // currently surfaced

    const clearDwell = () => {
      if (dwellTimer) clearTimeout(dwellTimer);
      dwellTimer = null;
      pendingId = null;
    };
    const spanOf = (t: EventTarget | null): HTMLElement | null =>
      (t as HTMLElement | null)?.closest?.(".obs-highlight[data-obs-id]") ?? null;

    const handleOver = (e: MouseEvent) => {
      const el = spanOf(e.target);
      if (!el) return;
      const id = el.getAttribute("data-obs-id");
      if (!id || id === firedId || id === pendingId) return;
      clearDwell();
      pendingId = id;
      dwellTimer = setTimeout(() => {
        dwellTimer = null;
        pendingId = null;
        firedId = id;
        onSpanHoverRef.current?.(id);
        // …and, for a distant cross-claim span, glance the other side.
        openHoverPeekRef.current?.(id, el);
      }, SPAN_HOVER_DWELL_MS);
    };

    const handleOut = (e: MouseEvent) => {
      const el = spanOf(e.target);
      if (!el) return;
      // Ignore moves that stay within the same span (over its child text nodes).
      const to = e.relatedTarget as Node | null;
      if (to && el.contains(to)) return;
      clearDwell();
      if (firedId) {
        firedId = null;
        onSpanHoverRef.current?.(null);
        // Fade the hover glance with the card float; leave a pinned (card-click)
        // peek alone — only Escape/scroll/× dismiss that one.
        if (peekModeRef.current === "hover") dismissPeekRef.current();
      }
    };

    dom.addEventListener("mouseover", handleOver);
    dom.addEventListener("mouseout", handleOut);
    return () => {
      clearDwell();
      dom.removeEventListener("mouseover", handleOver);
      dom.removeEventListener("mouseout", handleOut);
    };
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

  // Sync the surfaced-id set so only budgeted observations get a visible mark.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(
      editor.state.tr.setMeta("setSurfacedIds", surfacedIds ?? new Set<string>())
    );
  }, [editor, surfacedIds]);

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
      {editor && <TableMenu editor={editor} />}
      <EditorContent editor={editor} />
      {peek && (
        <ContradictionPeek
          quote={peek.quote}
          top={peek.top}
          left={peek.left}
          readOnly={peek.mode === "hover"}
          onJump={() => anchorPeek(peekSpans.current?.anchor === "primary" ? "conflicting" : "primary")}
          onDismiss={dismissPeek}
        />
      )}
    </div>
  );
}
