/**
 * Model-deprecation early-warning helpers, shared by the live pool-liveness check
 * (poolLiveness.live.test.ts) and its deterministic unit test (liveness.test.ts).
 *
 * Context & caveat: Gemini `generateContent` can return a 404 whose body reads
 * "This model ... is no longer available" even for a model that is NOT retired —
 * it's an intermittent, misleadingly-worded backend error that flaps 404/200
 * during infra rollouts. (Observed 2026-07-09: gemini-2.5-pro 404'd, then served
 * 200 fifty minutes later; its announced retirement is 2026-10-16.) So a single
 * 404 proves nothing. This check treats a model as suspect only when it 404s on
 * EVERY probe of a run — and even then the verdict is "consistently unreachable,
 * go verify against Google's status/retirement schedule", not a hard "retired".
 * Ground truth for retirement is Google's announced date, not a probe.
 */

import { geminiAdapter } from "./gemini";

/**
 * Does this generateContent response look like a deprecation signal (vs. a
 * throttle)? A 404, or Google's "no longer available" string, both qualify. A
 * 429 (quota / rate-limit) does NOT — the model is alive, just budget-limited.
 * A single such response may still be transient; see isConsistentlyUnreachable.
 */
export function isDeprecationSignal(status: number, body: string): boolean {
  return status === 404 || body.toLowerCase().includes("no longer available");
}

/**
 * Given repeated probe results for one model, is it *consistently* unreachable?
 * True only if EVERY attempt produced a deprecation signal — a model that
 * answered even once in the run is alive, and the 404s were transient. Requiring
 * unanimity is what separates a real/whole retirement from a rollout flap. An
 * empty result set is not "unreachable" (nothing was observed).
 */
export function isConsistentlyUnreachable(probes: { status: number; body: string }[]): boolean {
  return probes.length > 0 && probes.every((r) => isDeprecationSignal(r.status, r.body));
}

/** Every distinct model id the Gemini router can route to (free/paid × fast/strong). */
export function pooledGeminiModels(): string[] {
  const p = geminiAdapter.pools;
  return [...new Set([...p.freeFast, ...p.freeStrong, ...p.paidFast, ...p.paidStrong])];
}
