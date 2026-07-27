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
let lastCompletedAt: number | null = null;
const listeners = new Set<Listener>();

/**
 * Record that an evaluation **completed and produced a result** for the current
 * document. Called from `evaluator.ts` at the end of a successful section pass.
 *
 * **Positive by construction, and it has to be.** The first version of this
 * inferred completion from the falling edge of `pending` and merely suppressed it
 * when an error had been noted. That was wrong twice over, and the running app
 * showed it: every `evaluate*` entry point swallows its own exception, so a
 * failed batch drains identically to a successful one — and worse, a batch where
 * nothing ran at all (a doc pass that returns early on its dirty-check, a
 * coalesce timer that finds no work) drains with no error to suppress, so the
 * absence of a failure was never evidence that anything had been read. A fake API
 * key produced "read your draft — nothing to raise" under both versions.
 *
 * So this is not "no error happened"; it is "a model answered and we wrote the
 * result down". An all-clear is the single worst thing to say to an author whose
 * document nothing managed to read, which is why the weaker inference does not
 * belong here.
 */
export function noteEvalCompleted(): void {
  lastCompletedAt = Date.now();
}

/** Push the current outstanding-work count. No-op if unchanged. */
export function setActivityPending(value: number): void {
  if (value === pending) return;
  pending = value;
  for (const l of listeners) l(pending);
}

/**
 * When an evaluation last completed successfully, or `null` if none has in this
 * session.
 *
 * `null` is load-bearing and must not be softened to `0`: it is the difference
 * between *nothing has read this document yet* and *something read it and had
 * nothing to say*, which is exactly the distinction the feed's quiet state
 * exists to draw.
 */
export function getLastCompletedAt(): number | null {
  return lastCompletedAt;
}

/** Test-only reset. Module-level state survives between cases otherwise. */
export function __resetActivitySignal(): void {
  pending = 0;
  lastCompletedAt = null;
  listeners.clear();
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
