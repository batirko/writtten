/**
 * Activity signal — a tiny observable carrying the count of outstanding
 * evaluation work (debouncing, queued, or in flight). Drives the activity-center
 * dot's "working" pulse. Product feature (not dev-only): this is the sibling of
 * `stallSignal` — the user needs to see that the AI is thinking, and that cue
 * must survive the production build.
 *
 * Historically the dot's "working" state read from the dev-only acceptance
 * harness's `pending` count, so it never lit up in a production build (the
 * harness is stripped when `import.meta.env.DEV` is false). This module is the
 * production-safe source; the orchestrator pushes the same count here that it
 * feeds the harness in dev.
 */

type Listener = (pending: number) => void;

let pending = 0;
const listeners = new Set<Listener>();

/** Push the current outstanding-work count. No-op if unchanged. */
export function setActivityPending(value: number): void {
  if (value === pending) return;
  pending = value;
  for (const l of listeners) l(pending);
}

export function getActivityPending(): number {
  return pending;
}

/** Subscribe to activity changes. Pushes the current value immediately. */
export function subscribeActivity(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}
