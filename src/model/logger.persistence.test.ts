/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { llmLogger } from "./logger";

// L9 (lifecycle_integrity.md § L9): the debug log must survive a remount. In dev
// the logger mirrors its entries into sessionStorage (per-tab, survives a reload).
const KEY = "writtten_debug_log_v1";

describe("LLMLogger — L9 debug-log persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    llmLogger.clearLogs();
  });
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("mirrors entries into sessionStorage (debounced) so a reload keeps them", () => {
    llmLogger.log({
      type: "request",
      model: "gemini-2.5-flash",
      endpoint: "generateContent",
      payload: { system: "sys", user: "usr" },
    });
    // Nothing written before the debounce fires.
    expect(sessionStorage.getItem(KEY)).toBeNull();
    vi.advanceTimersByTime(600);

    const raw = sessionStorage.getItem(KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as Array<{ model: string; type: string }>;
    expect(parsed[0].model).toBe("gemini-2.5-flash");
    expect(parsed[0].type).toBe("request");
  });

  it("clearLogs wipes the persisted mirror immediately", () => {
    llmLogger.log({
      type: "request",
      model: "gemini-2.5-flash",
      endpoint: "generateContent",
      payload: { system: "s", user: "u" },
    });
    vi.advanceTimersByTime(600);
    expect(sessionStorage.getItem(KEY)).toBeTruthy();

    llmLogger.clearLogs();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
