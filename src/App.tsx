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
import { llmLogger, type LLMLogEntry, type SessionStats } from "./model/logger";
import { harness } from "./debug/harness";
import { nanoid } from "nanoid";

const DOC_ID = "default";

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return (
      localStorage.getItem("writtten_api_key") ||
      (import.meta.env.VITE_GEMINI_API_KEY as string) ||
      ""
    );
  });

  const paidKey: string | undefined =
    (import.meta.env.VITE_GEMINI_PAID_KEY as string) || undefined;

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
    fastCalls: 0, strongCalls: 0, totalCalls: 0, totalLatencyMs: 0, avgLatencyMs: 0,
  });
  const [pending, setPending] = useState(0);
  // Stable handle to the latest clear handler for __sidecar__.clear().
  const clearWorkspaceRef = useRef<() => void>(() => {});

  // Stable refs for stage-change trigger
  const apiKeyRef = useRef(apiKey);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  const stageRef = useRef(stage);
  useEffect(() => { stageRef.current = stage; }, [stage]);
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

  const handleDismissObservation = async (id: string) => {
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
      });
    }
    await updateObservationStatus(id, "dismissed");
    refreshObservations();
  };

  const handleObservationCollapsed = async (id: string) => {
    await updateObservationStatus(id, "auto_closed");
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
          stage={stage}
          jargonAllowlist={jargonAllowlist.split("\n").map((s) => s.trim()).filter(Boolean)}
          observations={observations}
          hoveredObservationId={hoveredObservationId}
          onObservationCollapsed={handleObservationCollapsed}
          onEvaluationComplete={refreshObservations}
          onStageSuggestion={setStageSuggestion}
          onBlockOrderChange={setBlockOrder}
          clearTrigger={clearTrigger}
          importContent={importContent}
        />
      </main>
      <SidecarFeed
        observations={observations}
        archivedObservations={archivedObservations}
        blockOrder={blockOrder}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
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
      />
    </div>
  );
}
