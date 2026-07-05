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
// Icons — shared inline svgs
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

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// Export = out of the tray (up-and-out); Import = into the tray (down-and-in).
function ExportIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
  );
}
function ImportIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  );
}
function GearIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GroupedObsCard — renders a single group (one or more observations on the
// same span). Severity is carried by the type tag (feed_surface.md § Card
// execution), driven by the card's data-kind / data-severity / data-obs-type.
// ---------------------------------------------------------------------------

interface GroupedObsCardProps {
  group: GroupedObservation;
  isActive: boolean;
  isArriving: boolean;
  isExiting: boolean;
  onHover: (id: string | null) => void;
  onDismiss: (id: string) => void;
}

function GroupedObsCard({
  group,
  isActive,
  isArriving,
  isExiting,
  onHover,
  onDismiss,
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
                <span className={`tag tag-${o.type}`}>{o.type.replace(/_/g, " ")}</span>
                <p className="card-also-item-text">{o.text}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ContextChip — always-visible Document Context / Stage affordance.
// (Relocation to a document-attached position is tracked separately; for now
// it renders at the top of the feed column. Testids preserved.)
// ---------------------------------------------------------------------------

interface ContextChipProps {
  stage: string;
  onStageChange: (s: string) => void;
  stageSuggestion?: string | null;
  onAcceptStageSuggestion?: (s: string) => void;
  onDismissStageSuggestion?: () => void;
}

function ContextChip({
  stage,
  onStageChange,
  stageSuggestion,
  onAcceptStageSuggestion,
  onDismissStageSuggestion,
}: ContextChipProps) {
  const [editing, setEditing] = useState(false);

  const chipState: "suggested" | "set" | "empty" = stageSuggestion
    ? "suggested"
    : stage
      ? "set"
      : "empty";

  const handleAcceptAndEdit = () => {
    if (stageSuggestion) onAcceptStageSuggestion?.(stageSuggestion);
    setEditing(true);
  };

  return (
    <div className="stage-chip" data-testid="stage-chip" data-chip-state={chipState}>
      {chipState === "suggested" && !editing && (
        <div className="stage-chip-suggested" data-testid="stage-suggestion">
          <span className="stage-chip-label">
            Inferred context: <em>{stageSuggestion}</em>
          </span>
          <div className="stage-chip-actions">
            <button
              className="stage-chip-btn stage-chip-btn-primary"
              data-testid="stage-suggestion-accept"
              onClick={() => onAcceptStageSuggestion?.(stageSuggestion!)}
            >
              Use this
            </button>
            <button
              className="stage-chip-btn"
              data-testid="stage-chip-edit"
              onClick={handleAcceptAndEdit}
            >
              Edit
            </button>
            <button
              className="stage-chip-dismiss"
              data-testid="stage-suggestion-dismiss"
              aria-label="Dismiss context suggestion"
              onClick={() => onDismissStageSuggestion?.()}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {chipState === "set" && !editing && (
        <div className="stage-chip-set">
          <span className="stage-chip-label" title={stage}>
            Context:{" "}
            <em className="stage-chip-value">
              {stage.length > 48 ? stage.slice(0, 48) + "…" : stage}
            </em>
          </span>
          <button
            className="stage-chip-edit-btn"
            data-testid="stage-chip-edit"
            aria-label="Edit document context"
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
        </div>
      )}

      {chipState === "empty" && !editing && (
        <button className="stage-chip-add-link" onClick={() => setEditing(true)}>
          Add context
        </button>
      )}

      {editing && (
        <div className="stage-chip-inline-edit">
          <textarea
            className="stage-chip-textarea"
            rows={2}
            placeholder="e.g., PRD for payments team, audience is engineers and designers."
            value={stage}
            onChange={(e) => onStageChange(e.target.value)}
            autoFocus
          />
          <button
            className="stage-chip-btn stage-chip-btn-primary"
            onClick={() => setEditing(false)}
          >
            Done
          </button>
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
  // Stall state: raised when an LLM request exceeds its timeout, so the dot
  // shows "still working…" instead of looking frozen. Cleared by the next good
  // response. See src/model/stallSignal.ts.
  const [stalled, setStalled] = useState(false);
  useEffect(() => subscribeStall(setStalled), []);

  // --- Batched arrival animation ---
  const prevObsIdsRef = useRef<Set<string>>(new Set(observations.map((o) => o.id)));
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

  // --- Control-center state derivation ---
  const isPaid = activeProvider.includes("[paid]");
  const modelName = activeProvider.replace(" [paid]", "") || "…";
  const anchorState = stalled ? "stalled" : pending > 0 ? "working" : "idle";
  const statusText = stalled
    ? "still working…"
    : pending > 0
      ? `evaluating · ${pending}`
      : "idle";

  return (
    <aside className="sidecar-panel" aria-label="Observations">
      {/* Clear-confirm modal */}
      {showClearConfirm && (
        <div
          className="modal-scrim"
          data-testid="clear-modal"
          onClick={() => setShowClearConfirm(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: "0 0 var(--space-md)" }}>
              Clear the workspace? This erases all text, observations, and history.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                className="modal-ghost-btn"
                data-testid="clear-cancel"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="modal-danger-btn"
                data-testid="clear-confirm"
                onClick={() => {
                  setShowClearConfirm(false);
                  onClearWorkspace();
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal (floating, out of the feed) */}
      {showSettings && (
        <div className="modal-scrim" onClick={() => setShowSettings(false)}>
          <div
            className="modal-card"
            data-testid="settings-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title-row">
              <span className="modal-title">Settings</span>
              <button
                className="dismiss-btn"
                aria-label="Close settings"
                onClick={() => setShowSettings(false)}
              >
                <DismissIcon />
              </button>
            </div>
            <div className="setting-group">
              <label htmlFor="api-key-input">Gemini API key</label>
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
                    alignItems: "flex-start",
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
            {import.meta.env.DEV && (
              <div className="setting-group" style={{ marginTop: "var(--space-sm)" }}>
                <label
                  style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={debugMode}
                    onChange={(e) => setDebugMode(e.target.checked)}
                  />
                  Enable LLM debug mode
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      <ContextChip
        stage={stage}
        onStageChange={onStageChange}
        stageSuggestion={stageSuggestion}
        onAcceptStageSuggestion={onAcceptStageSuggestion}
        onDismissStageSuggestion={onDismissStageSuggestion}
      />

      <div className="feed-container">
        <div style={{ flex: 1 }}>
          {observations.length === 0 ? (
            <div className="sidecar-empty">
              <p>Quiet while you draft — I'll speak up as you revise.</p>
              <span className="empty-subtext">Observations appear here as the document matures.</span>
            </div>
          ) : (
            <div className="observations-list" role="list">
              {arrivalBatchCount >= 3 && (
                <div data-testid="arrival-indicator" className="arrival-indicator">
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

              {alsoNoticedObs.length > 0 && (
                <div data-testid="also-noticed-drawer" className="also-noticed-drawer">
                  <button
                    data-testid="also-noticed-toggle"
                    className="drawer-toggle"
                    aria-expanded={showAlsoNoticed}
                    aria-controls="also-noticed-list"
                    onClick={() => setShowAlsoNoticed(!showAlsoNoticed)}
                  >
                    <span>{showAlsoNoticed ? "▾" : "▸"}</span>
                    <span>
                      Also noticed ({alsoNoticedObs.length}{" "}
                      {alsoNoticedObs.length === 1 ? "issue" : "issues"})
                    </span>
                  </button>
                  {overflowContradictionCount > 0 && (
                    <div className="drawer-contra-note">
                      {overflowContradictionCount} more{" "}
                      {overflowContradictionCount === 1 ? "contradiction" : "contradictions"}
                    </div>
                  )}
                  {showAlsoNoticed && (
                    <div
                      id="also-noticed-list"
                      style={{ display: "flex", flexDirection: "column", gap: "8px" }}
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
          <div data-testid="archive-section" className="archive-section">
            <button
              data-testid="archive-toggle"
              className="drawer-toggle"
              aria-expanded={showArchive}
              aria-controls="archive-list"
              onClick={() => setShowArchive(!showArchive)}
            >
              <span>{showArchive ? "▾" : "▸"}</span>
              <span>Archive ({archivedObservations.length})</span>
            </button>
            {showArchive && (
              <div id="archive-list" data-testid="archive-list" className="archive-list">
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
                      className="archive-card"
                      data-obs-status={obs.status}
                      data-obs-type={obs.type}
                    >
                      <div className="archive-card-head">
                        <span className={`tag tag-${obs.type}`}>{obs.type.replace(/_/g, " ")}</span>
                        <span data-testid="archive-reason" className="archive-reason">
                          {reasonText}
                        </span>
                      </div>
                      <p className="archive-card-text">{obs.text}</p>
                      {obs.anchorText && (
                        <div data-testid="archive-anchor" className="archive-anchor">
                          “{obs.anchorText}”
                          {obs.conflictingAnchorText && (
                            <>
                              <br />
                              <span className="archive-anchor-vs">
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

      {/* Debug panel (dev only) */}
      {import.meta.env.DEV && debugMode && (
        <div className="debug-panel">
          <div className="debug-panel-head">
            <h4 style={{ margin: 0 }}>LLM Debug Logs</h4>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {copySuccess && <span style={{ color: "#4caf50", fontSize: "0.7rem" }}>Copied!</span>}
              <button onClick={handleCopyLogs} style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
                Copy All
              </button>
            </div>
          </div>
          {sessionStats && sessionStats.totalCalls > 0 && (
            <div data-testid="session-stats" className="debug-session-stats">
              Session: {sessionStats.fastCalls}f + {sessionStats.strongCalls}s calls
              {sessionStats.avgLatencyMs > 0 && ` · avg ${sessionStats.avgLatencyMs}ms`}
            </div>
          )}
          {logs.length === 0 ? (
            <div style={{ color: "#888" }}>No logs yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {logs.map((log) => {
                if (log.type === "trigger") {
                  return (
                    <div
                      key={log.id}
                      data-testid="debug-entry"
                      data-log-type="trigger"
                      className="debug-entry debug-entry-trigger"
                    >
                      <span>
                        ▶ trigger={log.triggerKind} block={log.blockId?.slice(0, 8)}
                      </span>
                      <span style={{ opacity: 0.7 }}>{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                  );
                }
                if (log.type === "archive" && log.archive) {
                  const a = log.archive;
                  return (
                    <div
                      key={log.id}
                      data-testid="debug-entry"
                      data-log-type="archive"
                      data-archive-actor={a.actor}
                      data-archive-reason={a.reason}
                      className="debug-entry debug-entry-archive"
                      title={a.text}
                    >
                      <span className="debug-entry-ellipsis">
                        ✕ {a.actor} {a.reason} · {a.obsType}
                      </span>
                      <span style={{ opacity: 0.7, flexShrink: 0 }}>
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  );
                }
                const isExpanded = expandedLogId === log.id;
                return (
                  <div
                    key={log.id}
                    data-testid="debug-entry"
                    data-log-type={log.type}
                    className={`debug-entry debug-entry-${log.type}`}
                  >
                    <div
                      className="debug-entry-head"
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
                      <div className="debug-entry-detail">
                        <div>
                          <strong>Latency:</strong> {log.latencyMs}ms
                        </div>
                        <div>
                          <strong>Payload:</strong>{" "}
                          <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                        </div>
                        {log.response && (
                          <div>
                            <strong>Response:</strong> <pre>{log.response}</pre>
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

      {/* Control center — docked under the feed column */}
      <div className="control-center">
        <div className="control-process">
          <div className="control-process-label">process</div>
          <div className="control-process-row">
            <span data-testid="provider-chip">{modelName}</span>
            {isPaid && <span className="paid">paid</span>}
          </div>
          <div className="control-process-row">
            <span>status</span>
            <span
              data-testid="sidecar-status"
              role="status"
              aria-live="polite"
              data-pending={pending}
              data-stalled={stalled}
              className={anchorState !== "idle" ? "working" : undefined}
            >
              {statusText}
            </span>
          </div>
          {sessionStats && sessionStats.totalCalls > 0 && (
            <div className="control-process-row">
              <span>this session</span>
              <span>
                {sessionStats.fastCalls}f · {sessionStats.strongCalls}s
              </span>
            </div>
          )}
        </div>

        <div className="control-actions-row">
          <input
            type="file"
            accept=".md,.txt"
            style={{ display: "none" }}
            ref={fileInputRef}
            onChange={handleFileChange}
            data-testid="import-input"
          />
          <div className="control-export-wrap">
            <button
              className="control-btn"
              data-testid="export-menu-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={documentIsEmpty}
              title="Export or copy document"
              aria-label="Export or copy document"
            >
              <ExportIcon />
            </button>
            {showExportMenu && (
              <div className="export-menu">
                <button
                  data-testid="export-md"
                  onClick={() => {
                    onExportMarkdown?.();
                    setShowExportMenu(false);
                  }}
                >
                  Download Markdown
                </button>
                <button
                  data-testid="export-pdf"
                  onClick={() => {
                    onExportPdf?.();
                    setShowExportMenu(false);
                  }}
                >
                  Print / Save as PDF
                </button>
                <button
                  data-testid="copy-md"
                  onClick={() => {
                    onCopyMarkdown?.();
                    setShowExportMenu(false);
                  }}
                >
                  Copy Markdown
                </button>
                <button
                  data-testid="copy-rtf"
                  onClick={() => {
                    onCopyRichText?.();
                    setShowExportMenu(false);
                  }}
                >
                  Copy Rich Text
                </button>
              </div>
            )}
          </div>
          <button
            className="control-btn"
            data-testid="import-button"
            onClick={handleImportClick}
            title="Import document (.md, .txt)"
            aria-label="Import document"
          >
            <ImportIcon />
          </button>
          <button
            className="control-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
          <button
            className="control-btn"
            data-testid="clear-workspace"
            onClick={() => setShowClearConfirm(true)}
            title="Clear workspace"
            aria-label="Clear workspace"
          >
            <TrashIcon />
          </button>
          <div
            className="control-anchor"
            data-state={anchorState}
            data-paid={isPaid ? "true" : undefined}
            tabIndex={0}
            aria-label={`Model ${modelName}${isPaid ? " (paid)" : ""} — ${statusText}`}
          >
            <span className="control-dot" />
            <span className="control-anchor-tip" role="tooltip">
              {modelName}
              {isPaid ? " · paid" : ""} — {statusText}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
