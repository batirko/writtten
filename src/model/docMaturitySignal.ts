/**
 * Document maturity signal — the live `documentMaturity()` band, published so
 * the sidecar can say *why* a critic is quiet (UX-053).
 *
 * Sibling of `activitySignal` / `docSettleSignal` / `agentSourceSignal`, and a
 * product surface rather than a debug affordance for the same reason they are:
 * the process readout and the feed's empty state both render it, so it must
 * survive the production build. The dev-only `window.__sidecar__` harness is a
 * separate thing and must never become the carrier.
 *
 * **Sole writer: `Editor.tsx`.** It already computes `getMaturity(editor)` on
 * every update to decide whether to arm the doc-idle pass; this publishes the
 * value it is holding anyway rather than recomputing the band anywhere else. A
 * module signal, not a prop, because the two readers are in different React
 * trees — the same argument that put the agent pairing state here.
 *
 * **Known divergence, recorded rather than fixed.** `Editor.getMaturity` counts
 * table text; `snapshotMaturity` (`agentSnapshot.ts`) — the band a connected
 * agent is actually told — excludes it, because `buildCombined` strips tables
 * from the `sections[]` the agent receives. On a table-heavy draft the two can
 * land in different bands, and the readout would then describe a hold the agent
 * is not making. The mechanics doc calls that divergence immaterial to a
 * three-band split and it is left alone here on purpose: publishing the *agent's*
 * band from the bridge instead would give one concept two writers, which is the
 * failure this module's single-writer rule exists to prevent. Unify
 * `getMaturity` and `snapshotMaturity` if it ever stops being immaterial.
 */

import type { MaturityLevel } from "../services/documentMaturity";

type Listener = (level: MaturityLevel) => void;

let level: MaturityLevel = "unformed";
const listeners = new Set<Listener>();

/** Publish the current band. No-op if unchanged, so the per-keystroke call site
 *  in `onUpdate` doesn't churn a React render on every character. */
export function setDocMaturity(next: MaturityLevel): void {
  if (next === level) return;
  level = next;
  for (const l of listeners) l(level);
}

export function getDocMaturity(): MaturityLevel {
  return level;
}

/** Subscribe to band changes. Pushes the current value immediately. */
export function subscribeDocMaturity(listener: Listener): () => void {
  listeners.add(listener);
  listener(level);
  return () => listeners.delete(listener);
}

/** Test-only reset. The module holds process-wide state. */
export function __resetDocMaturity(): void {
  level = "unformed";
  listeners.clear();
}
