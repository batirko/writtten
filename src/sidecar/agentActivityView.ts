/**
 * Pure derivation of "what is the connected agent doing right now" (BYOA).
 *
 * Why this exists at all: `setActivityPending` publishes the count of *writtten's
 * own* outstanding eval work, and BYOA makes zero model calls — so the status row
 * reads `idle` for the entire time an agent is reviewing. This module is the
 * agent-side answer to the same question, and it feeds the **status row** (the
 * verb) rather than a line of its own; the `agent` row carries only the noun —
 * who is attached and whether they are still there.
 *
 * Two constraints shape every decision here, and both are load-bearing:
 *
 * 1. **"Finished" is not observable.** The protocol has no done message — the
 *    agent simply stops, and the skill tells it to report to the *user*, not to
 *    writtten. Adding a required done call would grow a prompt we are actively
 *    shrinking. So the working state must DECAY: an unresolvable spinner is
 *    worse than no spinner. Decay here is *derived from timestamps*, never
 *    scheduled — there is no timer to leak, and a re-render at any moment
 *    produces the correct phase.
 *
 * 2. **Report facts, not progress.** Elapsed time is something we know; how far
 *    along a peer's review is, we do not. So the phrase carries a counter, never
 *    an estimate.
 *
 * `watching` is the phase that earns its keep: an agent parked in `GET /wait` and
 * an agent that has wandered off are both "not computing", but one will react the
 * moment you type and the other never will. Collapsing them into one `idle` is
 * what made a stalled watch-loop indistinguishable from a finished pass.
 */

/** Silence (no pull, submission, or wait) after which the agent stops reading as
 *  present. `GET /wait` re-arms every ≤60 s by its own timeout, so a watching
 *  agent comfortably stays inside this window. */
export const AGENT_PASS_IDLE_MS = 90_000;

/**
 * - `none` — paired, nothing has travelled yet.
 * - `awaiting` — a snapshot went out; the agent has not read it.
 * - `reading` — the agent pulled `/doc` and is reviewing.
 * - `watching` — parked in `/wait`: idle, but it will react when you type.
 * - `quiet` — nothing heard for the idle window. Not a fault; just not here.
 */
export type AgentPassPhase = "none" | "awaiting" | "reading" | "watching" | "quiet";

/** Raw facts the bridge client observes. Every field is a timestamp — nothing
 *  that encodes a judgement about the agent's progress. */
export interface AgentPass {
  /** Last successful snapshot push. `null` before the first one lands. */
  lastPushAt: number | null;
  /** Last `GET /doc` — the only "started" signal the protocol has. */
  lastPullAt: number | null;
  /** Most recent submission relayed in this pass. Kept for decay only: a
   *  rejected burst is still the agent working, so it re-arms the window. It is
   *  deliberately NOT surfaced as a count — it counts submissions, not
   *  acceptances, so "5 submitted" can sit above a feed that gained nothing. */
  lastSubmissionAt: number | null;
  /** Last `GET /wait` — the agent parking in watch mode. */
  lastWaitAt: number | null;
}

export const EMPTY_PASS: AgentPass = {
  lastPushAt: null,
  lastPullAt: null,
  lastSubmissionAt: null,
  lastWaitAt: null,
};

/** The last moment the agent demonstrably did anything. */
function lastHeardFrom(pass: AgentPass): number | null {
  const stamps = [pass.lastPullAt, pass.lastSubmissionAt, pass.lastWaitAt].filter(
    (t): t is number => t !== null
  );
  return stamps.length === 0 ? null : Math.max(...stamps);
}

export function agentPassPhase(pass: AgentPass, now: number): AgentPassPhase {
  const heard = lastHeardFrom(pass);
  if (heard === null) return pass.lastPushAt === null ? "none" : "awaiting";
  if (now - heard >= AGENT_PASS_IDLE_MS) return "quiet";

  // Whichever signal is most recent wins, which orders the watch cycle correctly
  // without any state machine: park (/wait) → wake → pull (/doc) → submit →
  // park again. A submission during a review keeps it `reading`, because the
  // agent has not gone back to waiting yet.
  const active = Math.max(pass.lastPullAt ?? 0, pass.lastSubmissionAt ?? 0);
  return (pass.lastWaitAt ?? 0) >= active ? "watching" : "reading";
}

/** `0:07` / `1:47` / `12:03`. Minutes uncapped — an hour-long pass reads
 *  `73:20`, which is ugly but true, and truer than wrapping to 13:20. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The agent's contribution to the **status** row, or `null` when the agent has
 * nothing to say and the row belongs to whatever else is happening.
 *
 * `quiet` returns `null` rather than a phrase of its own: an agent that has
 * stopped is not a distinct kind of nothing, and giving it one would put two
 * words for the same non-event in the same vocabulary. The hollow dot on the
 * `agent` row already says "attached, not active".
 */
export function agentStatusPhrase(pass: AgentPass, now: number): string | null {
  const phase = agentPassPhase(pass, now);
  if (phase === "awaiting") return "awaiting pickup";
  if (phase === "reading") return `reading · ${formatElapsed(now - (pass.lastPullAt ?? now))}`;
  if (phase === "watching") return "watching";
  return null;
}
