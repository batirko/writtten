import type { GroupedObservation } from "./feedBudget";
import { GroupedObsCard } from "./SidecarFeed";

interface Props {
  /** The group whose span is being dwelled on, or null when nothing is focused. */
  group: GroupedObservation | null;
  onDismiss: (id: string) => void;
  /** Pointer entered the peek — cancel the close grace so it stays reachable. */
  onKeepOpen: () => void;
  /** Pointer left the peek — release it. */
  onClose: () => void;
}

/**
 * Collapsed-feed reverse hover (UX-006). When the feed is folded away, dwelling
 * on a highlighted span floats *only that span's* card in from the right gutter —
 * rendered by the same GroupedObsCard as the real feed, so it looks and reads
 * identically. Pinned to the top of the gutter (consistent feed position); it
 * slides in from the right and closes when the pointer leaves both the span and
 * this peek. The whole effect is transient and never overlays the writing column.
 */
export function SpanPeek({ group, onDismiss, onKeepOpen, onClose }: Props) {
  if (!group) return null;
  return (
    <div
      className="span-peek"
      data-testid="span-peek"
      onMouseEnter={onKeepOpen}
      onMouseLeave={onClose}
    >
      <GroupedObsCard
        group={group}
        isActive
        isArriving={false}
        isExiting={false}
        onHover={() => {}}
        onDismiss={(g) => [g.primary, ...g.others].forEach((o) => onDismiss(o.id))}
      />
    </div>
  );
}
