/**
 * Agent source signal — a tiny observable carrying the state of the one
 * connected agent session (BYOA). Sibling of `activitySignal` / `stallSignal`,
 * and production-safe for the same reason: the source chip and the connection
 * indicator are product surfaces, not debug affordances, so they must survive
 * the production build. The dev-only `window.__sidecar__` harness is a separate
 * thing entirely and must never become the carrier for this.
 *
 * Ownership: the bridge client (PR2) is the only writer — it pushes each
 * pairing-state transition here. Everything else in the app reads. Keeping the
 * state in a module rather than React context means non-React services (and the
 * card renderer, which is mounted from two different trees) can reach it
 * without prop-drilling.
 *
 * Exactly one pairing exists at a time by design (see the spec's non-goals: no
 * multi-agent choreography), so this is a single value, not a collection.
 */

import { EMPTY_PASS, type AgentPass } from "../sidecar/agentActivityView";

/** Where the pairing is. `disconnected` means the bridge went away but the
 *  cards it submitted are still in the feed — cards outlive the socket
 *  (decision 7, "persist quietly"). `revoked` means the user tore the pairing
 *  down deliberately and may have kept the cards. */
export type AgentConnectionState =
  | "idle"
  | "waiting"
  | "connected"
  | "disconnected"
  | "revoked";

export interface AgentSourceStatus {
  state: AgentConnectionState;
  /** The agent's self-reported display name, e.g. "Claude Code". */
  name?: string;
  /** Bridge-generated per run. What revoke and retract scope on. */
  sessionId?: string;
  /** Facts about the agent's current review pass, for the process readout.
   *  Absent when no pass has started. Changes at most a few times per pass
   *  (push / pull / submission), so carrying it here doesn't churn the card
   *  chips that read this same signal. */
  pass?: AgentPass;
}

type Listener = (status: AgentSourceStatus) => void;

let status: AgentSourceStatus = { state: "idle" };
const listeners = new Set<Listener>();

/**
 * Field-complete comparison, and it has to stay that way.
 *
 * This was a hand-listed subset of `AgentPass` and rotted silently the moment
 * the type grew: `partedAt` changes *alone* — nothing else moves when an agent's
 * connection drops — so an update carrying only that was discarded as "nothing
 * changed", and the readout kept saying `watching` after the agent had gone.
 * The two fields added beside it survived by luck: `accepted` moves with
 * `lastSubmissionAt` and `readingSince` with `lastPullAt`, both already listed.
 *
 * Written as an exhaustive key walk rather than a longer hand-list, so a new
 * field is compared by default instead of by remembering. `agentSourceSignal.test.ts`
 * pins that per-field, because the failure mode is pure silence: nothing throws,
 * nothing logs, the UI just stops updating for one kind of change — which is why
 * the unit tests passed while the live app was wrong.
 */
const PASS_KEYS = Object.keys(EMPTY_PASS) as (keyof AgentPass)[];

function samePass(a: AgentPass | undefined, b: AgentPass | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return PASS_KEYS.every((k) => a[k] === b[k]);
}

/** Push a new pairing state. No-op if nothing changed, so a bridge client that
 *  re-asserts its state on every poll doesn't churn React renders. */
export function setAgentSourceStatus(next: AgentSourceStatus): void {
  if (
    next.state === status.state &&
    next.name === status.name &&
    next.sessionId === status.sessionId &&
    samePass(next.pass, status.pass)
  ) {
    return;
  }
  status = next;
  for (const l of listeners) l(status);
}

export function getAgentSourceStatus(): AgentSourceStatus {
  return status;
}

/** Subscribe to pairing-state changes. Pushes the current value immediately. */
export function subscribeAgentSource(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

/** Test-only reset. The module holds process-wide state, so a suite that
 *  drives connection states must clear it between cases. */
export function __resetAgentSourceStatus(): void {
  status = { state: "idle" };
  listeners.clear();
}
