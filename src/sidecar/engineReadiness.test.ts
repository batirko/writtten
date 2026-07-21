import { describe, it, expect } from "vitest";
import { engineReadiness } from "./engineReadiness";

/**
 * UX-045 — the app asserted a working configuration that did not exist, on four
 * surfaces at once.
 *
 * These cases exist because the question got harder on 2026-07-21. Disconnecting an
 * agent used to release the eval slot to the built-in engine, so anything that
 * stopped an engine working also moved the selection, and "selected" could stand in
 * for "working" almost everywhere. The release is gone — the tab you are on is the
 * selection, and only the Engine control moves it — which buys the user not being
 * handed a key they never picked, at the cost of making **selected but not running**
 * an ordinary state that has to be said out loud.
 */
describe("engineReadiness", () => {
  it("a key engine with a key is ready, and says nothing extra", () => {
    expect(engineReadiness({ engine: "builtin", hasActiveKey: true, agentConnected: false })).toEqual(
      { ready: true, chipText: null, settingsNote: null }
    );
  });

  it("a connected agent is ready, and says nothing extra", () => {
    expect(engineReadiness({ engine: "agent", hasActiveKey: false, agentConnected: true })).toEqual({
      ready: true,
      chipText: null,
      settingsNote: null,
    });
  });

  it("a key engine with no key is not ready", () => {
    const r = engineReadiness({ engine: "builtin", hasActiveKey: false, agentConnected: false });
    expect(r.ready).toBe(false);
    expect(r.chipText).toBe("no key set");
  });

  it("an agent engine with nothing attached is not ready", () => {
    const r = engineReadiness({ engine: "agent", hasActiveKey: false, agentConnected: false });
    expect(r.ready).toBe(false);
  });

  /**
   * The cross-check that catches the real confusion. Under engine exclusivity only
   * the selected engine may serve, so a stored key does **not** rescue an unattached
   * agent — the document is read by nothing, and saying otherwise would send the user
   * looking for output that is never coming.
   */
  it("a stored key does not make an unattached agent ready", () => {
    expect(
      engineReadiness({ engine: "agent", hasActiveKey: true, agentConnected: false }).ready
    ).toBe(false);
  });

  /** The mirror: an agent attached while the key engine is selected is equally
   *  irrelevant, for the same reason. */
  it("an attached agent does not make a keyless key-engine ready", () => {
    expect(
      engineReadiness({ engine: "builtin", hasActiveKey: false, agentConnected: true }).ready
    ).toBe(false);
  });

  /**
   * Both engines say the same sentence on purpose. The missing precondition differs;
   * the consequence does not, and giving it two phrasings would imply the two
   * not-running states differ in some way that matters to the reader.
   */
  it("names the consequence identically whichever precondition is missing", () => {
    const key = engineReadiness({ engine: "builtin", hasActiveKey: false, agentConnected: false });
    const agent = engineReadiness({ engine: "agent", hasActiveKey: false, agentConnected: false });
    expect(key.settingsNote).toBe(agent.settingsNote);
    expect(key.settingsNote).toMatch(/nothing is reading/i);
  });

  /**
   * Register guard. The control center reports state; the on-ramps ask for things.
   * A note that says "add a key" here competes with the panel directly below it,
   * which is already the on-ramp — and instructing rather than reporting is the
   * failure mode this product is built to avoid.
   */
  it("reports the state rather than instructing the user", () => {
    const r = engineReadiness({ engine: "builtin", hasActiveKey: false, agentConnected: false });
    expect(r.settingsNote).not.toMatch(/\badd\b|\bconnect\b|\bplease\b|\btry\b/i);
    expect(r.chipText).not.toMatch(/\badd\b|\bplease\b/i);
  });
});
