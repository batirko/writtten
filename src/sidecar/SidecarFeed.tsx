import { useState } from "react";
import type { Observation } from "../store/db";
import type { LLMLogEntry } from "../model/logger";

interface Props {
  observations: Observation[];
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
}

export function SidecarFeed({
  observations,
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
}: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

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
              <span className="active-provider-chip" data-testid="provider-chip" style={{ fontSize: '0.75rem', padding: '2px 6px', background: '#e0e0e0', borderRadius: '4px' }}>
                ⚡️ {activeProvider}
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
          <div className="settings-panel">
            <div className="setting-group">
              <label htmlFor="api-key-input">Gemini API Key</label>
              <input
                id="api-key-input"
                type="password"
                placeholder="Enter VITE_GEMINI_API_KEY..."
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
              />
              <span className="setting-help">Keys are stored locally in your browser.</span>
            </div>
            <div className="setting-group">
              <label htmlFor="stage-input">Document Context / Stage</label>
              <textarea
                id="stage-input"
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

      <div className="feed-container" style={{ flex: 1, overflowY: 'auto' }}>
        {observations.length === 0 ? (
          <div className="sidecar-empty">
            <div className="empty-icon">✍️</div>
            <p>Observations will appear here as you write.</p>
            <span className="empty-subtext">Quiet for now — keep going.</span>
          </div>
        ) : (
          <div className="observations-list">
            {observations.map((obs) => {
              const isActive = hoveredObservationId === obs.id;
              return (
                <div
                  key={obs.id}
                  className={`observation-card observation-${obs.type} ${isActive ? "observation-card-active" : ""}`}
                  data-testid="obs-card"
                  data-obs-type={obs.type}
                  data-obs-id={obs.id}
                  onMouseEnter={() => onHoverObservation(obs.id)}
                  onMouseLeave={() => onHoverObservation(null)}
                >
                  <div className="card-header">
                    <span className={`tag tag-${obs.type}`}>{obs.type}</span>
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
