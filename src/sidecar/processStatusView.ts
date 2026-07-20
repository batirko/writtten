/**
 * The control-center activity state — one signal for both engines.
 *
 * The dot answers exactly one question: *is something reading my document right
 * now?* That is equally true whether writtten is calling a model or a connected
 * agent is reviewing, so it gets one vocabulary. An earlier draft gave the agent
 * its own visual channel to avoid "reusing the computation semantics"; that
 * over-applied the rule. The constraint worth keeping is **don't imply progress
 * you can't measure** — it does not follow that "busy" needs a second colour.
 * Which engine is busy is a real question, but it is answered one layer in, by
 * the `status` and `agent` rows, not by a 13px dot.
 *
 * Three things stay writtten's alone, each for a mechanical reason rather than
 * for symmetry:
 *
 * - **Tier hue** (`fast` blue / `strong` violet) names *which model we called*.
 *   An agent pass has no tier, so it must not paint one — hence `dotTier` keys
 *   on our own in-flight count, not on the shared `working` state.
 * - **`stalled`** is our stall detector watching our own outstanding calls. It
 *   has nothing to watch on an agent, and an agent that simply stopped is
 *   reported as `quiet`, not as a fault.
 * - **Decay.** Our side resolves because `pending` returns to 0; the agent side
 *   has to resolve itself, because no message ever tells us it finished (see
 *   agentActivityView). Different mechanism, same visible outcome.
 */

export interface ProcessStatusInput {
  /** writtten's own outstanding eval work. */
  pending: number;
  stalled: boolean;
  /** A connected agent is mid-pass — `agentPassPhase(...) === "reading"`. */
  agentReading: boolean;
  /** Tier of our in-flight call, floored for visibility. */
  displayTier: "fast" | "strong" | null;
}

export interface ProcessStatusView {
  anchorState: "idle" | "working" | "stalled";
  statusText: string;
  dotTier: "fast" | "strong" | null;
}

export function processStatusView({
  pending,
  stalled,
  agentReading,
  displayTier,
}: ProcessStatusInput): ProcessStatusView {
  const anchorState = stalled ? "stalled" : pending > 0 || agentReading ? "working" : "idle";

  // Our own work names itself specifically (the count is actionable); an agent
  // pass says who is busy without borrowing "evaluating", which would claim a
  // model call that never happened. When both are live, ours wins the row — the
  // agent's own line sits directly beneath it with the detail.
  const statusText = stalled
    ? "still working…"
    : pending > 0
      ? `evaluating · ${pending}`
      : agentReading
        ? "agent reading"
        : "idle";

  return {
    anchorState,
    statusText,
    // Gated on OUR in-flight call, not on `working`: an agent-only pass has no
    // model tier and must never render the strong-adjudication hue.
    dotTier: pending > 0 && anchorState === "working" ? displayTier : null,
  };
}
