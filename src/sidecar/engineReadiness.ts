/**
 * Can the selected engine actually read the document right now?
 *
 * A separate question from *which engine is selected*, and the app has historically
 * conflated them — which is how it came to assert, on four surfaces at once, a
 * working configuration that did not exist (UX-045): the Engine control showing "An
 * API key" selected with no key stored, the help line promising metering against
 * that key, the process chip naming `gemini-2.0-flash`, and the status row reading
 * `idle` — which reads as *ready and waiting* rather than *cannot run*.
 *
 * **Why this got load-bearing.** Selecting an engine used to imply it worked, because
 * anything that could stop an engine working also moved the selection: disconnecting
 * an agent released the slot to the built-in engine. That release is gone (owner,
 * 2026-07-21 — the tab you are on *is* the selection, and only the Engine control
 * moves it; see `useAgentBridge.cancel`). The gain is that the app no longer chooses
 * a key on the user's behalf the moment they disconnect, which is both a surprise and
 * a way to start spending their quota unasked. The cost is that **"selected but not
 * running" stops being an edge case and becomes an ordinary state** — so it has to be
 * legible rather than inferred. This module is that legibility, in one place, so the
 * readout, the chip, and Settings cannot drift apart.
 *
 * Deliberately pure and argument-injected (the `agentBrowserSupport.ts` precedent):
 * it reads no storage and no module signal, so every caller passes what it already
 * knows and the whole matrix is testable without a DOM.
 */

import type { EngineId } from "../services/evalEngine";

export interface EngineReadinessInput {
  /** Which engine holds the slot. */
  engine: EngineId;
  /** Does the active provider have a key that could actually run a check? */
  hasActiveKey: boolean;
  /** Is an agent attached and able to serve? `connected` only — a pairing that is
   *  merely waiting has nobody on the other end yet. */
  agentConnected: boolean;
}

export interface EngineReadiness {
  /** True when something is genuinely able to read the document. */
  ready: boolean;
  /**
   * What the always-visible identity chip should say when not ready. `null` when
   * ready, in which case the caller names the model or the agent as before.
   *
   * Phrased as the *missing precondition*, not as an instruction — "no key set", not
   * "add a key". The control center reports state; the on-ramps do the asking.
   */
  chipText: string | null;
  /**
   * One plain sentence for Settings, naming the consequence rather than the cause.
   * The user does not need to be told they have no key — they need to be told the
   * document is not being read, which is the part that is easy to miss.
   */
  settingsNote: string | null;
}

const READY: EngineReadiness = { ready: true, chipText: null, settingsNote: null };

/** The one sentence, shared by both engines on purpose: the consequence is identical
 *  whichever precondition is missing, and saying it two ways would imply otherwise. */
const NOTHING_READING = "Nothing is reading your document.";

export function engineReadiness({
  engine,
  hasActiveKey,
  agentConnected,
}: EngineReadinessInput): EngineReadiness {
  if (engine === "agent") {
    return agentConnected
      ? READY
      : // The agent panel already says "Connect your agent" one line below, so this
        // does not repeat the instruction — it supplies the fact that panel omits.
        { ready: false, chipText: "no agent connected", settingsNote: NOTHING_READING };
  }
  return hasActiveKey
    ? READY
    : { ready: false, chipText: "no key set", settingsNote: NOTHING_READING };
}
