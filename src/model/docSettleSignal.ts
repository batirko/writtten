/**
 * Document-settle signal — "the author stopped typing and the document is in a
 * readable state." Sibling of `activitySignal` / `docSnapshotSource`.
 *
 * **Why this is not `activitySignal`.** The agent bridge originally derived its
 * wake from the falling edge of the orchestrator's outstanding-work count: when
 * writtten's own eval queue drained, the document had by implication settled.
 * That held only while writtten always ran an evaluation. Engine exclusivity
 * (2026-07-20) made the built-in evaluator stand down whenever an agent holds
 * the slot, so in exactly the mode the bridge exists for, the count never leaves
 * 0 — no rising edge, therefore no falling edge, therefore no snapshot after the
 * one pushed at connect. A connected agent reviewed an empty document forever
 * (UX-033).
 *
 * The bug was a conflation, so the fix is a separation: *the document settled*
 * is a fact about the document, and *writtten has no outstanding work* is a fact
 * about our pipeline. They coincided for one release. This module owns the
 * former, and nothing about it can be switched off by an engine gate.
 *
 * `pending` is deliberately NOT reused to carry this: `processStatusView` treats
 * a non-zero count under the agent engine as a real in-flight call armed before
 * the switch, and prints `evaluating · N` for it. Arming a counter for work that
 * will never run would make that readout lie.
 *
 * No payload: subscribers read the document themselves (`readLiveDoc`). Keeping
 * the signal contentless is what lets it stay id-free and DB-free, which is the
 * same boundary invariant that shapes `docSnapshotSource`.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Announce that the document has settled. Fires every time — this is an event,
 *  not a level, so there is no de-duplication against a previous value. The
 *  coalescing that makes it fire *once* per burst lives in the orchestrator,
 *  which owns the window. */
export function notifyDocSettled(): void {
  for (const l of listeners) l();
}

/** Subscribe to settle events. Unlike `subscribeActivity` this replays nothing
 *  on subscribe: a settle that happened before you were listening is history,
 *  and re-firing it would push a snapshot the agent already has. */
export function subscribeDocSettled(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
