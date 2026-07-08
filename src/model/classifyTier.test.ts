import { describe, it, expect } from "vitest";
import { classifyTier } from "./classifyTier";

describe("classifyTier", () => {
  it("classifies small/cheap markers as fast", () => {
    for (const id of [
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "claude-haiku-4-5",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "o4-mini",
    ]) {
      expect(classifyTier(id)).toBe("fast");
    }
  });

  it("classifies capable markers as strong", () => {
    for (const id of [
      "gpt-5.5",
      "gpt-5.6",
      "gpt-6",
      "claude-opus-4-6",
      "claude-sonnet-5",
      "gemini-2.5-pro",
    ]) {
      expect(classifyTier(id)).toBe("strong");
    }
  });

  it("a small marker wins over a strong one (gpt-5.5-mini is fast)", () => {
    expect(classifyTier("gpt-5.5-mini")).toBe("fast");
    expect(classifyTier("claude-opus-mini")).toBe("fast");
  });

  it("defaults unknown ids to strong (over-tier, never route a heavy model as fast)", () => {
    expect(classifyTier("some-new-model-x1")).toBe("strong");
    expect(classifyTier("gpt-5.4")).toBe("strong"); // 5.4 is not in the 5.[5-9] strong range and has no fast marker
  });

  it("is case-insensitive", () => {
    expect(classifyTier("GPT-5.4-MINI")).toBe("fast");
    expect(classifyTier("Claude-Sonnet-5")).toBe("strong");
  });
});
