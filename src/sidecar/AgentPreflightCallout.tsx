/**
 * The local-network permission pre-flight, as an app-level callout (BYOA).
 *
 * Deliberately NOT inside the Settings modal. The browser raises its permission
 * dialog as chrome pinned near the address bar, and a warning about a decision
 * has to sit where the decision appears — the videoconferencing pattern (Zoom and
 * Meet point an arrow at the camera prompt; they don't bury a sentence in a panel).
 * An earlier build kept this in the connect section, where it read as a line that
 * blinked and was missed, and where "Continue" landed on the same spot the user
 * had just clicked "Connect". So this portals to the top-left of the viewport,
 * above the (dimmed) modal, with its own distinct action.
 *
 * Two phases render here; `granted` and the unreadable fallback never do (they are
 * handled in the connect section itself). `useAgentBridge` owns the state and the
 * permission watcher that can dismiss this from underneath the user when they
 * allow — this component is only its face.
 */
import { createPortal } from "react-dom";
import type { AgentBridgeView } from "./useAgentBridge";

export function AgentPreflightCallout({
  preflight,
  proceed,
  cancel,
  recheckPermission,
}: AgentBridgeView) {
  if (preflight === "none") return null;
  if (typeof document === "undefined") return null;

  const asking = preflight === "asking";

  return createPortal(
    // Scrim dims the whole app so attention goes up to the address bar. Clicking
    // it backs out — the same escape the app's other modals give.
    <div className="agent-preflight-scrim" onClick={cancel}>
      <div
        className={`agent-preflight-callout${asking ? "" : " is-blocked"}`}
        role={asking ? "dialog" : "alertdialog"}
        aria-modal="true"
        data-testid={asking ? "agent-preflight-asking" : "agent-preflight-blocked"}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="agent-preflight-notch" aria-hidden="true" />
        {asking ? (
          <>
            <p className="agent-preflight-title">
              Your browser will ask to reach your local network
            </p>
            <p className="agent-preflight-body">
              Your agent runs a small program on your computer to review your writing. This
              permission lets writtten reach it, so your document goes to your agent and never
              to writtten&rsquo;s servers.
            </p>
            <details className="connect-preflight-why">
              <summary>The technical side</summary>
              <p>
                127.0.0.1 only ever points back at your own computer, so writtten can reach the
                one program running there and nowhere else. After that, your agent sends your
                writing on to its model. That part is between you and your agent, not writtten.
              </p>
            </details>
            <div className="agent-preflight-actions">
              <button
                type="button"
                className="connect-btn connect-btn-primary"
                data-testid="agent-preflight-proceed"
                onClick={proceed}
              >
                Continue
              </button>
              <button type="button" className="connect-btn" onClick={cancel}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="agent-preflight-title">Local network access is off</p>
            <p className="agent-preflight-body">
              Your agent can&rsquo;t be reached until you allow it in this site&rsquo;s browser
              permissions. It continues the moment you do.
            </p>
            <div className="agent-preflight-actions">
              <button
                type="button"
                className="connect-btn"
                data-testid="agent-preflight-recheck"
                onClick={recheckPermission}
              >
                Try again
              </button>
              <a
                className="connect-explain"
                href="/agent/#browsers"
                target="_blank"
                rel="noreferrer"
              >
                How to clear it →
              </a>
              <button
                type="button"
                className="connect-btn agent-preflight-dismiss"
                onClick={cancel}
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
