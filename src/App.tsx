import { useState, useEffect } from "react";
import { Editor } from "./editor/Editor";
import { SidecarFeed } from "./sidecar/SidecarFeed";
import {
  loadActiveObservationsForDocument,
  updateObservationStatus,
  clearDocumentData,
  type Observation,
} from "./store/db";
import { llmLogger, type LLMLogEntry } from "./model/logger";

const DOC_ID = "default";

export default function App() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return (
      localStorage.getItem("writtten_api_key") ||
      (import.meta.env.VITE_GEMINI_API_KEY as string) ||
      ""
    );
  });

  const [stage, setStage] = useState<string>(() => {
    return localStorage.getItem("writtten_stage") || "";
  });

  const [observations, setObservations] = useState<Observation[]>([]);
  const [hoveredObservationId, setHoveredObservationId] = useState<string | null>(null);
  const [clearTrigger, setClearTrigger] = useState(0);
  
  const [logs, setLogs] = useState<LLMLogEntry[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>("gemini-2.0-flash");

  useEffect(() => {
    const unsubscribe = llmLogger.subscribe((newLogs, provider) => {
      setLogs(newLogs);
      setActiveProvider(provider);
    });
    return unsubscribe;
  }, []);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem("writtten_api_key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("writtten_stage", stage);
  }, [stage]);

  // Load and refresh observations from DB
  const refreshObservations = () => {
    loadActiveObservationsForDocument(DOC_ID).then((list) => {
      setObservations(list);
    });
  };

  // Initial load
  useEffect(() => {
    refreshObservations();
  }, []);

  const handleClearWorkspace = async () => {
    await clearDocumentData(DOC_ID);
    setObservations([]);
    setStage("");
    setClearTrigger((n) => n + 1);
  };

  const handleDismissObservation = async (id: string) => {
    await updateObservationStatus(id, "dismissed");
    refreshObservations();
  };

  const handleObservationCollapsed = async (id: string) => {
    await updateObservationStatus(id, "auto_closed");
    refreshObservations();
  };

  return (
    <div className="app">
      <main className="editor-panel">
        <Editor
          apiKey={apiKey}
          stage={stage}
          observations={observations}
          hoveredObservationId={hoveredObservationId}
          onObservationCollapsed={handleObservationCollapsed}
          onEvaluationComplete={refreshObservations}
          clearTrigger={clearTrigger}
        />
      </main>
      <SidecarFeed
        observations={observations}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        stage={stage}
        onStageChange={setStage}
        hoveredObservationId={hoveredObservationId}
        onHoverObservation={setHoveredObservationId}
        onDismissObservation={handleDismissObservation}
        onClearWorkspace={handleClearWorkspace}
        logs={logs}
        activeProvider={activeProvider}
      />
    </div>
  );
}
