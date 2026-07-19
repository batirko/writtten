/**
 * "Agent only" mode — the source toggle's persisted half (BYOA decisions 2/8).
 *
 * Default is OFF: connecting an agent never silently pauses the built-in
 * evaluator. That default is the trust-relevant half of the decision — the
 * built-in checks are the precision-guarded source, and the user should have to
 * choose to give them up (typically to save free-tier RPD), never drift into it.
 *
 * Read-through rather than cached, because `orchestrator.ts` is not a React
 * component and has no props: it needs a plain synchronous getter it can call at
 * the moment it decides whether to arm an eval. The read is a `localStorage`
 * hit a few times per settle at most.
 *
 * The gate is a *don't-start* check, never a cancel — in-flight evaluation work
 * always runs to completion when the toggle flips.
 */

const STORAGE_KEY = "writtten_agent_only_mode";

type Listener = (agentOnly: boolean) => void;
const listeners = new Set<Listener>();

/** Whether built-in evaluation is currently paused in favour of the agent.
 *  Any storage failure (private mode, quota, disabled) reads as `false` — the
 *  safe direction is "our own checks keep running". */
export function isAgentOnly(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAgentOnly(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Non-fatal: the toggle still takes effect for this session via listeners.
  }
  for (const l of listeners) l(on);
}

/** Subscribe to toggle changes. Pushes the current value immediately. */
export function subscribeAgentOnly(listener: Listener): () => void {
  listeners.add(listener);
  listener(isAgentOnly());
  return () => listeners.delete(listener);
}
