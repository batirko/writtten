import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Editor } from "./editor/Editor";
import { SidecarFeed } from "./sidecar/SidecarFeed";
import { SpanPeek } from "./sidecar/SpanPeek";
import { ControlCenter } from "./sidecar/ControlCenter";
import { DocumentContext } from "./sidecar/DocumentContext";
import { groupObservations, findGroupForObs } from "./sidecar/obsAggregation";
import { surfacedObservationIds, DEFAULT_FEED_BUDGET } from "./sidecar/feedBudget";
import {
  loadObservationsForDocument,
  updateObservationStatus,
  clearDocumentData,
  saveDismissalSuppression,
  type Observation,
} from "./store/db";
import { scheduleEval } from "./services/orchestrator";
import { conflictPairKey } from "./services/evaluator";
import { EXAMPLE_DOC_HTML, EXAMPLE_STAGE } from "./services/exampleDoc";
import { clearSnapshotsForDocument } from "./services/evalSnapshot";
import type { EvalContext } from "./services/types";
import { capabilityForTier, type ModelTier } from "./model/capability";
import { llmLogger, type LLMLogEntry, type SessionStats } from "./model/logger";
import { harness } from "./debug/harness";
import { nanoid } from "nanoid";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { downloadMarkdown, exportPdf, copyMarkdown, copyRichText } from "./services/export";

const DOC_ID = "default";

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return (
      localStorage.getItem("writtten_api_key") ||
      (import.meta.env.VITE_GEMINI_API_KEY as string) ||
      ""
    );
  });

  // The user's declaration of their BYO key's capability tier. Persisted so a
  // capable BYO key keeps driving the strong path across sessions. Default weak:
  // never assume a pasted key is a reasoning model without an explicit say-so.
  const [keyTier, setKeyTier] = useState<ModelTier>(() => {
    return (localStorage.getItem("writtten_key_tier") as ModelTier) || "weak";
  });
  useEffect(() => {
    localStorage.setItem("writtten_key_tier", keyTier);
  }, [keyTier]);

  // Credential ≠ capability. Capability is decided here, once, from the key
  // configuration; the evaluator branches on it (never on `paidKey` presence).
  // See docs/projects/byok_capability_model.md.
  //   - An env paid key (default Gemini pack) → strong.
  //   - A UI-entered BYO key the user declared "strong" → strong (routes to the
  //     paid pool using that very key).
  //   - Otherwise → weak (free pool, hedged prompts, lexical/additive fallback).
  const envPaidKey: string | undefined =
    (import.meta.env.VITE_GEMINI_PAID_KEY as string) || undefined;
  const effectiveTier: ModelTier = envPaidKey || keyTier === "strong" ? "strong" : "weak";
  const paidKey: string | undefined =
    envPaidKey ?? (keyTier === "strong" && apiKey ? apiKey : undefined);
  const capability = capabilityForTier(effectiveTier);

  const [stage, setStage] = useState<string>(() => {
    return localStorage.getItem("writtten_stage") || "";
  });

  const [jargonAllowlist, setJargonAllowlist] = useState<string>(() => {
    return localStorage.getItem("writtten_jargon_allowlist") || "";
  });

  const [observations, setObservations] = useState<Observation[]>([]);
  const [archivedObservations, setArchivedObservations] = useState<Observation[]>([]);
  const [blockOrder, setBlockOrder] = useState<string[]>([]);
  const [hoveredObservationId, setHoveredObservationId] = useState<string | null>(null);
  // Reverse hover (UX-006): the primary id of the card whose span the pointer is
  // dwelling on. Distinct from hoveredObservationId because *only* a span-origin
  // hover drives the spotlight (open feed) and the floating peek (collapsed feed).
  const [spanFocusObsId, setSpanFocusObsId] = useState<string | null>(null);
  const spanCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [stageSuggestion, setStageSuggestion] = useState<string | null>(null);
  const [importContent, setImportContent] = useState<{ content: string; timestamp: number }>();

  // Companion surface: the feed column reflows the canvas (never overlays it).
  // Collapsed → canvas reclaims full editorial measure. Persisted per session.
  const [feedCollapsed, setFeedCollapsed] = useState<boolean>(
    () => localStorage.getItem("writtten_feed_collapsed") === "1"
  );
  useEffect(() => {
    localStorage.setItem("writtten_feed_collapsed", feedCollapsed ? "1" : "0");
  }, [feedCollapsed]);

  // First-run welcome moment: shown once at the top of the feed until dismissed.
  // Chrome, not an observation — persisted like the other UI flags (localStorage,
  // no DB schema). Clearing the workspace does NOT re-show it (reset is separate).
  const [hasSeenWelcome, setHasSeenWelcome] = useState<boolean>(
    () => localStorage.getItem("writtten_has_seen_welcome") === "1"
  );
  useEffect(() => {
    localStorage.setItem("writtten_has_seen_welcome", hasSeenWelcome ? "1" : "0");
  }, [hasSeenWelcome]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setFeedCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reverse hover (UX-006). Resolve a hovered span's raw observation id to its
  // rendered card (group primary) and drive both the shared highlight channel
  // and the span-focus channel. On leave, a short grace lets the pointer travel
  // onto the floating peek (collapsed) before it closes.
  const groups = useMemo(() => groupObservations(observations), [observations]);
  // Only surfaced (budgeted) observations get a visible canvas highlight; the
  // downgraded "also noticed" ones stay messages-only. Memoized so the Set
  // identity is stable across renders (the highlighter only rebuilds on change).
  const surfacedIds = useMemo(
    () => surfacedObservationIds(observations, { budget: DEFAULT_FEED_BUDGET, blockOrder }),
    [observations, blockOrder]
  );
  const cancelSpanClose = useCallback(() => {
    if (spanCloseTimer.current) clearTimeout(spanCloseTimer.current);
    spanCloseTimer.current = null;
  }, []);
  const handleSpanHover = useCallback(
    (rawId: string | null) => {
      cancelSpanClose();
      if (rawId == null) {
        spanCloseTimer.current = setTimeout(() => {
          setSpanFocusObsId(null);
          setHoveredObservationId(null);
        }, 150);
        return;
      }
      const primaryId = findGroupForObs(groups, rawId)?.primary.id ?? rawId;
      setSpanFocusObsId(primaryId);
      setHoveredObservationId(primaryId);
    },
    [groups, cancelSpanClose]
  );
  const spanFocusGroup = useMemo(
    () => (spanFocusObsId ? (findGroupForObs(groups, spanFocusObsId) ?? null) : null),
    [groups, spanFocusObsId]
  );

  const [logs, setLogs] = useState<LLMLogEntry[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>("gemini-2.0-flash");
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    fastCalls: 0,
    strongCalls: 0,
    totalCalls: 0,
    totalLatencyMs: 0,
    avgLatencyMs: 0,
    totalPromptTokens: 0,
    totalCandidateTokens: 0,
    totalCost: 0,
  });
  const [pending, setPending] = useState(0);
  const editorRef = useRef<TiptapEditor | null>(null);
  // Stable handle to the latest clear handler for __sidecar__.clear().
  const clearWorkspaceRef = useRef<() => void>(() => {});

  const handleExportMarkdown = () => editorRef.current && downloadMarkdown(editorRef.current);
  const handleExportPdf = () => editorRef.current && exportPdf();
  const handleCopyMarkdown = async () =>
    editorRef.current && (await copyMarkdown(editorRef.current));
  const handleCopyRichText = async () =>
    editorRef.current && (await copyRichText(editorRef.current));

  // Stable refs for stage-change trigger
  const apiKeyRef = useRef(apiKey);
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  const stageSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last stage value we've seen so we don't fire on initial mount
  // (also handles React StrictMode double-invoke cleanly).
  const prevStageValueRef = useRef(stage);
  const lastSettledStageRef = useRef(stage);

  useEffect(() => {
    const unsubscribe = llmLogger.subscribe((newLogs, provider) => {
      setLogs(newLogs);
      setActiveProvider(provider);
      setSessionStats(llmLogger.getSessionStats());
    });
    return unsubscribe;
  }, []);

  // Dev-only acceptance harness: attach window.__sidecar__ and surface the
  // readiness signal. Stripped from the production build via import.meta.env.DEV.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    harness.install({ docId: DOC_ID });
    harness.registerClear(() => clearWorkspaceRef.current());
    return harness.subscribePending(setPending);
  }, []);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem("writtten_api_key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("writtten_stage", stage);
  }, [stage]);

  useEffect(() => {
    localStorage.setItem("writtten_jargon_allowlist", jargonAllowlist);
  }, [jargonAllowlist]);

  // Load and refresh observations from DB — splits active (feed) from archived
  const refreshObservations = () => {
    loadObservationsForDocument(DOC_ID).then((all) => {
      setObservations(all.filter((o) => o.status === "active"));
      setArchivedObservations(all.filter((o) => o.status !== "active"));
    });
  };

  // Initial load
  useEffect(() => {
    refreshObservations();
  }, []);

  const handleClearWorkspace = async () => {
    await clearDocumentData(DOC_ID);
    clearSnapshotsForDocument(DOC_ID);
    setObservations([]);
    setArchivedObservations([]);
    setStageSuggestion(null);
    setStage("");
    setJargonAllowlist("");
    llmLogger.clearLogs();
    setClearTrigger((n) => n + 1);
  };
  clearWorkspaceRef.current = handleClearWorkspace;

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    await clearDocumentData(DOC_ID);
    clearSnapshotsForDocument(DOC_ID);
    setObservations([]);
    setArchivedObservations([]);
    setStageSuggestion(null);
    setStage("");
    setJargonAllowlist("");
    llmLogger.clearLogs();
    setImportContent({ content: text, timestamp: Date.now() });
  };

  // First-run welcome: dismissing is chrome — set the persisted flag, no
  // suppression write and no Undo toast (it isn't an observation).
  const handleDismissWelcome = () => setHasSeenWelcome(true);

  // "See it in action": load the pre-written example PRD so the live pipeline
  // catches its planted contradiction. Reuses the import path (installs the doc
  // + schedules the contradiction sweep). Only offered on a blank doc, so it
  // never clobbers the user's own text.
  const handleLoadExample = async () => {
    await clearDocumentData(DOC_ID);
    clearSnapshotsForDocument(DOC_ID);
    setObservations([]);
    setArchivedObservations([]);
    setStageSuggestion(null);
    setStage(EXAMPLE_STAGE);
    setJargonAllowlist("");
    llmLogger.clearLogs();
    setImportContent({ content: EXAMPLE_DOC_HTML, timestamp: Date.now() });
  };

  const handleDismissObservation = async (id: string, closureReason?: string) => {
    const obs = observations.find((o) => o.id === id);
    if (obs) {
      const spanSignature =
        obs.scope === "span" && obs.blockId != null
          ? `${obs.blockId}:${obs.startOffset ?? ""}:${obs.endOffset ?? ""}`
          : undefined;
      // L5: store the anchor identity so the suppression matches across edits.
      const isConflict = obs.type === "contradiction" || obs.type === "strategic_tension";
      await saveDismissalSuppression({
        id: nanoid(10),
        docId: DOC_ID,
        type: obs.type,
        kind: obs.kind,
        severity: obs.severity,
        spanSignature,
        anchorText: obs.anchorText,
        conflictingAnchorText: isConflict ? obs.conflictingAnchorText : undefined,
        conflictPairKey:
          isConflict && obs.blockId != null && obs.conflictingBlockId != null
            ? conflictPairKey(obs)
            : undefined,
        note: closureReason,
      });
    }
    await updateObservationStatus(id, "dismissed", closureReason);
    if (import.meta.env.DEV && obs) {
      harness.archive({
        observationId: obs.id,
        obsType: obs.type,
        kind: obs.kind,
        severity: obs.severity,
        scope: obs.scope,
        blockId: obs.blockId,
        text: obs.text,
        reason: "dismissed",
        actor: "user",
      });
    }
    refreshObservations();
  };

  const handleObservationCollapsed = async (id: string) => {
    await updateObservationStatus(id, "auto_closed", "dismissed");
    if (import.meta.env.DEV) {
      const obs = observations.find((o) => o.id === id);
      if (obs) {
        harness.archive({
          observationId: obs.id,
          obsType: obs.type,
          kind: obs.kind,
          severity: obs.severity,
          scope: obs.scope,
          blockId: obs.blockId,
          text: obs.text,
          reason: "collapsed",
          actor: "user",
        });
      }
    }
    refreshObservations();
  };

  // Fire stage-changed trigger when the stage field re-settles after being edited.
  // prevStageValueRef guard prevents firing on initial mount and handles
  // React StrictMode double-invoke (refs persist across remounts, value unchanged).
  useEffect(() => {
    if (stage === prevStageValueRef.current) return;
    prevStageValueRef.current = stage;

    if (stageSettleTimer.current) clearTimeout(stageSettleTimer.current);
    stageSettleTimer.current = setTimeout(() => {
      const previousStage = lastSettledStageRef.current;
      lastSettledStageRef.current = stage;

      const ctx: EvalContext = {
        docId: DOC_ID,
        apiKey: apiKeyRef.current ?? "",
        paidKey,
        capability,
        stage: stageRef.current,
        onStageSuggestion: setStageSuggestion,
      };
      scheduleEval({ kind: "stage-changed", previousStage }, null, ctx, refreshObservations);
    }, 3000);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAcceptStageSuggestion = (suggestion: string) => {
    setStage(suggestion);
    setStageSuggestion(null);
  };

  const handleDismissStageSuggestion = () => {
    setStageSuggestion(null);
  };

  return (
    <div className="app">
      <main className="editor-panel">
        <div className="editor-column">
          <DocumentContext
            stage={stage}
            onStageChange={setStage}
            stageSuggestion={stageSuggestion}
            onAcceptStageSuggestion={handleAcceptStageSuggestion}
            onDismissStageSuggestion={handleDismissStageSuggestion}
          />
          <Editor
          apiKey={apiKey}
          paidKey={paidKey}
          capability={capability}
          stage={stage}
          jargonAllowlist={jargonAllowlist
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)}
          observations={observations}
          surfacedIds={surfacedIds}
          hoveredObservationId={hoveredObservationId}
          onSpanHover={handleSpanHover}
          onObservationCollapsed={handleObservationCollapsed}
          onEvaluationComplete={refreshObservations}
          onStageSuggestion={setStageSuggestion}
          onBlockOrderChange={setBlockOrder}
          clearTrigger={clearTrigger}
          importContent={importContent}
          onReady={(e) => (editorRef.current = e)}
          />
        </div>
      </main>
      <button
        className="feed-handle"
        data-testid="feed-handle"
        onClick={() => setFeedCollapsed((c) => !c)}
        aria-label={feedCollapsed ? "Show observations" : "Hide observations"}
        aria-expanded={!feedCollapsed}
        title={feedCollapsed ? "Show observations (⌘\\)" : "Hide observations (⌘\\)"}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: feedCollapsed ? "rotate(180deg)" : "none" }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {/* Always mounted so the fold animates (width transition); the canvas
          reflows around it. aria-hidden while collapsed. */}
      <div
        className={`feed-slot${feedCollapsed ? " is-collapsed" : ""}`}
        aria-hidden={feedCollapsed}
      >
        <SidecarFeed
          observations={observations}
          archivedObservations={archivedObservations}
          blockOrder={blockOrder}
          hoveredObservationId={hoveredObservationId}
          spanFocusObsId={feedCollapsed ? null : spanFocusObsId}
          onHoverObservation={setHoveredObservationId}
          onDismissObservation={handleDismissObservation}
          showWelcome={!hasSeenWelcome}
          // A blank editor still holds one empty paragraph block, so "brand-new,
          // nothing to clobber" is <= 1 block (not === 0). This gates the
          // "See it in action" example off the user's own multi-block text.
          documentIsEmpty={blockOrder.length <= 1}
          onDismissWelcome={handleDismissWelcome}
          onLoadExample={handleLoadExample}
        />
      </div>
      {/* Reverse hover floats the hovered span's card(s) at the top of the gutter
          — in the open feed the cards behind dim in place; when collapsed it's the
          only thing shown. Always top-anchored so it's on-screen even if the feed
          is scrolled. */}
      <SpanPeek
        group={spanFocusGroup}
        onDismiss={handleDismissObservation}
        onKeepOpen={cancelSpanClose}
        onClose={() => handleSpanHover(null)}
      />
      {/* Control center is always visible — independent of feed collapse. */}
      <ControlCenter
        pending={pending}
        activeProvider={activeProvider}
        sessionStats={sessionStats}
        documentIsEmpty={blockOrder.length === 0}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        keyTier={keyTier}
        onKeyTierChange={setKeyTier}
        onImportFile={handleImportFile}
        onClearWorkspace={handleClearWorkspace}
        onExportMarkdown={handleExportMarkdown}
        onExportPdf={handleExportPdf}
        onCopyMarkdown={handleCopyMarkdown}
        onCopyRichText={handleCopyRichText}
        logs={logs}
      />
    </div>
  );
}
