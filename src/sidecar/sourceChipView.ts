/**
 * Pure state mapping for the per-card source chip (BYOA / PR3).
 *
 * Split out of the component for the reason `keyStatusView` was: the interesting
 * part is a small state matrix, and it is worth testing without a DOM.
 *
 * The chip is the containment the product spends for admitting an unratcheted
 * critic. Our own observations sit behind precision floors and fixture
 * ratchets; an external agent's cannot. So the user must always be able to tell
 * which critic is speaking, and learn to discount *a source* rather than the
 * feed. That makes this mapping load-bearing, not decoration.
 */

import type { ObservationSource } from "../store/db";
import type { AgentSourceStatus } from "../model/agentSourceSignal";

export interface SourceChipView {
  /** The agent's display name — what the user reads. */
  label: string;
  state: "live" | "disconnected" | "revoked";
  /** Tooltip: says what the state means, not just that it exists. */
  title: string;
}

/**
 * `null` for a built-in observation — no chip at all, because the unmarked case
 * is "writtten said this" and marking it would make attribution noise rather
 * than signal.
 *
 * A card is `live` only when the connected session is *the same session* that
 * submitted it. Re-pairing produces a new `sessionId`, so cards from the
 * previous run correctly read `disconnected` even though something is connected
 * — they are not that agent's cards any more.
 */
export function sourceChipView(
  source: ObservationSource | undefined,
  status: AgentSourceStatus
): SourceChipView | null {
  if (!source) return null;

  const label = source.name;
  const sameSession = status.sessionId === source.sessionId;

  if (status.state === "connected" && sameSession) {
    return {
      label,
      state: "live",
      title: `Submitted by ${label}, which is connected. Observations from a connected agent are not covered by writtten's precision checks.`,
    };
  }

  if (status.state === "revoked" && sameSession) {
    return {
      label,
      state: "revoked",
      title: `Submitted by ${label}. You revoked this connection and kept its observations.`,
    };
  }

  return {
    label,
    state: "disconnected",
    title: `Submitted by ${label}, which is no longer connected. The observation stays until you dismiss it.`,
  };
}
