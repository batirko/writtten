import { describe, it, expect, beforeEach } from "vitest";
import { rung, stepDown, seed, _resetCapabilities } from "./requestCapabilities";

beforeEach(() => _resetCapabilities());

describe("requestCapabilities", () => {
  it("starts every unknown model at the cheapest rung", () => {
    expect(rung("gemini", "gemini-99-flash")).toBe(0);
    expect(rung("openai", "gpt-9")).toBe(0);
  });

  it("keys by provider AND model, so ids never collide across adapters", () => {
    stepDown("gemini", "shared-name", 3);
    expect(rung("gemini", "shared-name")).toBe(1);
    expect(rung("openai", "shared-name")).toBe(0);
  });

  it("stops at the end of the ladder instead of walking off it", () => {
    expect(stepDown("openai", "m", 2)).toBe(true);
    expect(stepDown("openai", "m", 2)).toBe(false);
    // The failed step must not advance the rung past the last real setting.
    expect(rung("openai", "m")).toBe(1);
  });

  it("treats a seeded rung as the starting point, not a ceiling", () => {
    seed("test", { "known-model": 1 });
    expect(rung("test", "known-model")).toBe(1);
    expect(stepDown("test", "known-model", 3)).toBe(true);
    expect(rung("test", "known-model")).toBe(2);
  });

  it("keeps seeds through a reset but drops what the session discovered", () => {
    // The two are stored separately on purpose: a test hook that wiped the
    // adapters' seeds would silently change the shape of every later request.
    seed("test", { seeded: 1 });
    stepDown("test", "discovered", 2);
    expect(rung("test", "discovered")).toBe(1);

    _resetCapabilities();

    expect(rung("test", "seeded")).toBe(1);
    expect(rung("test", "discovered")).toBe(0);
  });
});
