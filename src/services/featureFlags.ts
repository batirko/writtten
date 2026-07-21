/**
 * Feature flags.
 *
 * Most flags here are build-time consts, following the `DEBUG_PANEL_ENABLED` precedent
 * in `ControlCenter.tsx` — one obvious toggle point, and a literal `false` lets the
 * bundler dead-code-eliminate the whole gated surface.
 */

const AGENT_PREVIEW_KEY = "writtten_agent_preview";

/**
 * Bring-your-own-agent bridge ("Connect your agent").
 *
 * **Runtime-gated, not build-gated — deliberately, and temporarily.** The code ships
 * (so there is no dead-code-elimination win to preserve here), but the surface is only
 * visible to a session that has opted in with `?agent=1`. That opt-in is remembered in
 * `localStorage` so it survives reloads and in-app navigation — otherwise every check of
 * the flow would need the query string re-appended, and the first-run modal would lose it
 * the moment anything navigated.
 *
 * Why gated at all, given the flag is otherwise "on": PR4 shipped to writtten.com so the
 * one remaining unknown could be answered — Chrome's Local Network Access prompt only fires
 * from a *public* origin, so it is untestable anywhere else. That was a verification
 * release, not a launch. Three follow-ups were named as preconditions: prompt slimming,
 * engine exclusivity, observability.
 *
 * **All three have landed** (#234 engine exclusivity, #240 the agent status row, #243 the
 * connect-prompt rework), **so this gate is the only thing left before BYOA is a public
 * feature — and removing it is a launch decision, not a cleanup.** Delete
 * `agentPreviewEnabled`'s body in favour of `true`, and drop the `noindex` on
 * `public/agent/index.html`, whose comment cites a prompt-size problem that no longer
 * exists.
 *
 * One caveat worth carrying into that decision: #243 found that a *fresh* agent session
 * refuses some prompt shapes outright, and the shipped shape was verified by hand rather
 * than by anything CI can run (OBS-040). Whoever removes the gate is pointing strangers'
 * agents at it, so re-run that check on whatever the prompt says at that moment.
 *
 * Turning it off entirely is still a complete kill switch: no connect section, no process
 * readout row, no first-run on-ramps. Cards already in the feed keep their source chips —
 * attribution is not flag-gated, because an observation an agent wrote must not start
 * reading as writtten's own just because a flag moved.
 */
export function agentBridgeEnabled(): boolean {
  try {
    if (
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).has("agent")
    ) {
      // Capability-checked, not existence-checked: some environments expose a
      // defined-but-inert Storage (see agentBridgeClient's safeLocalStorage).
      if (typeof localStorage?.setItem === "function") {
        localStorage.setItem(AGENT_PREVIEW_KEY, "1");
      }
      return true;
    }
    return (
      typeof localStorage?.getItem === "function" &&
      localStorage.getItem(AGENT_PREVIEW_KEY) === "1"
    );
  } catch {
    return false; // storage blocked, or no DOM — stay hidden rather than guess
  }
}
