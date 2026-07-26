/**
 * Feature flags.
 *
 * Most flags here are build-time consts, following the `DEBUG_PANEL_ENABLED` precedent
 * in `ControlCenter.tsx` — one obvious toggle point, and a literal `false` lets the
 * bundler dead-code-eliminate the whole gated surface.
 */

/**
 * Bring-your-own-agent bridge ("Connect your agent").
 *
 * **Public since 2026-07-26.** BYOA was built behind a runtime preview gate — the surface
 * appeared only for a session that had opted in with `?agent=1`, remembered in
 * `localStorage["writtten_agent_preview"]`. That was never a feature toggle. It was a
 * verification device: Chrome's Local Network Access prompt only fires from a *public*
 * origin, so the bridge was untestable anywhere but writtten.com, and shipping it there
 * without keeping strangers out would have been a launch before the preconditions were
 * met. Those preconditions — engine exclusivity, the agent status readout, the
 * connect-prompt rework — all landed, so the gate came off and the `/agent` explainer
 * page lost its `noindex` in the same change.
 *
 * `?agent=1` is now **inert**. Links to it exist in the wild (docs, chat logs); they still
 * work, because everyone gets the feature. The stored key is no longer read or written.
 *
 * **Why this function survives as a `true`.** It is the kill switch. BYOA now points
 * strangers' agents at a prompt whose acceptance was verified by hand rather than by
 * anything CI can run (OBS-040 — a *fresh* agent session refuses some prompt shapes
 * outright), and the whole surface should be revertible in one line rather than in nine.
 * Returning `false` removes the connect section, the process-readout row, and every
 * first-run on-ramp; `evalEngine`'s `read()` additionally resolves a stale stored
 * `"agent"` back to the built-in engine, so nobody is left with a document that nothing
 * reads. Cards already in the feed keep their source chips — attribution is not
 * flag-gated, because an observation an agent wrote must not start reading as writtten's
 * own just because a flag moved.
 */
export function agentBridgeEnabled(): boolean {
  return true;
}
