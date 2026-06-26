import { useState, useEffect, useRef, useCallback } from "react";
import type { Observation } from "../store/db";
import { llmLogger, type LLMLogEntry, type SessionStats } from "../model/logger";
import type { ModelTier } from "../model/capability";
import { buildEnvelope } from "../model/debugLog";
import { getLlmMode } from "../model/mock";
import { subscribeStall } from "../model/stallSignal";
import { partitionFeed, DEFAULT_FEED_BUDGET } from "./feedBudget";
import type { GroupedObservation } from "./feedBudget";

// ---------------------------------------------------------------------------
// DismissIcon — shared svg
// ---------------------------------------------------------------------------

function DismissIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GroupedObsCard — renders a single group (one or more observations on the
// same span). When `others` is empty it looks identical to the old ObsCard.
// When grouped, a collapsed "N more on this passage" section appears below.
// ---------------------------------------------------------------------------

interface GroupedObsCardProps {
  group: GroupedObservation;
  isActive: boolean;
  isArriving: boolean;
  isExiting: boolean;
  onHover: (id: string | null) => void;
  onDismiss: (id: string) => void;
  /** Whether this card is in the "also noticed" overflow drawer vs. the main feed. */
  slot?: "primary" | "also-noticed";
}


function GroupedObsCard({
  group,
  isActive,
  isArriving,
  isExiting,
  onHover,
  onDismiss,
  slot = "primary",
}: GroupedObsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { primary, others } = group;

  const handleDismiss = () => {
    onDismiss(primary.id);
    for (const o of others) onDismiss(o.id);
  };

  return (
    <div
      className={`observation-card observation-${primary.type}${isActive ? " observation-card-active" : ""}${isArriving ? " observation-card-arriving" : ""}${isExiting ? " observation-card-exiting" : ""}`}
      data-testid="obs-card"
      role="listitem"
      tabIndex={0}
      data-obs-type={primary.type}
      data-obs-id={primary.id}
      data-kind={primary.kind}
      data-severity={primary.severity}
      data-confidence={primary.confidence}
      data-grouped={others.length > 0 ? "true" : undefined}
      onMouseEnter={() => onHover(primary.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(primary.id)}
      onBlur={() => onHover(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("obs-card-activate", { detail: { id: primary.id } })
          );
        }
      }}
    >
      <div className="card-header">
        <div className="card-header-left">
          <span className={`tag tag-${primary.type}`}>{primary.type.replace(/_/g, " ")}</span>
          <span
            className={`impact-label impact-kind-${primary.kind} impact-sev-${primary.severity}`}
            data-testid="impact-badge"
          >
            {primary.severity === "high" ? "HIGH" : primary.severity === "medium" ? "MED" : "LOW"}
            <span className="impact-popover" role="tooltip">
              {primary.severity === "high"
                ? "High"
                : primary.severity === "medium"
                  ? "Medium"
                  : "Low"}{" "}
              severity
              <br />
              {primary.confidence === "high"
                ? "High"
                : primary.confidence === "medium"
                  ? "Medium"
                  : "Low"}{" "}
              confidence
              {slot === "also-noticed" ? (
                <>
                  <br />
                  Below budget
                </>
              ) : ""}
            </span>
          </span>
          {isArriving && <span className="obs-new-badge">new</span>}
        </div>
        <button
          className="dismiss-btn"
          data-testid="obs-dismiss"
          data-obs-id={primary.id}
          onClick={handleDismiss}
          title="Dismiss Observation"
          aria-label="Dismiss Observation"
        >
          <DismissIcon />
        </button>
      </div>
      <div className="card-body">
        <p>{primary.text}</p>
      </div>
      {others.length > 0 && (
        <div className="card-also" data-testid="obs-group-also">
          <button
            className="card-also-toggle"
            onClick={() => setExpanded(!expanded)}
            data-testid="obs-group-toggle"
          >
            <span>{expanded ? "▾" : "▸"}</span> {others.length} more on this passage
          </button>
          {expanded &&
            others.map((o) => (
              <div key={o.id} className="card-also-item" data-testid="obs-group-item">
                <span className={`tag tag-${o.type}`} style={{ fontSize: "0.625rem" }}>
                  {o.type.replace(/_/g, " ")}
                </span>
                <p
                  style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#555", lineHeight: 1.4 }}
                >
                  {o.text}
                </p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SidecarFeed
// ---------------------------------------------------------------------------

interface Props {
  observations: Observation[];
  archivedObservations?: Observation[];
  /** Ordered blockIds from the editor (top → bottom), for document-order display. */
  blockOrder?: string[];
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  /** User's declaration of their BYO key's capability tier. "strong" routes to
   *  the paid pool and enables confident + resolution-aware paths. */
  keyTier?: ModelTier;
  onKeyTierChange?: (tier: ModelTier) => void;
  stage: string;
  onStageChange: (stage: string) => void;
  hoveredObservationId: string | null;
  onHoverObservation: (id: string | null) => void;
  onDismissObservation: (id: string) => void;
  onClearWorkspace: () => void;
  onImportFile?: (file: File) => void;
  logs?: LLMLogEntry[];
  activeProvider?: string;
  /** Dev harness readiness signal: 0 == idle, else evaluations outstanding. */
  pending?: number;
  sessionStats?: SessionStats;
  stageSuggestion?: string | null;
  onAcceptStageSuggestion?: (s: string) => void;
  onDismissStageSuggestion?: () => void;
  onExportMarkdown?: () => void;
  onExportPdf?: () => void;
  onCopyMarkdown?: () => void;
  onCopyRichText?: () => void;
  documentIsEmpty?: boolean;
}

export function SidecarFeed({
  observations,
  archivedObservations = [],
  blockOrder = [],
  apiKey,
  onApiKeyChange,
  keyTier = "weak",
  onKeyTierChange,
  stage,
  onStageChange,
  hoveredObservationId,
  onHoverObservation,
  onDismissObservation,
  onClearWorkspace,
  onImportFile,
  logs = [],
  activeProvider = "",
  pending = 0,
  sessionStats,
  stageSuggestion,
  onAcceptStageSuggestion,
  onDismissStageSuggestion,
  onExportMarkdown,
  onExportPdf,
  onCopyMarkdown,
  onCopyRichText,
  documentIsEmpty = false,
}: Props) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showAlsoNoticed, setShowAlsoNoticed] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  // Stall state: raised when an LLM request exceeds its timeout, so the chip
  // shows "still working…" instead of looking frozen. Cleared by the next good
  // response. See src/model/stallSignal.ts.
  const [stalled, setStalled] = useState(false);
  useEffect(() => subscribeStall(setStalled), []);

  // --- Batched arrival animation ---
  // When 3+ observations arrive within 600 ms, they animate in as a group
  // with a "+N new" indicator rather than a stutter of individual fades.
  // See docs/projects/message_generation_workflow.md §8 (arrival animation).
  const prevObsIdsRef = useRef<Set<string>>(new Set());
  const [arrivingIds, setArrivingIds] = useState<Set<string>>(new Set());
  const [arrivalBatchCount, setArrivalBatchCount] = useState(0);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportFile) {
      onImportFile(file);
    }
    e.target.value = "";
  };

  useEffect(() => {
    const currentIds = new Set(observations.map((o) => o.id));
    const newIds = [...currentIds].filter((id) => !prevObsIdsRef.current.has(id));
    prevObsIdsRef.current = currentIds;
    if (newIds.length === 0) return;
    setArrivingIds((prev) => new Set([...prev, ...newIds]));
    setArrivalBatchCount(newIds.length);
  }, [observations]);

  useEffect(() => {
    if (arrivingIds.size === 0) return;
    const timer = setTimeout(() => {
      setArrivingIds(new Set());
      setArrivalBatchCount(0);
    }, 2000);
    return () => clearTimeout(timer);
  }, [arrivingIds]);

  const handleDismiss = useCallback(
    (id: string) => {
      if (exitingIds.has(id)) return;
      setExitingIds((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setExitingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        onDismissObservation(id);
      }, 200);
    },
    [exitingIds, onDismissObservation]
  );

  const handleCopyLogs = async () => {
    try {
      // Self-describing, call-centric envelope (request+response merged, static
      // prompts dereferenced, chronological). See docs/projects/debug_log.md.
      const envelope = buildEnvelope(llmLogger.getLogs(), llmLogger.getProducedByCall(), {
        llmMode: getLlmMode(),
        activeProvider: llmLogger.getActiveProvider(),
      });
      const text = JSON.stringify(envelope, null, 2);
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  // Partition observations: budget-select by priority, display in document order.
  const { visible: visibleObs, alsoNoticed: alsoNoticedObs } = partitionFeed(observations, {
    budget: DEFAULT_FEED_BUDGET,
    blockOrder,
  });
  const overflowContradictionCount = alsoNoticedObs.filter((g) => g.hasContradiction).length;

  return (
    <aside className="sidecar-panel" aria-label="Observations">
      {showClearConfirm && (
        <div
          className="modal-overlay"
          data-testid="clear-modal"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.35)",
          }}
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="modal-card"
            style={{
              background: "#fff",
              borderRadius: "8px",
              padding: "16px",
              width: "80%",
              maxWidth: "320px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: "0 0 12px" }}>
              Clear the workspace? This erases all text, observations, and history.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                data-testid="clear-cancel"
                onClick={() => setShowClearConfirm(false)}
                style={{ padding: "6px 12px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                data-testid="clear-confirm"
                onClick={() => {
                  setShowClearConfirm(false);
                  onClearWorkspace();
                }}
                style={{
                  padding: "6px 12px",
                  cursor: "pointer",
                  background: "#d93025",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="sidecar-header">
        <div
          className="sidecar-title-bar"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <h3>Sidecar Feed</h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {(import.meta.env.DEV || stalled) && (
              <span
                className="sidecar-status-chip"
                data-testid="sidecar-status"
                role="status"
                aria-live="polite"
                data-pending={pending}
                data-stalled={stalled}
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: stalled ? "#fce8e6" : pending === 0 ? "#e6f4ea" : "#fff4e5",
                  color: stalled ? "#b3261e" : pending === 0 ? "#137333" : "#b06000",
                }}
              >
                {stalled
                  ? "still working…"
                  : pending === 0
                    ? "idle"
                    : `evaluating (${pending} pending)`}
              </span>
            )}
            {activeProvider && (
              <span
                className="active-provider-chip"
                data-testid="provider-chip"
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 6px",
                  background: activeProvider.includes("[paid]") ? "#fef3c7" : "#e0e0e0",
                  borderRadius: "4px",
                  color: activeProvider.includes("[paid]") ? "#92400e" : undefined,
                  fontWeight: activeProvider.includes("[paid]") ? 600 : undefined,
                }}
              >
                ⚡️ {activeProvider.replace(" [paid]", "")}
                {activeProvider.includes("[paid]") && (
                  <span
                    style={{
                      marginLeft: 4,
                      fontSize: "0.65rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    paid
                  </span>
                )}
              </span>
            )}
            <button
              className="settings-toggle-btn"
              data-testid="clear-workspace"
              onClick={() => setShowClearConfirm(true)}
              title="Clear workspace"
              aria-label="Clear workspace"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
              </svg>
            </button>
            <input
              type="file"
              accept=".md,.txt"
              style={{ display: "none" }}
              ref={fileInputRef}
              onChange={handleFileChange}
              data-testid="import-input"
            />
            <div style={{ position: "relative" }}>
              <button
                className="settings-toggle-btn"
                data-testid="export-menu-btn"
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={documentIsEmpty}
                style={{ opacity: documentIsEmpty ? 0.5 : 1 }}
                title="Export or Copy Document"
                aria-label="Export or Copy Document"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </button>
              {showExportMenu && (
                <div
                  className="settings-panel"
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "4px",
                    zIndex: 100,
                    minWidth: "160px",
                  }}
                >
                  <div className="setting-group">
                    <button
                      className="dismiss-btn"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px",
                        borderBottom: "1px solid #eee",
                      }}
                      onClick={() => {
                        onExportMarkdown?.();
                        setShowExportMenu(false);
                      }}
                      data-testid="export-md"
                    >
                      Download Markdown
                    </button>
                    <button
                      className="dismiss-btn"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px",
                        borderBottom: "1px solid #eee",
                      }}
                      onClick={() => {
                        onExportPdf?.();
                        setShowExportMenu(false);
                      }}
                      data-testid="export-pdf"
                    >
                      Print / Save as PDF
                    </button>
                    <button
                      className="dismiss-btn"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "8px",
                        borderBottom: "1px solid #eee",
                      }}
                      onClick={() => {
                        onCopyMarkdown?.();
                        setShowExportMenu(false);
                      }}
                      data-testid="copy-md"
                    >
                      Copy Markdown
                    </button>
                    <button
                      className="dismiss-btn"
                      style={{ width: "100%", textAlign: "left", padding: "8px" }}
                      onClick={() => {
                        onCopyRichText?.();
                        setShowExportMenu(false);
                      }}
                      data-testid="copy-rtf"
                    >
                      Copy Rich Text
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="settings-toggle-btn"
              data-testid="import-button"
              onClick={handleImportClick}
              title="Import Document (.md, .txt)"
              aria-label="Import Document"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button
              className="settings-toggle-btn"
              onClick={() => setShowSettings(!showSettings)}
              title="Configure API Key and Document Stage"
              aria-label="Configure API Key and Document Stage"
              aria-expanded={showSettings}
              aria-controls="settings-panel"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="settings-panel" data-testid="settings-panel">
            <div className="setting-group">
              <label htmlFor="api-key-input">Gemini API Key</label>
              <input
                id="api-key-input"
                data-testid="api-key-input"
                type="password"
                placeholder="Paste your Gemini API key…"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
              />
              <span className="setting-help">
                {apiKey
                  ? "✓ BYO key active — using your quota and model tier."
                  : "No key set — free tier (rate-limited). Get one at aistudio.google.com."}
              </span>
              {apiKey && (
                <label
                  className="setting-checkbox"
                  data-testid="key-tier-toggle"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    marginTop: "8px",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={keyTier === "strong"}
                    onChange={(e) => onKeyTierChange?.(e.target.checked ? "strong" : "weak")}
                  />
                  <span>
                    This is a capable model (paid tier)
                    <span className="setting-help" style={{ display: "block" }}>
                      Enables confident contradiction calls and resolution-aware reconciliation.
                      Leave off for free/lightweight models.
                    </span>
                  </span>
                </label>
              )}
            </div>
            <div className="setting-group">
              <label htmlFor="stage-input">Document Context / Stage</label>
              <textarea
                id="stage-input"
                data-testid="stage-input"
                rows={3}
                placeholder="e.g., PRD for payments team, audience is engineers and designers."
                value={stage}
                onChange={(e) => onStageChange(e.target.value)}
              />
            </div>
            {import.meta.env.DEV && (
              <div className="setting-group">
                <label
                  style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={debugMode}
                    onChange={(e) => setDebugMode(e.target.checked)}
                  />
                  Enable LLM Debug Mode
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="feed-container"
        style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}
      >
        {stageSuggestion && (
          <div
            data-testid="stage-suggestion"
            style={{
              margin: "8px",
              padding: "10px 12px",
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "6px",
              fontSize: "0.85rem",
            }}
          >
            <p style={{ margin: "0 0 8px", color: "#0c4a6e" }}>
              Inferred context: <em>{stageSuggestion}</em>
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                data-testid="stage-suggestion-accept"
                onClick={() => onAcceptStageSuggestion?.(stageSuggestion)}
                style={{
                  fontSize: "0.8rem",
                  padding: "3px 10px",
                  cursor: "pointer",
                  background: "#0ea5e9",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                }}
              >
                Use this
              </button>
              <button
                data-testid="stage-suggestion-dismiss"
                onClick={() => onDismissStageSuggestion?.()}
                style={{ fontSize: "0.8rem", padding: "3px 10px", cursor: "pointer" }}
              >
                No thanks
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1 }}>
          {observations.length === 0 ? (
            <div className="sidecar-empty">
              <div className="empty-icon">✍️</div>
              <p>Observations will appear here as you write.</p>
              <span className="empty-subtext">Quiet for now — keep going.</span>
            </div>
          ) : (
            <div className="observations-list" role="list">
              {/* Batch arrival indicator: shown briefly when 3+ land at once */}
              {arrivalBatchCount >= 3 && (
                <div
                  data-testid="arrival-indicator"
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    textAlign: "center",
                    animation: "fadeIn 200ms ease-in",
                  }}
                >
                  +{arrivalBatchCount} new
                </div>
              )}
              {visibleObs.map((group) => (
                <GroupedObsCard
                  key={group.id}
                  group={group}
                  isActive={hoveredObservationId === group.primary.id}
                  isArriving={
                    arrivingIds.has(group.primary.id) ||
                    group.others.some((o) => arrivingIds.has(o.id))
                  }
                  isExiting={
                    exitingIds.has(group.primary.id) ||
                    group.others.some((o) => exitingIds.has(o.id))
                  }
                  onHover={onHoverObservation}
                  onDismiss={handleDismiss}
                />
              ))}

              {/* "Also noticed" drawer — overflow below the budget */}
              {alsoNoticedObs.length > 0 && (
                <div
                  data-testid="also-noticed-drawer"
                  style={{ borderTop: "1px solid #e5e7eb", marginTop: "4px", paddingTop: "4px" }}
                >
                  <button
                    data-testid="also-noticed-toggle"
                    aria-expanded={showAlsoNoticed}
                    aria-controls="also-noticed-list"
                    onClick={() => setShowAlsoNoticed(!showAlsoNoticed)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      color: "#6b7280",
                      padding: "4px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span>{showAlsoNoticed ? "▾" : "▸"}</span>
                    <span>
                      Also noticed ({alsoNoticedObs.length}{" "}
                      {alsoNoticedObs.length === 1 ? "issue" : "issues"})
                    </span>
                  </button>
                  {overflowContradictionCount > 0 && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#dc2626",
                        paddingLeft: "16px",
                        paddingBottom: "2px",
                      }}
                    >
                      {overflowContradictionCount} more{" "}
                      {overflowContradictionCount === 1 ? "contradiction" : "contradictions"}
                    </div>
                  )}
                  {showAlsoNoticed && (
                    <div
                      id="also-noticed-list"
                      style={{ display: "flex", flexDirection: "column", gap: "4px" }}
                    >
                      {alsoNoticedObs.map((group) => (
                        <GroupedObsCard
                          key={group.id}
                          group={group}
                          isActive={hoveredObservationId === group.primary.id}
                          isArriving={
                            arrivingIds.has(group.primary.id) ||
                            group.others.some((o) => arrivingIds.has(o.id))
                          }
                          isExiting={
                            exitingIds.has(group.primary.id) ||
                            group.others.some((o) => exitingIds.has(o.id))
                          }
                          onHover={onHoverObservation}
                          onDismiss={handleDismiss}
                          slot="also-noticed"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {archivedObservations.length > 0 && (
          <div
            data-testid="archive-section"
            style={{ borderTop: "1px solid #e5e7eb", padding: "8px" }}
          >
            <button
              data-testid="archive-toggle"
              aria-expanded={showArchive}
              aria-controls="archive-list"
              onClick={() => setShowArchive(!showArchive)}
              style={{
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "0.8rem",
                color: "#6b7280",
                padding: "4px 0",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>{showArchive ? "▾" : "▸"}</span>
              <span>Archive ({archivedObservations.length})</span>
            </button>
            {showArchive && (
              <div
                id="archive-list"
                data-testid="archive-list"
                style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "4px" }}
              >
                {archivedObservations.map((obs) => {
                  const reasonText =
                    obs.closureReason === "resolved_by_edit"
                      ? "resolved by edit"
                      : obs.closureReason === "text_removed"
                        ? "text removed"
                        : obs.closureReason === "superseded"
                          ? "superseded"
                          : obs.closureReason === "dismissed"
                            ? "dismissed"
                            : obs.closureReason === "resolved_prior"
                              ? "resolved"
                              : obs.status.replace(/_/g, " ");
                  return (
                    <div
                      key={obs.id}
                      data-testid="archive-card"
                      data-obs-status={obs.status}
                      data-obs-type={obs.type}
                      style={{
                        padding: "8px",
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        borderRadius: "6px",
                        opacity: 0.75,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                        }}
                      >
                        <span className={`tag tag-${obs.type}`} style={{ fontSize: "0.7rem" }}>
                          {obs.type.replace(/_/g, " ")}
                        </span>
                        <span
                          data-testid="archive-reason"
                          style={{ fontSize: "0.7rem", color: "#6b7280" }}
                        >
                          {reasonText}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#4b5563" }}>{obs.text}</p>
                      {obs.anchorText && (
                        <div
                          data-testid="archive-anchor"
                          style={{
                            marginTop: "6px",
                            fontSize: "0.75rem",
                            color: "#6b7280",
                            fontStyle: "italic",
                            borderLeft: "2px solid #d1d5db",
                            paddingLeft: "6px",
                          }}
                        >
                          “{obs.anchorText}”
                          {obs.conflictingAnchorText && (
                            <>
                              <br />
                              <span style={{ display: "inline-block", marginTop: "4px" }}>
                                vs. “{obs.conflictingAnchorText}”
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {import.meta.env.DEV && debugMode && (
        <div
          className="debug-panel"
          style={{
            borderTop: "1px solid #ddd",
            padding: "8px",
            maxHeight: "300px",
            overflowY: "auto",
            background: "#f9f9f9",
            fontSize: "0.8rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <h4 style={{ margin: 0 }}>LLM Debug Logs</h4>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {copySuccess && <span style={{ color: "#4caf50", fontSize: "0.7rem" }}>Copied!</span>}
              <button
                onClick={handleCopyLogs}
                style={{ fontSize: "0.7rem", padding: "2px 8px", cursor: "pointer" }}
              >
                Copy All
              </button>
            </div>
          </div>
          {sessionStats && sessionStats.totalCalls > 0 && (
            <div
              data-testid="session-stats"
              style={{
                marginBottom: "8px",
                padding: "4px 6px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "4px",
                fontSize: "0.7rem",
                color: "#166534",
                fontFamily: "monospace",
              }}
            >
              Session: {sessionStats.fastCalls}f + {sessionStats.strongCalls}s calls
              {sessionStats.avgLatencyMs > 0 && ` · avg ${sessionStats.avgLatencyMs}ms`}
            </div>
          )}
          {logs.length === 0 ? (
            <div style={{ color: "#888" }}>No logs yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {logs.map((log) => {
                // Trigger entries render as a compact one-liner audit trail
                if (log.type === "trigger") {
                  return (
                    <div
                      key={log.id}
                      data-testid="debug-entry"
                      data-log-type="trigger"
                      style={{
                        background: "#eef2ff",
                        border: "1px solid #c7d2fe",
                        borderRadius: "4px",
                        padding: "3px 6px",
                        fontSize: "0.7rem",
                        color: "#4338ca",
                        display: "flex",
                        justifyContent: "space-between",
                        fontFamily: "monospace",
                      }}
                    >
                      <span>
                        ▶ trigger={log.triggerKind} block={log.blockId?.slice(0, 8)}
                      </span>
                      <span style={{ opacity: 0.7 }}>{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                  );
                }

                // Archive entries: a compact one-liner showing who closed an
                // observation and why (the gap this redesign closes).
                if (log.type === "archive" && log.archive) {
                  const a = log.archive;
                  const actorColor = a.actor === "user" ? "#92400e" : "#6b7280";
                  return (
                    <div
                      key={log.id}
                      data-testid="debug-entry"
                      data-log-type="archive"
                      data-archive-actor={a.actor}
                      data-archive-reason={a.reason}
                      style={{
                        background: "#fdf4ff",
                        border: "1px solid #f0abfc",
                        borderRadius: "4px",
                        padding: "3px 6px",
                        fontSize: "0.7rem",
                        color: actorColor,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "6px",
                        fontFamily: "monospace",
                      }}
                      title={a.text}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ✕ {a.actor} {a.reason} · {a.obsType}
                      </span>
                      <span style={{ opacity: 0.7, flexShrink: 0 }}>
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  );
                }

                const color =
                  log.type === "error"
                    ? "#ffebee"
                    : log.type === "retry"
                      ? "#fff8e1"
                      : log.type === "response"
                        ? "#e8f5e9"
                        : "transparent";
                const isExpanded = expandedLogId === log.id;
                return (
                  <div
                    key={log.id}
                    data-testid="debug-entry"
                    data-log-type={log.type}
                    style={{
                      background: color,
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      padding: "4px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        fontWeight: "bold",
                      }}
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    >
                      <span>
                        [{log.type.toUpperCase()}] {log.model}
                      </span>
                      <span>{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                    {log.errorMessage && (
                      <div style={{ color: "red", marginTop: "4px" }}>{log.errorMessage}</div>
                    )}
                    {isExpanded && (
                      <div
                        style={{
                          marginTop: "8px",
                          borderTop: "1px dashed #ccc",
                          paddingTop: "4px",
                        }}
                      >
                        <div>
                          <strong>Latency:</strong> {log.latencyMs}ms
                        </div>
                        <div>
                          <strong>Payload:</strong>{" "}
                          <pre
                            style={{ whiteSpace: "pre-wrap", margin: "4px 0", fontSize: "0.7rem" }}
                          >
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </div>
                        {log.response && (
                          <div>
                            <strong>Response:</strong>{" "}
                            <pre
                              style={{
                                whiteSpace: "pre-wrap",
                                margin: "4px 0",
                                fontSize: "0.7rem",
                              }}
                            >
                              {log.response}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
