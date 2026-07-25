/**
 * Lifecycle operations that only an external source may perform on its own
 * cards (BYOA / PR3).
 *
 * Two closures live here, and neither is an evaluator judgement:
 *
 * - **retract** — the agent withdrawing an observation it submitted. Scoped to
 *   its own `sessionId` by design: a session can never close a card it didn't
 *   write, and never a native one. Including a *previous session of the same
 *   agent* — asked and answered 2026-07-25: stale cards from yesterday's pass are
 *   the user's to clear, and letting a fresh pairing sweep them would make
 *   "this source's cards" mean two different things to revoke and to retract.
 *   → docs/mechanics/agent-bridge.md § Retract and revoke.
 * - **revoke + bulk archive** — the user tearing down a pairing and choosing to
 *   clear out what that source left behind.
 *
 * Neither writes a `DismissalSuppression`. Suppression encodes *the user
 * rejected this finding*; an agent withdrawing its own card and a user clearing
 * a source are different acts, and conflating them would mute observations the
 * user never dismissed.
 *
 * See docs/mechanics/agent-bridge.md.
 */

import {
  loadActiveObservationsForDocument,
  loadObservation,
  updateObservationStatus,
  type Observation,
} from "../store/db";
import { archiveObs } from "./evaluatorReconcile";

/** Closure reason written when an agent withdraws its own observation. The
 *  archive drawer renders this as "withdrawn by <name>" (see closureLabel.ts) —
 *  who closed it, never why: the user may have asked for the cull, and writtten
 *  never sees that conversation. Kept as `retracted` on the wire and in the debug
 *  log, where the word names the mechanism rather than addressing the user. */
export const RETRACTED_REASON = "retracted";
/** Closure reason written by the bulk archive at revoke time. */
export const SOURCE_REVOKED_REASON = "source_revoked";

/** How many active cards a given source currently holds. Drives the revoke
 *  confirm's "archive N observations" count, so the user is told the size of
 *  what they're about to clear rather than agreeing to an unknown. */
export function countActiveFromSource(observations: Observation[], sessionId: string): number {
  return observations.filter(
    (o) => o.status === "active" && o.source?.sessionId === sessionId
  ).length;
}

/**
 * Withdraw a single observation on behalf of the session that submitted it.
 *
 * Returns `false` — writing nothing — when the observation is missing, is not
 * external, belongs to a different session, or is already closed. The bridge
 * relays an ack either way; a `false` is not an error condition, it's a refusal.
 */
export async function retractExternalObservation(
  observationId: string,
  sessionId: string
): Promise<boolean> {
  const obs = await loadObservation(observationId);
  if (!obs) return false;
  if (obs.status !== "active") return false;
  // The identity check that makes retract safe: a session may only close what
  // it wrote. Native cards (no source) fail this too, which is the point.
  //
  // Half of a wall whose other half is in `agentSnapshot.ts`: the snapshot ships
  // no observation ids, so the only id an agent ever holds is one this app handed
  // back on its own accepted submission. That is what makes this check
  // unbypassable rather than merely correct — an agent has nothing else to name.
  // Adding ids to the snapshot would quietly reduce it to guess-resistance.
  // Pinned from both sides (`externalObservationLifecycle.test.ts` § the wall,
  // `agentSnapshot.test.ts` § the allowlist).
  if (obs.source?.sessionId !== sessionId) return false;

  await updateObservationStatus(observationId, "auto_closed", RETRACTED_REASON);
  archiveObs(obs, "retracted");
  return true;
}

/**
 * Close every active card a source submitted — the "archive everything from
 * this source" half of revoke. Returns how many were closed.
 *
 * Deliberately scoped to `sessionId`, not to the display name: two runs of the
 * same agent are two sources, and revoking one must not sweep up cards the user
 * kept from an earlier session.
 */
export async function archiveExternalSource(docId: string, sessionId: string): Promise<number> {
  const active = await loadActiveObservationsForDocument(docId);
  const mine = active.filter((o) => o.source?.sessionId === sessionId);

  for (const obs of mine) {
    await updateObservationStatus(obs.id, "auto_closed", SOURCE_REVOKED_REASON);
    archiveObs(obs, "source_revoked");
  }

  return mine.length;
}
