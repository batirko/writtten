/**
 * Should the agent path be *offered* on this browser, at all?
 *
 * Two independent reasons to say no, and both have to be asked every time:
 *   1. the BYOA preview flag is off — the documented kill switch (`featureFlags.ts`);
 *   2. this browser can never reach a loopback bridge (`agentBrowserSupport.ts`).
 *
 * Every surface used to ask only the first, which is how writtten came to offer
 * Safari a path it cannot take on three surfaces at once — the welcome modal, the
 * keyless banner, and the Engine control — while the honest "Safari can't reach a
 * bridge" note sat one level *below* the choice, where it is only ever read after
 * the fact (UX-044).
 *
 * One predicate rather than the same `&&` written out three times, for the reason
 * `engineReadiness.ts` exists (UX-045): surfaces that must agree drift apart when
 * each computes the answer itself, and the drift is invisible until someone opens
 * the app in the browser nobody tests in. A fourth on-ramp added later gets the
 * browser check for free by calling this instead of the flag.
 *
 * **Offering is not the same as running**, and this predicate deliberately governs
 * only the first. The slot itself is guarded where it moves (`selectEngine` and the
 * `connect-agent` deep-link in `ControlCenter.tsx`), and a stale `"agent"` left in
 * storage by a session on another browser is handed back at mount by
 * `releaseAgentEngine()` in `useAgentBridge.ts`. Those are separate defences on
 * purpose: hiding a button is a UI decision, and the built-in evaluator staying
 * live is an invariant that must not depend on one.
 */

import { agentBridgeEnabled } from "./featureFlags";
import { currentAgentBrowserSupport } from "./agentBrowserSupport";

export function agentPathOffered(): boolean {
  return agentBridgeEnabled() && currentAgentBrowserSupport().supported;
}
