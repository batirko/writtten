import { useState, useEffect, useRef } from "react";
import { Editor } from "./editor/Editor";
import { SidecarFeed } from "./sidecar/SidecarFeed";
import {
  loadObservationsForDocument,
  updateObservationStatus,
  clearDocumentData,
  saveDismissalSuppression,
  type Observation,
} from "./store/db";
import { scheduleEval } from "./services/orchestrator";
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
  const [clearTrigger, setClearTrigger] = useState(0);
  const [stageSuggestion, setStageSuggestion] = useState<string | null>(null);
  const [importContent, setImportContent] = useState<{ content: string; timestamp: number }>();

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
    setObservations([]);
    setArchivedObservations([]);
    setStageSuggestion(null);
    setStage("");
    setJargonAllowlist("");
    llmLogger.clearLogs();
    setImportContent({ content: text, timestamp: Date.now() });
  };

  const handleDismissObservation = async (id: string, closureReason?: string) => {
    const obs = observations.find((o) => o.id === id);
    if (obs) {
      const spanSignature =
        obs.scope === "span" && obs.blockId != null
          ? `${obs.blockId}:${obs.startOffset ?? ""}:${obs.endOffset ?? ""}`
          : undefined;
      await saveDismissalSuppression({
        id: nanoid(10),
        docId: DOC_ID,
        type: obs.type,
        kind: obs.kind,
        severity: obs.severity,
        spanSignature,
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
      const ctx: EvalContext = {
        docId: DOC_ID,
        apiKey: apiKeyRef.current ?? "",
        paidKey,
        capability,
        stage: stageRef.current,
        onStageSuggestion: setStageSuggestion,
      };
      scheduleEval({ kind: "stage-changed" }, null, ctx, refreshObservations);
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
          hoveredObservationId={hoveredObservationId}
          onObservationCollapsed={handleObservationCollapsed}
          onEvaluationComplete={refreshObservations}
          onStageSuggestion={setStageSuggestion}
          onBlockOrderChange={setBlockOrder}
          clearTrigger={clearTrigger}
          importContent={importContent}
          onReady={(e) => (editorRef.current = e)}
        />
      </main>
      <SidecarFeed
        observations={observations}
        archivedObservations={archivedObservations}
        blockOrder={blockOrder}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        keyTier={keyTier}
        onKeyTierChange={setKeyTier}
        stage={stage}
        onStageChange={setStage}
        jargonAllowlist={jargonAllowlist}
        onJargonAllowlistChange={setJargonAllowlist}
        hoveredObservationId={hoveredObservationId}
        onHoverObservation={setHoveredObservationId}
        onDismissObservation={handleDismissObservation}
        onClearWorkspace={handleClearWorkspace}
        onImportFile={handleImportFile}
        logs={logs}
        activeProvider={activeProvider}
        pending={pending}
        sessionStats={sessionStats}
        stageSuggestion={stageSuggestion}
        onAcceptStageSuggestion={handleAcceptStageSuggestion}
        onDismissStageSuggestion={handleDismissStageSuggestion}
        onExportMarkdown={handleExportMarkdown}
        onExportPdf={handleExportPdf}
        onCopyMarkdown={handleCopyMarkdown}
        onCopyRichText={handleCopyRichText}
        documentIsEmpty={blockOrder.length === 0}
      />
    </div>
  );
}
