/**
 * Stall signal — a tiny observable flipped when an LLM request exceeds its
 * timeout, so the UI can tell the user "still working…" instead of looking
 * frozen. Product feature (not dev-only): a request that hangs for 40s with no
 * feedback is a worse experience than a visible, honest stall indicator.
 *
 * Semantics: `reportStall()` raises the flag; `reportProgress()` (called on any
 * successful response) lowers it. The next good response clears the stall.
 */

type Listener = (stalled: boolean) => void;

let stalled = false;
const listeners = new Set<Listener>();

function set(value: boolean): void {
  if (value === stalled) return;
  stalled = value;
  for (const l of listeners) l(stalled);
}

/** A request timed out / aborted — surface the stall state. */
export function reportStall(): void {
  set(true);
}

/** A request completed successfully — clear any stall state. */
export function reportProgress(): void {
  set(false);
}

export function isStalled(): boolean {
  return stalled;
}

/** Subscribe to stall changes. Pushes the current value immediately. */
export function subscribeStall(listener: Listener): () => void {
  listeners.add(listener);
  listener(stalled);
  return () => listeners.delete(listener);
}
