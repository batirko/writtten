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
    expect(engineHelp("agent")).toMatch(/coding agent/i);
    expect(engineHelp("agent")).toMatch(/no key/i);
    expect(engineHelp("agent")).toMatch(/not a writtten server/i);
  });

  /**
   * Both lines describe an outside engine doing the reading under writtten's rules,
   * because that is what both are. The retired split ("writtten runs its own checks"
   * against the agent's) implied two products competing over one feed, which is not
   * the design — and the same framing had leaked into /agent and the connected panel.
   * Pinning the shared clause is what stops one path drifting back into ownership
   * language the next time either line is polished on its own.
   */
  it("describes both engines as something doing the reading, not as writtten vs. an outsider", () => {
    for (const id of ["builtin", "agent"] as const) {
      expect(engineHelp(id)).toMatch(/does the reading/i);
      expect(engineHelp(id)).not.toMatch(/(writtten|its) own checks/i);
    }
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
   * retired phrasing is named and forbidden outright. Every article variant
   * ("this" / "your" / "the") is covered: the app and the public /agent/ page each
   * shipped one of the first two, and the third is the near-miss a 2026-07-27 copy
   * pass actually produced — "a connection that never leaves the machine", which is
   * true of the connection, false-sounding about the document, and would have walked
   * through a guard that only knew two of the three articles.
   */
  it("never re-promises that the document stays on the machine", () => {
    for (const id of ["builtin", "agent"] as const) {
      expect(engineHelp(id)).not.toMatch(/never leaves (this|your|the) machine/i);
      expect(engineHelp(id)).not.toMatch(/on your machine entirely/i);
    }
  });

  it("gives the two paths genuinely different copy", () => {
    expect(engineHelp("builtin")).not.toBe(engineHelp("agent"));
  });
});
