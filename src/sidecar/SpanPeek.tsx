import type { GroupedObservation } from "./feedBudget";
import { GroupedObsCard } from "./SidecarFeed";

interface Props {
  /** The card(s) covering the dwelled/pinned span. Usually one; when several
   *  observations co-locate on the same point (C9) they stack here so the whole
   *  covering set is surfaced together over the dimmed feed — never as loose,
   *  overlapping floats. Empty → nothing is focused. Primary first. */
  groups: GroupedObservation[];
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
 * Reverse-hover float (UX-006). Dwelling on a highlighted span floats *that span's*
 * card(s) in from the right gutter — rendered by the same GroupedObsCard as the
 * real feed, so it looks and reads identically. Pinned to the top of the gutter
 * (always on-screen even when the feed is scrolled); the feed behind it dims. It
 * slides in and closes when the pointer leaves both the span and this peek.
 *
 * C9 — overlapping/co-located spans: when the dwelled point is covered by several
 * observations (a substring nested in a larger span, or one claim in multiple
 * contradictions), the whole covering set stacks here (most-specific first) so all
 * the cards surface together as one coherent float, rather than the primary
 * floating while co-covering cards light up loose in the feed behind it.
 *
 * C8 — click-to-pin: when `pinned`, the float ignores pointer-leave (it stays put
 * so its folded "N more" drawer is reachable) and shows a × to close; dismissal
 * is Escape / click-away / × (wired in App).
 */
export function SpanPeek({ groups, pinned = false, onDismiss, onKeepOpen, onClose, onClosePin }: Props) {
  if (groups.length === 0) return null;
  return (
    <div
      className={`span-peek${pinned ? " span-peek-pinned" : ""}${groups.length > 1 ? " span-peek-stack" : ""}`}
      data-testid="span-peek"
      data-pinned={pinned ? "true" : undefined}
      data-count={groups.length}
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
      {groups.map((group) => (
        <GroupedObsCard
          key={group.id}
          group={group}
          isActive
          isArriving={false}
          onHover={() => {}}
          onDismiss={(g) => [g.primary, ...g.others].forEach((o) => onDismiss(o.id))}
        />
      ))}
    </div>
  );
}
