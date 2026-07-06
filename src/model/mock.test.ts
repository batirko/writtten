import { describe, it, expect, beforeEach } from "vitest";
import {
  setLlmMode,
  getLlmMode,
  reqHash,
  recordResponse,
  replayResponse,
  loadRecordings,
  dumpRecordings,
  clearRecordings,
  recordingsSize,
  loadFallbackRecordings,
  replayFallback,
  clearFallbackRecordings,
  fallbackSize,
} from "./mock";

beforeEach(() => {
  setLlmMode("live");
  clearRecordings();
  clearFallbackRecordings();
});

describe("llm mode", () => {
  it("defaults to live and round-trips set/get", () => {
    expect(getLlmMode()).toBe("live");
    setLlmMode("mock");
    expect(getLlmMode()).toBe("mock");
    setLlmMode("record");
    expect(getLlmMode()).toBe("record");
  });
});

describe("reqHash", () => {
  it("is stable for identical requests", () => {
    expect(reqHash("sys", "user", true)).toBe(reqHash("sys", "user", true));
  });

  it("distinguishes system, user, and json flag", () => {
    const base = reqHash("sys", "user", true);
    expect(reqHash("SYS", "user", true)).not.toBe(base);
    expect(reqHash("sys", "USER", true)).not.toBe(base);
    expect(reqHash("sys", "user", false)).not.toBe(base);
  });

  it("does not collide when system/user boundary shifts", () => {
    // "ab"+"c" must not hash the same as "a"+"bc"
    expect(reqHash("ab", "c")).not.toBe(reqHash("a", "bc"));
  });
});

describe("record / replay", () => {
  it("replays a recorded response by hash and misses return undefined", () => {
    const h = reqHash("s", "u", true);
    expect(replayResponse(h)).toBeUndefined();
    recordResponse(h, '{"summary":"x"}');
    expect(replayResponse(h)).toBe('{"summary":"x"}');
  });

  it("dump/load round-trips the recordings map", () => {
    recordResponse("h1", "r1");
    recordResponse("h2", "r2");
    const dumped = dumpRecordings();
    expect(dumped).toEqual({ h1: "r1", h2: "r2" });

    clearRecordings();
    expect(recordingsSize()).toBe(0);

    loadRecordings(dumped);
    expect(recordingsSize()).toBe(2);
    expect(replayResponse("h1")).toBe("r1");
  });

  it("loadRecordings replaces rather than merges", () => {
    recordResponse("old", "v");
    loadRecordings({ fresh: "w" });
    expect(replayResponse("old")).toBeUndefined();
    expect(replayResponse("fresh")).toBe("w");
  });
});

describe("live-error fallback recordings", () => {
  it("is a separate map from the mock recordings", () => {
    loadRecordings({ h: "mockValue" });
    loadFallbackRecordings({ h: "fallbackValue" });
    expect(replayResponse("h")).toBe("mockValue");
    expect(replayFallback("h")).toBe("fallbackValue");
  });

  it("load/replay/clear round-trip and size", () => {
    expect(fallbackSize()).toBe(0);
    expect(replayFallback("h1")).toBeUndefined();
    loadFallbackRecordings({ h1: "r1", h2: "r2" });
    expect(fallbackSize()).toBe(2);
    expect(replayFallback("h1")).toBe("r1");
    clearFallbackRecordings();
    expect(fallbackSize()).toBe(0);
    expect(replayFallback("h1")).toBeUndefined();
  });
});
