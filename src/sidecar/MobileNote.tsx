import { useState } from "react";

const STORAGE_KEY = "writtten_mobile_note_dismissed";

/**
 * Mobile courtesy note (docs/projects/mobile_responsive.md § M4). A quiet,
 * dismissible one-liner shown only on narrow viewports — writtten is built for
 * focused desktop writing, and this sets that expectation honestly without a
 * blocking wall. Chrome, not an observation: persisted in localStorage like the
 * other UI flags, no DB schema.
 *
 * Rendered on every viewport but display-gated to <=720px in CSS (`.mobile-note`
 * inside the narrow @media block), so it never flashes on desktop. Once
 * dismissed it unmounts and the flag suppresses it on future loads.
 */
export function MobileNote() {
  const [dismissed, setDismissed] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "1"
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="mobile-note" role="note">
      <span className="mobile-note-text">
        writtten is built for focused desktop writing — the observation feed is best
        on a laptop.
      </span>
      <button
        type="button"
        className="mobile-note-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
