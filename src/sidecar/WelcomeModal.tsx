import { useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// WelcomeModal — the first-run interruption (onboarding_first_run.md § Revision
// 2026-07-07). A blocking, closable modal that frames the inversion *and* names
// the API-key requirement — because keyless the evaluator does nothing on the
// user's own text, and the quiet empty state would otherwise mask that.
//
// Copy order is value-first: the inversion, then the rhythm, then the key ask,
// then the two actions. Product chrome, not an observation — so it carries a
// headline and isn't bound by the declarative-only observation rules; it still
// stays terse and non-salesy.
//
// Reuses the shared .modal-scrim / .modal-card primitive; adds a focus trap +
// Escape (the settings/clear modals only close on scrim-click). Not re-openable
// once dismissed — the standing keyless banner is the persistent re-entry point.
// ---------------------------------------------------------------------------

function DismissIcon() {
  return (
    <svg
      width="14"
      height="14"
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

interface WelcomeModalProps {
  /** Dismiss with no key and no example (×, "Maybe later", Escape, scrim). */
  onClose: () => void;
  /** Deep-link into the BYOK Settings modal (the accent, activation-first CTA). */
  onAddKey: () => void;
  /** Deep-link into the connect section and start pairing. Omitted (and the
   *  button hidden) unless the session has opted into the agent preview. */
  onConnectAgent?: () => void;
  /** Load the recorded "See it in action" example (keyless mock replay). */
  onLoadExample: () => void;
  /** Whether loading the example is safe — only on a blank doc, so it never
   *  clobbers the user's own text. */
  canLoadExample: boolean;
}

export function WelcomeModal({
  onClose,
  onAddKey,
  onConnectAgent,
  onLoadExample,
  canLoadExample,
}: WelcomeModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open (so keyboard/SR users land inside it and
  // the trap works), but focus the CARD CONTAINER, not an actionable button —
  // programmatic `.focus()` on a button renders as a :focus-visible ring, so
  // auto-focusing "Add your key" made it look pre-selected on load. Focusing the
  // (tabindex=-1, outline:none) container owns focus without lighting a control;
  // the buttons only ring once the user actually presses Tab. Escape closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal-card welcome-modal"
        data-testid="welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        ref={cardRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="welcome-modal-head">
          <span className="welcome-eyebrow">Welcome</span>
          <button
            className="dismiss-btn"
            data-testid="welcome-dismiss"
            onClick={onClose}
            title="Close"
            aria-label="Close welcome"
          >
            <DismissIcon />
          </button>
        </div>

        <h2 id="welcome-modal-title" className="welcome-modal-title">
          You write. I notice.
        </h2>
        <p className="welcome-modal-voice">
          You write every word. I read alongside and point out what&rsquo;s worth a second look
          &mdash; contradictions, unclear passages, claims that lean on nothing. I never write or
          rewrite your text.
        </p>
        <p className="welcome-modal-rhythm">Quiet while you draft. Sharper as you revise.</p>

        <div className="welcome-modal-keynote">
          <p>
            {onConnectAgent ? (
              <>
                To read <em>your</em> writing I need model access &mdash; an API key that stays on
                this device, free to start with Gemini, or a coding agent you already run. Neither
                yet? Watch a recorded example first.
              </>
            ) : (
              <>
                To read <em>your</em> writing I need an API key &mdash; free to start with Gemini,
                and it stays on this device. No key yet? Watch a recorded example first.
              </>
            )}
          </p>
        </div>

        {/* The two on-ramps carry identical weight: they are alternative routes to
            the same capability, and outlining one would rank them (spec decision 3,
            "two equal paths"). The example is separated below rather than sitting
            third in this row — it is a different kind of choice (watch, don't set
            up), and reading as a third peer flattened that. */}
        <div className="welcome-modal-actions">
          <button
            className="welcome-modal-primary"
            data-testid="welcome-add-key"
            onClick={onAddKey}
          >
            Add your key
          </button>
          {onConnectAgent && (
            <>
              <span className="welcome-modal-or">or</span>
              <button
                className="welcome-modal-secondary"
                data-testid="welcome-connect-agent"
                onClick={onConnectAgent}
              >
                Connect your agent
              </button>
            </>
          )}
        </div>

        <hr className="welcome-modal-divider" />

        <button
          className="welcome-modal-tertiary"
          data-testid="see-example"
          onClick={onLoadExample}
          disabled={!canLoadExample}
          title={
            canLoadExample
              ? "Load a short example and watch the feed react"
              : "Clear the workspace to load the example"
          }
        >
          See it in action
        </button>

        <button className="welcome-modal-later" data-testid="welcome-later" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
