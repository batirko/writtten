/**
 * "Connect your agent" — the settings section for the bring-your-own-agent bridge.
 *
 * Presentational: the pairing lifecycle lives in `useAgentBridge`, called from
 * ControlCenter so it survives closing the modal.
 */
import { useEffect, useState } from "react";
import type { AgentBridgeView } from "./useAgentBridge";
import { AGENT_CAPABILITY_ASKS } from "./agentCapabilities";

export function ConnectAgent({
  support,
  status,
  prompt,
  promptError,
  connect,
  cancel,
  activeFromSource,
  revoke,
  stalled,
  permissionUnreadable,
}: AgentBridgeView) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [archiveCards, setArchiveCards] = useState(false);
  /** The prompt renders folded to its opening framing and unfolds on click — see the
   *  comment above the box for why that is not the truncation UX-032 rejected. */
  const [promptOpen, setPromptOpen] = useState(false);

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
            API key, and your draft goes to your agent, not to a writtten server.
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

      {/* The pre-flight and blocked states render as an app-level callout pinned
          toward the address bar (`AgentPreflightCallout`), not here — the browser's
          own prompt appears up there, and a warning about a decision has to sit
          where the decision does. This section keeps showing the connect button
          behind the dim, so backing out of the callout returns the user to it. */}
      {support.supported && status.state === "idle" && (
        <>
          <p className="connect-lede">
            Review with a coding agent you already run — Claude Code, Codex, or another. No
            API key, and your draft goes to your agent, not to a writtten server.
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

          {/* One line, one question answered in place: *what does this do*. It used to
              take three — a meta line describing the paste, a link to /agent as the only
              real answer, and a disclosure bullet carrying the reassurance that nothing
              lands in the user's project (UX-042). The link stays, demoted from the only
              answer to the longer one. The reassurance moved up here because it answers
              the question a reader has *while* deciding to paste, not after it failed. */}
          <p className="connect-meta">
            Paste this into your agent session. It fetches a small relay script to your temp
            folder and talks to this page over 127.0.0.1 &mdash; nothing is written to your
            project.{" "}
            <a
              className="connect-explain"
              data-testid="connect-agent-explain"
              href="/agent/"
              target="_blank"
              rel="noreferrer"
            >
              What this asks your agent to do →
            </a>
          </p>

          {promptError ? (
            <p className="connect-warn">{promptError}</p>
          ) : (
            <>
              {/* A peek that unfolds, and this is NOT the fade UX-032 rejected — read this
                  before "restoring" the old behaviour.

                  UX-032's complaint was a preview that `slice(0, 420)`d the prompt and
                  trailed off behind a gradient with **no way to reach the rest**: the user
                  was asked to relay instructions to their own agent and could not read
                  them. That property is intact. Nothing is sliced — the whole prompt is in
                  the DOM, selectable and copyable, at every moment; only its visible height
                  is folded, behind a labelled control that says so. Folding it is what lets
                  the rest of this panel be seen at all beside a ~300-line document.

                  What the peek shows is chosen, not arbitrary: the opening framing — the
                  title, the critic role, the inversion. OBS-040 measured that framing as the
                  part that decides whether a third-party agent accepts the paste at all, so
                  the most trust-bearing lines are the ones on screen by default. */}
              <div className="connect-prompt">
                <div
                  className={`connect-prompt-scroll${promptOpen ? " is-open" : ""}`}
                  data-testid="connect-agent-prompt-box"
                  id="connect-agent-prompt-box"
                >
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
                {/* Full-width by design: it earns a comfortable touch target with no extra
                    rule, and an unfold a phone can't reach is the same as no unfold. */}
                <button
                  type="button"
                  className="connect-prompt-unfold"
                  data-testid="connect-agent-prompt-unfold"
                  aria-expanded={promptOpen}
                  aria-controls="connect-agent-prompt-box"
                  onClick={() => setPromptOpen((open) => !open)}
                >
                  {promptOpen ? "Collapse the prompt" : "Show the whole prompt"}
                </button>
              </div>
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
              {/* The temp-folder line moved up into the paste instruction (UX-042) — it
                  answers "what does this do to my machine", which is a question asked
                  before pasting, not after it failed. It is deliberately not repeated
                  here. (It exists at all because the script used to land in whatever
                  directory the agent was running in — usually the user's own repo,
                  UX-039 — and the disclosure told them to go delete it.) */}
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
          {/* Names the other engine, not an owner. "writtten's own checks are paused"
              framed the two paths as writtten's checks against the agent's, which is
              not what they are: both are outside engines reading under writtten's
              rules, and what differs is which one holds the slot. That framing had
              spread to /agent and to the engine descriptions; it is retired in all
              three places at once. The exclusivity itself is real and worth saying —
              it is why nothing gets read, or paid for, twice. */}
          <span className="setting-help">
            Its observations appear in your feed. One engine reads at a time, so the key
            path stays idle while your agent holds the slot.
          </span>

          {/* What the connection is *for* — the only place in the app that says it
              (UX-043). Everything above this rule is plumbing the user did not ask about;
              everything below is capability that shipped and that nobody could find,
              because it was written only in the file addressed to the agent.

              Deliberately three things a person would say rather than three feature names,
              and deliberately here rather than in the two rejected homes: the agent's own
              end-of-pass report is agent-asserted and only exists *after* a pass, so it
              cannot inform someone who has just connected; first-run naming fights the
              welcome modal's trim (UX-042). This is also the emptiest surface in the flow,
              so it costs no density anywhere that has any to spare. */}
          <div className="connect-asks">
            {/* Reads as something a person tells you, not as a spec line. The reason comes
                first because the reason is the tip: people treat a connected engine as a
                switch, and this one is the chat window they already have open. */}
            <p className="connect-asks-lede">
              It&rsquo;s the same session you&rsquo;re sitting in, so you can just talk to it:
            </p>
            <ul className="connect-asks-list">
              {AGENT_CAPABILITY_ASKS.map(({ ask }) => (
                <li key={ask}>&ldquo;{ask}&rdquo;</li>
              ))}
            </ul>
            {/* The one real quality lever on this path, and it is not a setting: an agent
                arrives with its working directory, while a model reached through an API key
                sees the document and nothing else. The honest edge rides in the second
                sentence.

                Phrasing note, because the first version was rejected on sight and the
                reason generalises: it read "…the folder you started it in — so it knows
                what you've written elsewhere. Your reader doesn't." Three tells stacked —
                an em dash carrying the rhythm, a staged either/or, and a two-word closing
                fragment as a mic drop. Each is defensible alone; together they are the
                cadence people now recognise as machine-written, which is a bad thing for
                *this* product to sound like on the screen where it explains itself. Two
                plain sentences, no dash, no kicker. */}
            <p className="connect-asks-reach">
              It&rsquo;s running in a folder on your machine, so it can check this draft
              against the rest of that project. Your reader only gets the document.
            </p>
            <a
              className="connect-explain"
              data-testid="connect-agent-capabilities"
              href="/agent/#ask"
              target="_blank"
              rel="noreferrer"
            >
              How to work with it →
            </a>
          </div>
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
        // A decision dialog: closes through its own buttons, not a click-away.
        <div className="modal-scrim" data-testid="connect-agent-confirm">
          <div className="modal-card">
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
