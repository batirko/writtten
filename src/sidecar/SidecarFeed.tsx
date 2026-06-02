import { useState, useEffect, useRef } from "react";
import type { Observation } from "../store/db";
import type { LLMLogEntry, SessionStats } from "../model/logger";

interface Props {
  observations: Observation[];
  archivedObservations?: Observation[];
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  stage: string;
  onStageChange: (stage: string) => void;
  hoveredObservationId: string | null;
  onHoverObservation: (id: string | null) => void;
  onDismissObservation: (id: string) => void;
  onClearWorkspace: () => void;
  logs?: LLMLogEntry[];
  activeProvider?: string;
  /** Dev harness readiness signal: 0 == idle, else evaluations outstanding. */
  pending?: number;
  sessionStats?: SessionStats;
  stageSuggestion?: string | null;
  onAcceptStageSuggestion?: (s: string) => void;
  onDismissStageSuggestion?: () => void;
}

export function SidecarFeed({
  observations,
  archivedObservations = [],
  apiKey,
  onApiKeyChange,
  stage,
  onStageChange,
  hoveredObservationId,
  onHoverObservation,
  onDismissObservation,
  onClearWorkspace,
  logs = [],
  activeProvider = "",
  pending = 0,
  sessionStats,
  stageSuggestion,
  onAcceptStageSuggestion,
  onDismissStageSuggestion,
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // --- Batched arrival animation ---
  // When 3+ observations arrive within 600 ms, they animate in as a group
  // with a "+N new" indicator rather than a stutter of individual fades.
  // See docs/projects/message_generation_workflow.md §8 (arrival animation).
  const prevObsIdsRef = useRef<Set<string>>(new Set());
  const [arrivingIds, setArrivingIds] = useState<Set<string>>(new Set());
  const [arrivalBatchCount, setArrivalBatchCount] = useState(0);

  useEffect(() => {
    const currentIds = new Set(observations.map((o) => o.id));
    const newIds = [...currentIds].filter((id) => !prevObsIdsRef.current.has(id));
    prevObsIdsRef.current = currentIds;

    if (newIds.length === 0) return;

    setArrivingIds(new Set(newIds));
    setArrivalBatchCount(newIds.length);

    const timer = setTimeout(() => {
      setArrivingIds(new Set());
      setArrivalBatchCount(0);
    }, 600);

    return () => clearTimeout(timer);
  }, [observations]);

  const handleCopyLogs = async () => {
    try {
      const text = JSON.stringify(logs, null, 2);
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy logs:", err);
    }
  };

  return (
    <aside className="sidecar-panel">
      {showClearConfirm && (
        <div
          className="modal-overlay"
          data-testid="clear-modal"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
          }}
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="modal-card"
            style={{ background: '#fff', borderRadius: '8px', padding: '16px', width: '80%', maxWidth: '320px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: '0 0 12px' }}>
              Clear the workspace? This erases all text, observations, and history.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                data-testid="clear-cancel"
                onClick={() => setShowClearConfirm(false)}
                style={{ padding: '6px 12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                data-testid="clear-confirm"
                onClick={() => { setShowClearConfirm(false); onClearWorkspace(); }}
                style={{ padding: '6px 12px', cursor: 'pointer', background: '#d93025', color: '#fff', border: 'none', borderRadius: '4px' }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="sidecar-header">
        <div className="sidecar-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Sidecar Feed</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {import.meta.env.DEV && (
              <span
                className="sidecar-status-chip"
                data-testid="sidecar-status"
                data-pending={pending}
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: pending === 0 ? '#e6f4ea' : '#fff4e5',
                  color: pending === 0 ? '#137333' : '#b06000',
                }}
              >
                {pending === 0 ? 'idle' : `evaluating (${pending} pending)`}
              </span>
            )}
            {activeProvider && (
              <span
                className="active-provider-chip"
                data-testid="provider-chip"
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  background: activeProvider.includes('[paid]') ? '#fef3c7' : '#e0e0e0',
                  borderRadius: '4px',
                  color: activeProvider.includes('[paid]') ? '#92400e' : undefined,
                  fontWeight: activeProvider.includes('[paid]') ? 600 : undefined,
                }}
              >
                ⚡️ {activeProvider.replace(' [paid]', '')}
                {activeProvider.includes('[paid]') && (
                  <span style={{ marginLeft: 4, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>paid</span>
                )}
              </span>
            )}
            <button
              className="settings-toggle-btn"
              data-testid="clear-workspace"
              onClick={() => setShowClearConfirm(true)}
              title="Clear workspace"
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
            <button
              className="settings-toggle-btn"
              onClick={() => setShowSettings(!showSettings)}
              title="Configure API Key and Document Stage"
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
            <div className="setting-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                />
                Enable LLM Debug Mode
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="feed-container" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {stageSuggestion && (
          <div
            data-testid="stage-suggestion"
            style={{
              margin: '8px',
              padding: '10px 12px',
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '6px',
              fontSize: '0.85rem',
            }}
          >
            <p style={{ margin: '0 0 8px', color: '#0c4a6e' }}>
              Inferred context: <em>{stageSuggestion}</em>
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                data-testid="stage-suggestion-accept"
                onClick={() => onAcceptStageSuggestion?.(stageSuggestion)}
                style={{ fontSize: '0.8rem', padding: '3px 10px', cursor: 'pointer', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '4px' }}
              >
                Use this
              </button>
              <button
                data-testid="stage-suggestion-dismiss"
                onClick={() => onDismissStageSuggestion?.()}
                style={{ fontSize: '0.8rem', padding: '3px 10px', cursor: 'pointer' }}
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
            <div className="observations-list">
              {/* Batch arrival indicator: shown briefly when 3+ land at once */}
              {arrivalBatchCount >= 3 && (
                <div
                  data-testid="arrival-indicator"
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    textAlign: 'center',
                    animation: 'fadeIn 200ms ease-in',
                  }}
                >
                  +{arrivalBatchCount} new
                </div>
              )}
              {observations.map((obs) => {
                const isActive = hoveredObservationId === obs.id;
                const isArriving = arrivingIds.has(obs.id);
                return (
                  <div
                    key={obs.id}
                    className={`observation-card observation-${obs.type} ${isActive ? "observation-card-active" : ""} ${isArriving ? "observation-card-arriving" : ""}`}
                    data-testid="obs-card"
                    data-obs-type={obs.type}
                    data-obs-id={obs.id}
                    onMouseEnter={() => onHoverObservation(obs.id)}
                    onMouseLeave={() => onHoverObservation(null)}
                  >
                    <div className="card-header">
                      <span className={`tag tag-${obs.type}`}>{obs.type.replace(/_/g, ' ')}</span>
                      <button
                        className="dismiss-btn"
                        data-testid="obs-dismiss"
                        data-obs-id={obs.id}
                        onClick={() => onDismissObservation(obs.id)}
                        title="Dismiss Observation"
                      >
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
                      </button>
                    </div>
                    <div className="card-body">
                      <p>{obs.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {archivedObservations.length > 0 && (
          <div
            data-testid="archive-section"
            style={{ borderTop: '1px solid #e5e7eb', padding: '8px' }}
          >
            <button
              data-testid="archive-toggle"
              onClick={() => setShowArchive(!showArchive)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                color: '#6b7280',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>{showArchive ? '▾' : '▸'}</span>
              <span>Archive ({archivedObservations.length})</span>
            </button>
            {showArchive && (
              <div data-testid="archive-list" style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {archivedObservations.map((obs) => (
                  <div
                    key={obs.id}
                    data-testid="archive-card"
                    data-obs-status={obs.status}
                    data-obs-type={obs.type}
                    style={{
                      padding: '8px',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      opacity: 0.75,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className={`tag tag-${obs.type}`} style={{ fontSize: '0.7rem' }}>
                        {obs.type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                        {obs.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>{obs.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {debugMode && (
        <div className="debug-panel" style={{ borderTop: '1px solid #ddd', padding: '8px', maxHeight: '300px', overflowY: 'auto', background: '#f9f9f9', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0 }}>LLM Debug Logs</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {copySuccess && <span style={{ color: '#4caf50', fontSize: '0.7rem' }}>Copied!</span>}
              <button
                onClick={handleCopyLogs}
                style={{ fontSize: '0.7rem', padding: '2px 8px', cursor: 'pointer' }}
              >
                Copy All
              </button>
            </div>
          </div>
          {sessionStats && sessionStats.totalCalls > 0 && (
            <div
              data-testid="session-stats"
              style={{
                marginBottom: '8px',
                padding: '4px 6px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '4px',
                fontSize: '0.7rem',
                color: '#166534',
                fontFamily: 'monospace',
              }}
            >
              Session: {sessionStats.fastCalls}f + {sessionStats.strongCalls}s calls
              {sessionStats.avgLatencyMs > 0 && ` · avg ${sessionStats.avgLatencyMs}ms`}
            </div>
          )}
          {logs.length === 0 ? (
            <div style={{ color: '#888' }}>No logs yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {logs.map(log => {
                // Trigger entries render as a compact one-liner audit trail
                if (log.type === 'trigger') {
                  return (
                    <div
                      key={log.id}
                      data-testid="debug-entry"
                      data-log-type="trigger"
                      style={{
                        background: '#eef2ff',
                        border: '1px solid #c7d2fe',
                        borderRadius: '4px',
                        padding: '3px 6px',
                        fontSize: '0.7rem',
                        color: '#4338ca',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontFamily: 'monospace',
                      }}
                    >
                      <span>▶ trigger={log.triggerKind} block={log.blockId?.slice(0, 8)}</span>
                      <span style={{ opacity: 0.7 }}>{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                  );
                }

                const color = log.type === 'error' ? '#ffebee' : log.type === 'retry' ? '#fff8e1' : log.type === 'response' ? '#e8f5e9' : 'transparent';
                const isExpanded = expandedLogId === log.id;
                return (
                  <div key={log.id} data-testid="debug-entry" data-log-type={log.type} style={{ background: color, border: '1px solid #ccc', borderRadius: '4px', padding: '4px' }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    >
                      <span>[{log.type.toUpperCase()}] {log.model}</span>
                      <span>{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                    {log.errorMessage && <div style={{ color: 'red', marginTop: '4px' }}>{log.errorMessage}</div>}
                    {isExpanded && (
                      <div style={{ marginTop: '8px', borderTop: '1px dashed #ccc', paddingTop: '4px' }}>
                        <div><strong>Latency:</strong> {log.latencyMs}ms</div>
                        <div><strong>Payload:</strong> <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0', fontSize: '0.7rem' }}>{JSON.stringify(log.payload, null, 2)}</pre></div>
                        {log.response && <div><strong>Response:</strong> <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0', fontSize: '0.7rem' }}>{log.response}</pre></div>}
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
