/**
 * "Connect your agent" — the settings section for the bring-your-own-agent bridge.
 *
 * Presentational: the pairing lifecycle lives in `useAgentBridge`, called from
 * ControlCenter so it survives closing the modal.
 */
import { useEffect, useState } from "react";
import type { AgentBridgeView } from "./useAgentBridge";

export function ConnectAgent({
  support,
  status,
  prompt,
  promptError,
  connect,
  cancel,
  activeFromSource,
  revoke,
  preflight,
  proceed,
  recheckPermission,
  stalled,
  permissionUnreadable,
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
    // Legacy fallback: works in the contexts that refuse the async API. The prompt is
    // fully readable now, so a hand-selection is at least possible — but it is a scrolled
    // <pre> of shell quoting and a token, and a silent failure would still strand the user
    // in the one state where the prompt IS the point.
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

      {/* Stated before the first probe, not discovered after it. The old path
          offered the button, started an infinite port poll, and parked the user
          on "Waiting for your agent…" against a limitation already known at
          render time. No CTA here: there is nothing this browser can do. */}
      {!support.supported && (
        <>
          <p className="connect-lede">
            Review with a coding agent you already run — Claude Code, Codex, or another. No
            API key, and your document never leaves this machine.
          </p>
          <div className="connect-blocked" data-testid="connect-agent-unsupported" role="note">
            <p className="connect-blocked-text">
              Safari can&rsquo;t reach a bridge on this machine, so this won&rsquo;t connect
              here. Open writtten in Chrome, Edge, or Firefox to use an agent.
            </p>
          </div>
          <span className="setting-help">An API key still works in Safari.</span>
        </>
      )}

      {support.supported && status.state === "idle" && preflight === "none" && (
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

      {/* Stage 1. Raised by the click, before anything touches loopback — because
          the probe IS what raises the browser dialog, so a block rendered at probe
          time appears at the same instant, in the same corner, and loses: the
          dialog is browser chrome and sits above the page. Explaining first is the
          only ordering where the explanation can be read at all. Repeat users
          never see this — a `granted` reading skips straight to waiting. */}
      {support.supported && preflight === "asking" && (
        <div className="connect-preflight" role="group" data-testid="connect-agent-preflight">
          <p className="connect-preflight-title">
            Next, your browser will ask to reach your local network
          </p>
          <p className="connect-preflight-body">
            That prompt <em>is</em> this connection — allow it and your agent can answer. It
            appears near your address bar.
          </p>
          {/* A disclosure, styled as one. An underlined accent link here read as
              navigation to another page, which it isn't. */}
          <details className="connect-preflight-why">
            <summary>Why does a writing tool need this?</summary>
            <p>
              Your agent runs a small bridge on this machine. writtten talks to it over
              127.0.0.1 — a hop that never leaves your computer. That loopback is exactly why
              your document isn&rsquo;t sent to writtten&rsquo;s servers.
            </p>
          </details>
          <div className="connect-actions">
            <button
              type="button"
              className="connect-btn connect-btn-primary"
              data-testid="connect-agent-preflight-continue"
              onClick={proceed}
            >
              Continue
            </button>
            <button type="button" className="connect-btn" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* The case this milestone was written about, now detectable: probing would
          buy a wait that can never end, so we don't. Deliberately worded to hold
          whether the browser recorded a block or a dismissal — which of those
          `denied` means is unmeasured, and claiming the wrong one is worse than
          describing the state we can actually see. */}
      {support.supported && preflight === "blocked" && (
        <div className="connect-denied" role="alert" data-testid="connect-agent-blocked">
          <p className="connect-denied-text">
            Your browser isn&rsquo;t allowing writtten to reach your local network. Nothing can
            connect until it does — allow local network access in your site settings for
            writtten, then try again.
          </p>
          <div className="connect-actions">
            <button
              type="button"
              className="connect-btn"
              data-testid="connect-agent-recheck"
              onClick={recheckPermission}
            >
              Try again
            </button>
            {/* A way back out. Without it this block replaces the connect button
                permanently for anyone who can't change the setting, leaving the
                section with no path to its own starting state. */}
            <button type="button" className="connect-btn" onClick={cancel}>
              Not now
            </button>
            <a
              className="connect-explain"
              href="/agent/#browsers"
              target="_blank"
              rel="noreferrer"
            >
              How to clear it →
            </a>
          </div>
        </div>
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

          {/* Promoted out of the "Not working?" disclosure (2026-07-20 field report),
              and now CONDITIONAL rather than unconditional.

              This line is the fallback branch: it runs only when we could not read
              the permission state at all. When we can read it, the pre-flight above
              said this better and earlier, and a `granted` reading means there is
              nothing to warn about — repeating it at every later connect is the
              noise that sinks a warning nobody needs.

              Deliberately browser-agnostic. Naming which browser prompts is what shipped
              wrong twice: the copy claimed Chrome asks and Firefox doesn't, and both
              halves were written from the spec's assumption rather than measurement. That
              claim rots with each browser release; "your browser will ask" does not. */}
          {permissionUnreadable && (
            <p className="connect-warn-soft">
              Your browser will ask for permission to reach your local network &mdash; that
              prompt is this connection. <strong>Allow it</strong>, or the bridge can never
              answer.
            </p>
          )}

          {/* The wait is patient and silent by design — on Chrome the first probe can
              hang until the dialog is answered. But "waits forever with nothing on
              screen explaining why" is this milestone's actual complaint, and it
              survives every detection we just built: a suppressed dialog, an embedded
              shell that force-denies everything, a browser whose state we can't vouch
              for, or an allow followed by no bridge. Naming the three real causes
              without claiming to know which is the only honest thing we can say. */}
          {stalled && (
            <div className="connect-stalled" role="status" data-testid="connect-agent-stalled">
              <p className="connect-stalled-title">Still nothing on 127.0.0.1</p>
              <p className="connect-stalled-body">
                Any of three things — we can&rsquo;t tell which from here:
              </p>
              <ul className="connect-stalled-list">
                <li>the local-network prompt wasn&rsquo;t allowed</li>
                <li>your agent hasn&rsquo;t started the bridge yet</li>
                <li>every candidate port was busy</li>
              </ul>
            </div>
          )}

          {/* The old line — "it has your connection details baked in" — described the
              paste's plumbing and not its content, at a moment when the content was 33k
              characters the user could not see. Naming the two things the agent is
              actually asked to do is what makes the readable prompt below worth reading. */}
          <p className="connect-meta">
            Paste this into your agent session. It asks your agent to fetch a small relay
            script and talk to this page over 127.0.0.1.
          </p>

          {promptError ? (
            <p className="connect-warn">{promptError}</p>
          ) : (
            <>
              {/* Shown whole, scrolled — not clipped with a fade (UX-032). The preview was
                  a concession to a prompt too long to display; slimming removed the reason
                  for it, and a user asked to relay instructions to their own agent should
                  be able to read them first. That is the same argument the /agent page
                  makes to the security-conscious reader, pointed at the person holding the
                  clipboard. */}
              <div className="connect-prompt">
                <div className="connect-prompt-scroll">
                  <pre data-testid="connect-agent-prompt">
                    {prompt ?? "Building your prompt…"}
                  </pre>
                </div>
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
              <a
                className="connect-explain"
                data-testid="connect-agent-explain"
                href="/agent/"
                target="_blank"
                rel="noreferrer"
              >
                What this asks your agent to do →
              </a>
            </>
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
              Did you block the local-network permission prompt? Clear it in your
              browser&rsquo;s site settings for writtten and connect again.
              <br />
              Safari can&rsquo;t connect to a local bridge; use Chrome, Edge, or Firefox.
              <br />
              {/* Was: "the bridge script is written to a file on your machine… delete it
                  when you're done." It used to land in whatever directory the agent was
                  running in — usually the user's own repo (UX-039). It now goes to the
                  system temp directory, so there is nothing to clean up. */}
              The relay script is downloaded to your system temp folder and runs from
              there. Nothing is written to your project.
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
          {/* Both halves of the old sentence went false at once. There is no
              per-card label any more (one engine, nothing to disambiguate), and
              the built-in checks are precisely what a connected agent replaces —
              saying they "keep running" would promise the double-billing this
              design exists to end. Naming the pause here, where the user chose
              it, is the honest version. */}
          <span className="setting-help">
            Its observations appear in your feed. writtten&rsquo;s own checks are paused
            while it holds the slot.
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
