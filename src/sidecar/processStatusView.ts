/**
 * The control-center activity state — one vocabulary, both engines.
 *
 * Two jobs, split by part of speech:
 *
 * - **`status` is the verb.** What is happening right now, whichever engine is
 *   responsible. One place, said once. The dot mirrors it by one rule: the
 *   states that mean *something is computing* pulse, everything else rests.
 * - **`agent` is the noun.** Who is attached and whether they are still there.
 *   It carries no phase word of its own — an earlier draft had the status row
 *   say "agent reading" while the agent row said "reading · 0:20", which is the
 *   same fact twice in adjacent lines.
 *
 * The dot answers exactly one question: *is something reading my document right
 * now?* That is equally true whether writtten is calling a model or an agent is
 * reviewing, so it gets one vocabulary. An earlier draft gave the agent its own
 * visual channel to avoid "reusing the computation semantics"; that over-applied
 * the rule. The constraint worth keeping is **don't imply progress you can't
 * measure** — it does not follow that "busy" needs a second colour.
 *
 * Three things stay writtten's alone, each for a mechanical reason rather than
 * for symmetry:
 *
 * - **Tier hue** (`fast` blue / `strong` violet) names *which model we called*.
 *   An agent pass has no tier, so `dotTier` keys on our own in-flight count.
 * - **`stalled`** is our stall detector watching our own outstanding calls. It
 *   has nothing to watch on an agent, and an agent that simply stopped is
 *   reported as absent, not as a fault.
 * - **Decay.** Our side resolves because `pending` returns to 0; the agent side
 *   has to resolve itself, because no message ever tells us it finished.
 *
 * `watching` vs `idle` is the distinction the split exists for. Neither is
 * computing, so neither pulses — but one means a critic is attached and will
 * react the moment you type, and the other means nothing is going to happen.
 * Burying that under a name would hide the difference that matters most.
 */

export interface ProcessStatusInput {
  /** writtten's own outstanding eval work. */
  pending: number;
  stalled: boolean;
  /** From `agentStatusPhrase` — the agent's claim on the verb slot, or `null`. */
  agentPhrase: string | null;
  /** Tier of our in-flight call, floored for visibility. */
  displayTier: "fast" | "strong" | null;
}

export interface ProcessStatusView {
  anchorState: "idle" | "working" | "stalled";
  statusText: string;
  dotTier: "fast" | "strong" | null;
}

/** The agent phrases that mean a peer is actively reviewing. `watching` and
 *  `awaiting pickup` are true statements about a peer that is NOT working —
 *  the agent is parked, or hasn't looked yet — so they must not pulse the dot.
 *  Pulsing on `watching` would be the unresolvable spinner in a new costume,
 *  since a watch loop can idle for hours. */
function phraseIsActive(phrase: string | null): boolean {
  return phrase !== null && phrase.startsWith("reading");
}

export function processStatusView({
  pending,
  stalled,
  agentPhrase,
  displayTier,
}: ProcessStatusInput): ProcessStatusView {
  const agentActive = phraseIsActive(agentPhrase);
  const anchorState = stalled ? "stalled" : pending > 0 || agentActive ? "working" : "idle";

  // Our own work names itself specifically (the count is actionable). Otherwise
  // the agent's phrase takes the row verbatim — never rewritten into
  // "evaluating", which would claim a model call that never happened.
  const statusText = stalled
    ? "still working…"
    : pending > 0
      ? `evaluating · ${pending}`
      : (agentPhrase ?? "idle");

  return {
    anchorState,
    statusText,
    // Gated on OUR in-flight call, not on `working`: an agent-only pass has no
    // model tier and must never render the strong-adjudication hue.
    dotTier: pending > 0 && anchorState === "working" ? displayTier : null,
  };
}
