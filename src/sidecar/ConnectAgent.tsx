/**
 * "Connect your agent" — the settings section for the bring-your-own-agent bridge.
 *
 * Presentational: the pairing lifecycle lives in `useAgentBridge`, called from
 * ControlCenter so it survives closing the modal.
 */
import { useEffect, useState } from "react";
import type { AgentBridgeView } from "./useAgentBridge";

/** How much of the (very long) prompt to preview. The Copy button is the real
 *  affordance; this just proves something real is there. */
const PREVIEW_CHARS = 420;

export function ConnectAgent({
  status,
  prompt,
  promptError,
  connect,
  cancel,
  activeFromSource,
  revoke,
}: AgentBridgeView) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [archiveCards, setArchiveCards] = useState(false);

  /** Tearing a pairing down is only a decision when the source left something
   *  behind. With no cards to strand, Disconnect just disconnects — a dialog
   *  there would be ceremony over an empty choice. */
  const teardown = () => {
    if (activeFromSource > 0) {
      setArchiveCards(false);
      setConfirming(true);
      return;
    }
    cancel();
  };

  const confirmTeardown = () => {
    setConfirming(false);
    void revoke(archiveCards);
  };

  const cardCount = `${activeFromSource} observation${activeFromSource === 1 ? "" : "s"}`;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setCopyFailed(false);
      return;
    } catch {
      /* the async clipboard API is refused without transient activation, and in some
         embedded/permission-restricted contexts entirely — fall through */
    }
    // Legacy fallback: works in the contexts that refuse the async API. The prompt
    // preview is clipped, so the user cannot select the full text by hand — a silent
    // failure here would strand them in the one state where the prompt IS the point.
    try {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        setCopied(true);
        setCopyFailed(false);
        return;
      }
    } catch {
      /* fall through to the honest failure message */
    }
    setCopyFailed(true);
  };

  return (
    <div className="setting-section connect-agent" data-testid="connect-agent">
      <p className="setting-section-title">Connect your agent</p>

      {status.state === "idle" && (
        <>
          <p className="connect-lede">
            Review with a coding agent you already run — Claude Code, Codex, or another. No
            API key, and your document never leaves this machine.
          </p>
          <button
            type="button"
            className="connect-btn connect-btn-primary"
            data-testid="connect-agent-start"
            onClick={connect}
          >
            Connect your agent
          </button>
          <span className="setting-help">
            Chrome, Edge, or Firefox. Safari can&rsquo;t reach a local bridge.
          </span>
        </>
      )}

      {status.state === "waiting" && (
        <>
          <div className="connect-status" role="status" data-testid="connect-agent-status">
            <span className="connect-dot connect-dot-waiting" aria-hidden="true" />
            Waiting for your agent&hellip;
          </div>

          {status.error === "version_mismatch" && (
            <p className="connect-warn">
              That bridge speaks an older protocol — copy the prompt again to refresh it.
            </p>
          )}

          <p className="connect-meta">
            Paste this into your agent session. It has your connection details baked in.
          </p>

          {promptError ? (
            <p className="connect-warn">{promptError}</p>
          ) : (
            <div className="connect-prompt">
              <pre data-testid="connect-agent-prompt">
                {prompt ? prompt.slice(0, PREVIEW_CHARS) : "Building your prompt…"}
              </pre>
              <span className="connect-prompt-fade" aria-hidden="true" />
              <button
                type="button"
                className="connect-btn connect-btn-sm connect-copy"
                data-testid="connect-agent-copy"
                disabled={!prompt}
                onClick={copy}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}

          {copyFailed && (
            <p className="connect-warn" data-testid="connect-agent-copy-failed">
              Your browser blocked the copy. Click Copy again, or grant this page
              clipboard access.
            </p>
          )}

          <details className="connect-disclosure">
            <summary>Not working?</summary>
            <div className="connect-disclosure-body">
              Chrome may ask to allow local network access — allow it.
              <br />
              Safari can&rsquo;t connect to a local bridge; use Chrome, Edge, or Firefox.
              <br />
              All ports busy? Cancel and connect again for a fresh list.
            </div>
          </details>

          <div className="connect-actions">
            <button type="button" className="connect-btn" onClick={cancel}>
              Cancel
            </button>
          </div>
        </>
      )}

      {status.state === "connected" && (
        <>
          <div className="connect-row">
            <div className="connect-status" role="status" data-testid="connect-agent-status">
              <span className="connect-dot connect-dot-on" aria-hidden="true" />
              Connected · {status.agentName ?? "agent"}
            </div>
            <button
              type="button"
              className="connect-btn connect-btn-sm"
              data-testid="connect-agent-disconnect"
              onClick={teardown}
            >
              Disconnect
            </button>
          </div>
          <p className="connect-meta">
            127.0.0.1:{status.port} · sent a snapshot at every settle
          </p>
          <span className="setting-help">
            Its observations appear in your feed, labelled with its name. Built-in checks
            keep running.
          </span>
        </>
      )}

      {status.state === "disconnected" && (
        <>
          <div className="connect-row">
            <div className="connect-status" role="status" data-testid="connect-agent-status">
              <span className="connect-dot connect-dot-off" aria-hidden="true" />
              Disconnected · {status.agentName ?? "agent"}
            </div>
            <button
              type="button"
              className="connect-btn connect-btn-sm"
              data-testid="connect-agent-forget"
              onClick={teardown}
            >
              Forget
            </button>
          </div>
          <p className="connect-meta">
            Its cards stay in your feed. Re-run the bridge and it reclaims them.
          </p>
        </>
      )}

      {confirming && (
        <div
          className="modal-scrim"
          data-testid="connect-agent-confirm"
          onClick={() => setConfirming(false)}
        >
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: "0 0 var(--space-2xs)", fontWeight: 500 }}>
              Disconnect {status.agentName ?? "this agent"}?
            </p>
            <p style={{ margin: "0 0 var(--space-md)", color: "var(--color-ink-2)" }}>
              It submitted {cardCount} that {activeFromSource === 1 ? "is" : "are"} still in
              your feed.
            </p>
            {/* Unchecked by default: the observations belong to the user, not to
                the connection. Clearing them is a separate, deliberate act. */}
            <label className="connect-archive-opt">
              <input
                type="checkbox"
                data-testid="connect-agent-archive-opt"
                checked={archiveCards}
                onChange={(e) => setArchiveCards(e.target.checked)}
              />
              <span>Archive its {cardCount} too</span>
            </label>
            <div className="connect-actions">
              <button
                type="button"
                className="modal-ghost-btn"
                data-testid="connect-agent-confirm-cancel"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-danger-btn"
                data-testid="connect-agent-confirm-ok"
                onClick={confirmTeardown}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
