/**
 * Observations-changed signal — a tiny observable fired when something outside the
 * evaluation pipeline writes an observation, so the feed can refresh.
 *
 * Sibling of `activitySignal`. The orchestrator's own writes already reach the feed via
 * the `onComplete` callback threaded through `scheduleEval`; an agent-submitted
 * observation has no such callback, because it never went through an eval pass.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Announce that the observation store changed. */
export function notifyObservationsChanged(): void {
  for (const l of listeners) l();
}

export function subscribeObservationsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
