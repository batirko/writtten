import { describe, it, expect } from "vitest";
import { ENGINE_OPTIONS, engineHelp } from "./ControlCenter";

/**
 * The engine slot as offered in Settings. Two options only — a key or a connected
 * agent — because the three key vendors are sub-choices *within* the key path, not
 * peers of the agent. Flattening all four into one strip is what the owner rejected
 * on sight: it reads as four interchangeable variants when the two paths differ
 * substantially in setup, cost, and where the document travels.
 */
describe("engine options", () => {
  it("offers exactly the two engines, key first", () => {
    expect(ENGINE_OPTIONS.map((o) => o.id)).toEqual(["builtin", "agent"]);
  });

  it("does not list the key providers as engine peers", () => {
    const labels = ENGINE_OPTIONS.map((o) => o.label.toLowerCase()).join(" ");
    expect(labels).not.toMatch(/gemini|openai|anthropic/);
  });

  /**
   * The per-card source chip is gone, so this line is now the ONLY place the user
   * is told what they are choosing between. It has to carry the substance — who
   * runs the checks, what it costs, where the document goes — not just a name.
   */
  it("names what each path actually costs and where the document goes", () => {
    expect(engineHelp("builtin")).toMatch(/your key/i);
    expect(engineHelp("agent")).toMatch(/no key/i);
    expect(engineHelp("agent")).toMatch(/goes to your agent/i);
    expect(engineHelp("agent")).toMatch(/not to a server of ours/i);
  });

  /**
   * The guard, and the reason this file changed at all.
   *
   * Until 2026-07-25 the assertion above required the OPPOSITE line — the agent
   * help promised the document "never leaves this machine", and the test pinned
   * it there. That is false on this path: a connected agent forwards the writing
   * to whatever model it runs, `/privacy` has said so in print the whole time,
   * and the pre-flight callout was corrected ahead of the rest.
   *
   * A positive assertion alone would not stop the claim coming back — someone
   * appending a warmer clause to the help line passes every check above. So the
   * retired phrasing is named and forbidden outright. Both machine variants
   * ("this machine" / "your machine") are covered because the app and the public
   * /agent/ page each shipped one of them.
   */
  it("never re-promises that the document stays on the machine", () => {
    for (const id of ["builtin", "agent"] as const) {
      expect(engineHelp(id)).not.toMatch(/never leaves (this|your) machine/i);
      expect(engineHelp(id)).not.toMatch(/on your machine entirely/i);
    }
  });

  it("gives the two paths genuinely different copy", () => {
    expect(engineHelp("builtin")).not.toBe(engineHelp("agent"));
  });
});
