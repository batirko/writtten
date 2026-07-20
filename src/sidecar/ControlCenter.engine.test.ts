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
    expect(engineHelp("agent")).toMatch(/never leaves this machine/i);
  });

  it("gives the two paths genuinely different copy", () => {
    expect(engineHelp("builtin")).not.toBe(engineHelp("agent"));
  });
});
