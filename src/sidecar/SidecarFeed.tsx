import { useState } from "react";
import type { Observation } from "../store/db";

interface Props {
  observations: Observation[];
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  stage: string;
  onStageChange: (stage: string) => void;
  hoveredObservationId: string | null;
  onHoverObservation: (id: string | null) => void;
  onDismissObservation: (id: string) => void;
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
}: Props) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <aside className="sidecar-panel">
      <div className="sidecar-header">
        <div className="sidecar-title-bar">
          <h3>Sidecar Feed</h3>
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
          </div>
        )}
      </div>

      <div className="feed-container">
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
                  onMouseEnter={() => onHoverObservation(obs.id)}
                  onMouseLeave={() => onHoverObservation(null)}
                >
                  <div className="card-header">
                    <span className={`tag tag-${obs.type}`}>{obs.type}</span>
                    <button
                      className="dismiss-btn"
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
    </aside>
  );
}
