/**
 * Pure state mapping for the control-center agent row (BYOA / PR3).
 *
 * Split out for the same reason as `keyStatusView`: the interesting part is a
 * small state matrix that deserves testing without a DOM.
 *
 * The row exists because the connect section only tells you the pairing state
 * while Settings is open. A connected agent is a second critic writing into the
 * feed — that should be visible from the always-on process readout, next to
 * which model is running, not hidden a modal away.
 */

import type { AgentSourceStatus } from "../model/agentSourceSignal";

export interface AgentStatusView {
  /** Short state word, mirroring the `status` row's vocabulary. */
  text: string;
  /** Drives the dot; also mirrored onto a data attribute so tests and
   *  colour-blind users never depend on hue. */
  state: "waiting" | "connected" | "disconnected";
  /** Composed for screen readers, since the visible text is terse. */
  label: string;
}

/**
 * Reads `agentSourceSignal`, not `BridgeStatus` directly. That signal is the
 * one app-wide carrier for "what is the agent doing" — the per-card chip
 * already reads it, and having the indicator read the same thing means the two
 * surfaces can never disagree, and that a single dev affordance
 * (`__sidecar__.setAgentStatus`) drives both.
 *
 * `null` when there is no live pairing — absent rather than an "idle" row,
 * because most users never connect an agent and a permanent empty row would be
 * the one dead value in a readout of otherwise-live ones. `revoked` is also
 * null: the pairing is gone, and only the kept cards still refer to it.
 */
export function agentStatusView(status: AgentSourceStatus): AgentStatusView | null {
  if (status.state === "idle" || status.state === "revoked") return null;

  const name = status.name ?? "agent";

  if (status.state === "waiting") {
    return { text: "waiting…", state: "waiting", label: "Waiting for your agent to connect" };
  }
  if (status.state === "connected") {
    return { text: name, state: "connected", label: `${name} is connected and reviewing` };
  }
  return {
    text: name,
    state: "disconnected",
    label: `${name} is no longer connected; its observations remain in the feed`,
  };
}
