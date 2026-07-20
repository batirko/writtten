/**
 * The control-center activity state — one vocabulary, whichever engine holds the slot.
 *
 * Two jobs, split by part of speech:
 *
 * - **`status` is the verb.** What is happening right now, whichever engine is
 *   selected. One place, said once. The dot mirrors it by one rule: the
 *   states that mean *something is computing* pulse, everything else rests.
 * - **The identity row is the noun.** Which engine is reading — a model name
 *   under the built-in engine, the agent's name under a connected one. It
 *   carries no phase word of its own: an earlier draft had the status row say
 *   "agent reading" while a second row said "reading · 0:20", the same fact
 *   twice in adjacent lines.
 *
 * **Exactly one engine reads the document** (owner, 2026-07-20 —
 * `docs/projects/agent_connected_eval.md` § Engine exclusivity). That is why
 * `engine` is a required input rather than something inferred from whether an
 * agent happens to be attached: an agent's `pass` facts outlive a revoke, so a
 * recently-torn-down source would otherwise keep painting "reading · 0:05" with
 * nothing reading.
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

import type { EngineId } from "../services/evalEngine";

export interface ProcessStatusInput {
  /** Which engine currently holds the slot. Only the selected one may speak. */
  engine: EngineId;
  /** writtten's own outstanding eval work. */
  pending: number;
  stalled: boolean;
  /** From `agentStatusPhrase` — the agent's claim on the verb slot, or `null`.
   *  Consulted only while the agent engine is selected. */
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
  engine,
  pending,
  stalled,
  agentPhrase,
  displayTier,
}: ProcessStatusInput): ProcessStatusView {
  // Only the selected engine may claim the verb. `pass` facts survive a revoke,
  // so an unselected agent's phrase is stale by construction.
  const phrase = engine === "agent" ? agentPhrase : null;
  const agentActive = phraseIsActive(phrase);
  const anchorState = stalled ? "stalled" : pending > 0 || agentActive ? "working" : "idle";

  // `pending` and `stalled` stay unconditional, on purpose. Under the agent engine
  // a non-zero `pending` is not stale — it is a call armed before the switch, which
  // is deliberately never cancelled. Suppressing it for symmetry would print "idle"
  // while writtten is demonstrably computing, in exactly the window a user is most
  // likely to be confused about who is doing what.
  //
  // Our own work names itself specifically (the count is actionable). Otherwise the
  // agent's phrase takes the row verbatim — never rewritten into "evaluating", which
  // would claim a model call that never happened.
  const statusText = stalled
    ? "still working…"
    : pending > 0
      ? `evaluating · ${pending}`
      : (phrase ?? "idle");

  return {
    anchorState,
    statusText,
    // Gated on OUR in-flight call, not on `working`: an agent-only pass has no
    // model tier and must never render the strong-adjudication hue.
    dotTier: pending > 0 && anchorState === "working" ? displayTier : null,
  };
}
