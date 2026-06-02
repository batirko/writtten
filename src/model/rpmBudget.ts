/**
 * Rolling-window RPM budget tracker.
 *
 * Tracks actual LLM call completions over a 60-second window. The orchestrator
 * queries this before dispatching low-priority (doc-idle) calls to avoid
 * hammering the free-tier limit just before it resets.
 *
 * High-priority calls (block-settle, contradiction) always go through — only
 * doc-idle deferral is gated here. The cool-down registry in gemini.ts handles
 * hard 429 recovery; this is the proactive backpressure layer upstream of that.
 *
 * Free-tier limit: 15 RPM. Conservative cap: 12 (leaves 3 headroom for the
 * burst that will follow a deferred doc-idle firing).
 */

export const RPM_WINDOW_MS = 60_000;
export const RPM_SOFT_LIMIT = 12; // Conservative; hard limit is 15 for Gemini Flash

const timestamps: number[] = [];

/** Record a completed LLM call (called by the model router on each response). */
export function trackCall(): void {
  const now = Date.now();
  timestamps.push(now);
  prune(now);
}

function prune(now: number): void {
  const cutoff = now - RPM_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

/** How many calls were made in the last `windowMs` milliseconds. */
export function recentCallCount(windowMs = RPM_WINDOW_MS): number {
  const now = Date.now();
  prune(now);
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t >= cutoff).length;
}

/** True when we are near the free-tier RPM limit and should defer doc-idle. */
export function isNearLimit(): boolean {
  return recentCallCount() >= RPM_SOFT_LIMIT;
}

/** Test-only: reset all state. */
export function _resetForTests(): void {
  timestamps.length = 0;
}
