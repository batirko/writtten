interface Props {
  /** The *other* conflicting span's text, quoted back at the reader. */
  quote: string;
  /** Viewport-fixed coordinates, already resolved for above/below placement. */
  top: number;
  left: number;
  /** Scroll to the quoted passage and flip the peek to the near one. */
  onJump: () => void;
  /** Dismiss (also wired to Escape / scroll / blur in the editor). */
  onDismiss: () => void;
  /** Hover glance: a read-only, non-interactive quote that fades on hover-end —
   *  no Jump / × (those belong to the pinned, card-click peek). */
  readOnly?: boolean;
}

/**
 * Distant-contradiction peek (UX-009). When a contradiction's two spans are too
 * far apart to share the viewport, activating the card scrolls to the near span
 * and floats this small quote of the *far* span beside it — so both sides can be
 * compared without losing your place. "Jump" scrolls to the far span and flips
 * the peek to quote the near one (bidirectional). Never a full split view.
 */
export function ContradictionPeek({ quote, top, left, onJump, onDismiss, readOnly }: Props) {
  return (
    <div
      className={`contradiction-peek${readOnly ? " contradiction-peek-hover" : ""}`}
      data-testid="contradiction-peek"
      role="dialog"
      aria-label="Conflicting passage"
      style={{ top, left }}
    >
      <div className="contradiction-peek-head">
        <span className="contradiction-peek-label">Conflicts with</span>
        {!readOnly && (
          <button
          className="contradiction-peek-close"
          data-testid="contradiction-peek-close"
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss (Esc)"
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
        )}
      </div>
      <p className="contradiction-peek-quote">“{quote}”</p>
      {!readOnly && (
        <button
          className="contradiction-peek-jump"
          data-testid="contradiction-peek-jump"
          onClick={onJump}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="8 7 12 3 16 7"></polyline>
            <polyline points="8 17 12 21 16 17"></polyline>
          </svg>
          Jump to this passage
        </button>
      )}
    </div>
  );
}
