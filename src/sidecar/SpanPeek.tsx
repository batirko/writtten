import type { GroupedObservation } from "./feedBudget";
import { GroupedObsCard } from "./SidecarFeed";

interface Props {
  /** The group whose span is being dwelled on, or null when nothing is focused. */
  group: GroupedObservation | null;
  /** C8: the peek is pinned (click-to-pin) — it stays put regardless of pointer
   *  travel and shows a × close control; dismissal is Escape / click-away / ×. */
  pinned?: boolean;
  onDismiss: (id: string) => void;
  /** Pointer entered the peek — cancel the close grace so it stays reachable. */
  onKeepOpen: () => void;
  /** Pointer left the peek — release it (transient/hover mode only). */
  onClose: () => void;
  /** C8: close the pinned peek (the × control). */
  onClosePin?: () => void;
}

/**
 * Collapsed-feed reverse hover (UX-006). When the feed is folded away, dwelling
 * on a highlighted span floats *only that span's* card in from the right gutter —
 * rendered by the same GroupedObsCard as the real feed, so it looks and reads
 * identically. Pinned to the top of the gutter (consistent feed position); it
 * slides in from the right and closes when the pointer leaves both the span and
 * this peek. The whole effect is transient and never overlays the writing column.
 *
 * C8 — click-to-pin: when `pinned`, the float ignores pointer-leave (it stays put
 * so its folded "N more" drawer is reachable) and shows a × to close; dismissal
 * is Escape / click-away / × (wired in App).
 */
export function SpanPeek({ group, pinned = false, onDismiss, onKeepOpen, onClose, onClosePin }: Props) {
  if (!group) return null;
  return (
    <div
      className={`span-peek${pinned ? " span-peek-pinned" : ""}`}
      data-testid="span-peek"
      data-pinned={pinned ? "true" : undefined}
      onMouseEnter={onKeepOpen}
      onMouseLeave={pinned ? undefined : onClose}
    >
      {pinned && (
        <button
          type="button"
          className="span-peek-close"
          data-testid="span-peek-close"
          onClick={onClosePin}
          aria-label="Close pinned card"
          title="Close (Esc)"
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
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      )}
      <GroupedObsCard
        group={group}
        isActive
        isArriving={false}
        onHover={() => {}}
        onDismiss={(g) => [g.primary, ...g.others].forEach((o) => onDismiss(o.id))}
      />
    </div>
  );
}
