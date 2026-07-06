import { useState, useRef, useEffect } from "react";
import { llmLogger, type LLMLogEntry, type SessionStats } from "../model/logger";
import type { ModelTier } from "../model/capability";
import { buildEnvelope } from "../model/debugLog";
import { getLlmMode } from "../model/mock";
import { subscribeStall } from "../model/stallSignal";

// ---------------------------------------------------------------------------
// Icons
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

// Export = download (arrow DOWN into the tray → save a file out to disk).
function DownloadIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  );
}
// Import = upload (arrow UP out of the tray → bring a file in from disk).
function UploadIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
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
// ControlCenter — always-visible (feed folded or not), fixed bottom-right.
// At rest = just the activity/model dot; hover/focus reveals process detail
// (up) + actions (left). Owns the settings + clear-confirm modals and the dev
// debug panel. (feed_surface.md § 2 / § 3 / § 5)
// ---------------------------------------------------------------------------

interface ControlCenterProps {
  pending?: number;
  activeProvider?: string;
  sessionStats?: SessionStats;
  documentIsEmpty?: boolean;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  keyTier?: ModelTier;
  onKeyTierChange?: (tier: ModelTier) => void;
  onImportFile?: (file: File) => void;
  onClearWorkspace: () => void;
  onExportMarkdown?: () => void;
  onExportPdf?: () => void;
  onCopyMarkdown?: () => void;
  onCopyRichText?: () => void;
  /** Re-show the first-run welcome (and, on a blank doc, the example link). */
  onResetFirstRun?: () => void;
  logs?: LLMLogEntry[];
}

export function ControlCenter({
  pending = 0,
  activeProvider = "",
  sessionStats,
  documentIsEmpty = false,
  apiKey,
  onApiKeyChange,
  keyTier = "weak",
  onKeyTierChange,
  onImportFile,
  onClearWorkspace,
  onExportMarkdown,
  onExportPdf,
  onCopyMarkdown,
  onCopyRichText,
  onResetFirstRun,
  logs = [],
}: ControlCenterProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [stalled, setStalled] = useState(false);
  useEffect(() => subscribeStall(setStalled), []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImportClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportFile) onImportFile(file);
    e.target.value = "";
  };

  const handleCopyLogs = async () => {
    try {
      const envelope = buildEnvelope(llmLogger.getLogs(), llmLogger.getProducedByCall(), {
        llmMode: getLlmMode(),
        activeProvider: llmLogger.getActiveProvider(),
      });
      await navigator.clipboard.writeText(JSON.stringify(envelope, null, 2));
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  const isPaid = activeProvider.includes("[paid]");
  const modelName = activeProvider.replace(" [paid]", "") || "…";
  const anchorState = stalled ? "stalled" : pending > 0 ? "working" : "idle";
  const statusText = stalled
    ? "still working…"
    : pending > 0
      ? `evaluating · ${pending}`
      : "idle";

  // Keep the cluster revealed while any menu/modal is open (so it doesn't
  // collapse out from under the pointer).
  const forceOpen = showExportMenu;

  return (
    <>
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
            {onResetFirstRun && (
              <div className="setting-group" style={{ marginTop: "var(--space-sm)" }}>
                <label>First-run intro</label>
                <span className="setting-help">
                  Bring back the welcome and the “See it in action” example.
                </span>
                <button
                  type="button"
                  className="modal-ghost-btn"
                  data-testid="reset-first-run"
                  style={{ marginTop: "8px", alignSelf: "flex-start" }}
                  onClick={() => {
                    setShowSettings(false);
                    onResetFirstRun();
                  }}
                >
                  Show it again
                </button>
              </div>
            )}
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

      <div className={`control-center${forceOpen ? " is-open" : ""}`}>
        {/* Reserved seam: the future R2c noisiness switch (Key issues / Balanced /
            Everything) drops in here — the process/up axis is an extensible stack,
            not a fixed list. No filter UI is shipped now (feed_surface.md § Reserved
            seams · smart_feed_curation.md). */}
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

          {import.meta.env.DEV && debugMode && (
            <div className="control-debug">
              <button
                className="control-debug-toggle"
                aria-expanded={debugExpanded}
                onClick={() => setDebugExpanded((v) => !v)}
              >
                <span>
                  debug logs
                  {logs.length > 0 && <span className="control-debug-count">{logs.length}</span>}
                </span>
                <span aria-hidden="true">{debugExpanded ? "▾" : "▸"}</span>
              </button>
              {debugExpanded && (
                <div className="debug-panel">
                  <div className="debug-panel-head">
                    {copySuccess && (
                      <span style={{ color: "#4caf50", fontSize: "0.7rem" }}>Copied!</span>
                    )}
                    <button
                      onClick={handleCopyLogs}
                      style={{ fontSize: "0.7rem", padding: "2px 8px" }}
                    >
                      Copy All
                    </button>
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
                              <span style={{ opacity: 0.7 }}>
                                {log.timestamp.toLocaleTimeString()}
                              </span>
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
                              <div style={{ color: "red", marginTop: "4px" }}>
                                {log.errorMessage}
                              </div>
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
            </div>
          )}
        </div>

        <div className="control-actions-row">
          <div className="control-actions-extra">
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
                <DownloadIcon />
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
              <UploadIcon />
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
          </div>
          <div
            className="control-anchor"
            data-state={anchorState}
            data-paid={isPaid ? "true" : undefined}
            tabIndex={0}
            aria-label={`Model ${modelName}${isPaid ? " (paid)" : ""} — ${statusText}`}
          >
            <span className="control-dot" />
          </div>
        </div>
      </div>
    </>
  );
}
