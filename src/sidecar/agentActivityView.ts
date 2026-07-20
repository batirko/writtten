/**
 * Pure derivation of "what is the connected agent doing right now" (BYOA).
 *
 * Why this exists at all: `setActivityPending` publishes the count of *writtten's
 * own* outstanding eval work, and BYOA makes zero model calls — so the status row
 * reads `idle` for the entire time an agent is reviewing. This module is the
 * agent-side answer to the same question.
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
 * 2. **Do not reuse the computation vocabulary.** For the API engine "in
 *    progress" means writtten is computing; for the agent engine writtten is
 *    waiting on a peer. Sharing words with the `status` row would imply progress
 *    we cannot measure. So this reports FACTS — sent, picked up at, elapsed,
 *    N submitted — and never a completion estimate. The ticking elapsed counter
 *    is the liveness cue precisely because elapsed time is something we know.
 */

/** Silence (no pull, no submission) after which a pass stops reading as live.
 *  Not an error threshold — `quiet` still shows what the pass produced; it just
 *  stops claiming the agent is mid-read. */
export const AGENT_PASS_IDLE_MS = 90_000;

export type AgentPassPhase = "none" | "sent" | "reading" | "quiet";

/** Raw facts the bridge client observes. Every field is a timestamp or a count —
 *  deliberately nothing that encodes a judgement about the agent's progress. */
export interface AgentPass {
  /** Last successful snapshot push. `null` before the first one lands. */
  lastPushAt: number | null;
  /** Last `GET /doc` — the only "started" signal the protocol has. */
  lastPullAt: number | null;
  /** Most recent submission relayed in this pass. */
  lastSubmissionAt: number | null;
  /** Submissions relayed since this pass began (accepted or rejected — both are
   *  evidence the agent is working). */
  submitted: number;
}

export const EMPTY_PASS: AgentPass = {
  lastPushAt: null,
  lastPullAt: null,
  lastSubmissionAt: null,
  submitted: 0,
};

/** The last moment the agent demonstrably did something. */
function lastHeardFrom(pass: AgentPass): number | null {
  if (pass.lastPullAt === null && pass.lastSubmissionAt === null) return null;
  return Math.max(pass.lastPullAt ?? 0, pass.lastSubmissionAt ?? 0);
}

export function agentPassPhase(pass: AgentPass, now: number): AgentPassPhase {
  const heard = lastHeardFrom(pass);
  // Nothing pushed and nothing heard: the pairing is up but no document has
  // travelled yet. The row falls back to the bare connection state.
  if (heard === null) return pass.lastPushAt === null ? "none" : "sent";
  return now - heard < AGENT_PASS_IDLE_MS ? "reading" : "quiet";
}

/** `0:07` / `1:47` / `12:03`. Minutes uncapped — an hour-long watch-mode pass
 *  reads `73:20`, which is ugly but true, and truer than wrapping to 13:20. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Wall-clock for the decayed state. Injectable so the view is testable without
 *  pinning a locale; the default follows the user's. */
export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The second line under the agent's name in the process readout — or `null` when
 * there is nothing factual to add and the row should stay bare.
 *
 * Present tense carries a live elapsed counter; past tense carries an absolute
 * time. That contrast is the whole point: `reading · 1:47` is a thing happening,
 * `quiet since 14:05` is the last thing we saw. Neither says "done", because we
 * would be guessing.
 */
export function agentPassDetail(
  pass: AgentPass,
  now: number,
  clock: (epochMs: number) => string = formatClock
): string | null {
  const phase = agentPassPhase(pass, now);
  const submitted = pass.submitted > 0 ? ` · ${pass.submitted} submitted` : "";

  if (phase === "none") return null;
  if (phase === "sent") return "sent · not picked up";
  if (phase === "reading") {
    return `reading · ${formatElapsed(now - (pass.lastPullAt ?? now))}${submitted}`;
  }
  const heard = lastHeardFrom(pass);
  return `quiet since ${clock(heard ?? now)}${submitted}`;
}
