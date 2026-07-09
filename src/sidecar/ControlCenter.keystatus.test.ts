import { describe, it, expect } from "vitest";
import { keyShapeOk, geminiTierToCheck, keyStatusView } from "./ControlCenter";

// The key subtitle must say what we actually know — stored vs. checking vs.
// verified/rejected — rather than "a string is present". These pure helpers
// produce the local shape check and the state→label mapping the subtitle reads.

describe("keyShapeOk — local wrong-provider guard", () => {
  it("empty key never nags", () => {
    expect(keyShapeOk("openai", "")).toBe(true);
    expect(keyShapeOk("openai", "   ")).toBe(true);
  });

  it("accepts a well-shaped key per provider", () => {
    expect(keyShapeOk("gemini", "AIzaSyABC123")).toBe(true);
    expect(keyShapeOk("openai", "sk-proj-abc")).toBe(true);
    expect(keyShapeOk("anthropic", "sk-ant-api03-abc")).toBe(true);
  });

  it("flags a Gemini key pasted into the OpenAI field", () => {
    expect(keyShapeOk("openai", "AIzaSyABC123")).toBe(false);
  });

  it("flags a bare OpenAI key in the Anthropic field (needs sk-ant- prefix)", () => {
    expect(keyShapeOk("anthropic", "sk-proj-abc")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(keyShapeOk("openai", "  sk-abc  ")).toBe(true);
  });
});

describe("geminiTierToCheck — fold tier probe into the shared vocabulary", () => {
  it("maps each tier to a verification status", () => {
    expect(geminiTierToCheck("idle")).toBe("idle");
    expect(geminiTierToCheck("detecting")).toBe("checking");
    expect(geminiTierToCheck("free")).toBe("ok");
    expect(geminiTierToCheck("paid")).toBe("ok");
    expect(geminiTierToCheck("invalid")).toBe("invalid");
    expect(geminiTierToCheck("unknown")).toBe("network");
  });
});

describe("keyStatusView — honest subtitle mapping", () => {
  const base = { shapeOk: true, shape: "sk-…" };

  it("no key → muted 'No key set'", () => {
    const v = keyStatusView({ ...base, hasKey: false, check: "idle" });
    expect(v).toEqual({ cls: "muted", text: "No key set" });
  });

  it("wrong shape beats any verify state → bad, names the shape", () => {
    const v = keyStatusView({ ...base, hasKey: true, shapeOk: false, check: "ok" });
    expect(v.cls).toBe("bad");
    expect(v.text).toContain("sk-…");
  });

  it("checking → checking", () => {
    const v = keyStatusView({ ...base, hasKey: true, check: "checking" });
    expect(v.cls).toBe("checking");
  });

  it("ok → verified (green)", () => {
    const v = keyStatusView({ ...base, hasKey: true, check: "ok" });
    expect(v).toEqual({ cls: "ok", text: "✓ Key verified" });
  });

  it("invalid → rejected (bad)", () => {
    const v = keyStatusView({ ...base, hasKey: true, check: "invalid" });
    expect(v).toEqual({ cls: "bad", text: "✗ Key rejected" });
  });

  it("billing / rate_limited → valid-but-warn, not a plain green check", () => {
    expect(keyStatusView({ ...base, hasKey: true, check: "billing" }).cls).toBe("warn");
    expect(keyStatusView({ ...base, hasKey: true, check: "rate_limited" }).cls).toBe("warn");
  });

  it("stored but unverified (idle / network / error) → warn, never a false 'verified'", () => {
    expect(keyStatusView({ ...base, hasKey: true, check: "idle" }).cls).toBe("warn");
    expect(keyStatusView({ ...base, hasKey: true, check: "network" }).cls).toBe("warn");
    expect(keyStatusView({ ...base, hasKey: true, check: "error" }).cls).toBe("warn");
    // the exact regression: a stored-but-unchecked key must not claim the green
    // "✓ Key verified" (nor the old over-claiming "✓ Key set").
    const idleText = keyStatusView({ ...base, hasKey: true, check: "idle" }).text;
    expect(idleText).not.toContain("✓ Key verified");
    expect(idleText).not.toContain("Key set");
  });
});
