import { describe, it, expect } from "vitest";
import { isDeprecationSignal, isConsistentlyUnreachable, pooledGeminiModels } from "./liveness";

describe("isDeprecationSignal", () => {
  it("treats a 404 as a deprecation signal", () => {
    expect(isDeprecationSignal(404, "")).toBe(true);
  });

  it("treats Google's 'no longer available' body as a signal regardless of status", () => {
    expect(
      isDeprecationSignal(404, "This model models/gemini-2.5-pro is no longer available.")
    ).toBe(true);
    expect(isDeprecationSignal(400, "model is no longer available")).toBe(true);
  });

  it("does NOT treat a 429 (quota / rate-limit) as a signal — the model is alive", () => {
    expect(isDeprecationSignal(429, "resource exhausted; quota")).toBe(false);
  });

  it("does NOT treat a 200 or a 503 as a signal", () => {
    expect(isDeprecationSignal(200, "")).toBe(false);
    expect(isDeprecationSignal(503, "service unavailable")).toBe(false);
  });
});

describe("isConsistentlyUnreachable — transient-404 resistance", () => {
  it("flags a model that 404'd on EVERY probe", () => {
    expect(
      isConsistentlyUnreachable([
        { status: 404, body: "no longer available" },
        { status: 404, body: "no longer available" },
        { status: 404, body: "no longer available" },
      ])
    ).toBe(true);
  });

  it("does NOT flag a model that answered even once — the 404s were transient", () => {
    expect(
      isConsistentlyUnreachable([
        { status: 404, body: "no longer available" },
        { status: 200, body: "" },
        { status: 404, body: "no longer available" },
      ])
    ).toBe(false);
  });

  it("does NOT flag a model that was merely throttled (429) or healthy", () => {
    expect(
      isConsistentlyUnreachable([
        { status: 200, body: "" },
        { status: 429, body: "quota" },
        { status: 200, body: "" },
      ])
    ).toBe(false);
  });

  it("is false for an empty probe set (nothing observed)", () => {
    expect(isConsistentlyUnreachable([])).toBe(false);
  });
});

describe("pooledGeminiModels", () => {
  it("returns the distinct union of all four Gemini pools", () => {
    const models = pooledGeminiModels();
    expect(models.length).toBe(new Set(models).size);
    // The hybrid pools keep gemini-2.5-pro as the strong adjudicator...
    expect(models).toContain("gemini-2.5-pro");
    // ...and the flash tier is the current-gen pair (redundant 2.5-flash dropped).
    expect(models).toContain("gemini-3.1-flash-lite");
    expect(models).toContain("gemini-3.5-flash");
    expect(models.some((m) => m.startsWith("gemini-2.5-flash"))).toBe(false);
  });
});
