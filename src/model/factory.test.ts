import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Control the underlying Gemini router so we can make live calls succeed or throw.
const fastCall = vi.fn();
const strongCall = vi.fn();
vi.mock("./gemini", () => ({
  createGeminiRouter: () => ({ fast: fastCall, strong: strongCall }),
}));

import { createRouter } from "./factory";
import {
  setLlmMode,
  reqHash,
  loadFallbackRecordings,
  clearFallbackRecordings,
  clearRecordings,
} from "./mock";
import type { LLMRequest } from "./router";

const req: LLMRequest = { system: "sys", user: "user", json: true };

beforeEach(() => {
  setLlmMode("live");
  clearRecordings();
  clearFallbackRecordings();
  vi.clearAllMocks();
});

afterEach(() => {
  setLlmMode("live");
  clearFallbackRecordings();
});

describe("factory live-error fallback", () => {
  it("returns the live response when the call succeeds (no fallback consulted)", async () => {
    fastCall.mockResolvedValue({ text: '{"live":true}' });
    loadFallbackRecordings({ [reqHash("sys", "user", true)]: '{"recorded":true}' });
    const router = createRouter("key");
    await expect(router.fast(req)).resolves.toEqual({ text: '{"live":true}' });
  });

  it("serves the recorded fallback when a live call throws and the hash matches", async () => {
    strongCall.mockRejectedValue(new Error("429 quota exhausted"));
    loadFallbackRecordings({ [reqHash("sys", "user", true)]: '{"recorded":true}' });
    const router = createRouter("key");
    await expect(router.strong(req)).resolves.toEqual({ text: '{"recorded":true}' });
  });

  it("rethrows when a live call fails and no fallback is bundled", async () => {
    strongCall.mockRejectedValue(new Error("boom"));
    const router = createRouter("key");
    await expect(router.strong(req)).rejects.toThrow("boom");
  });

  it("rethrows when a live call fails and the fallback has no entry for this request", async () => {
    strongCall.mockRejectedValue(new Error("boom"));
    loadFallbackRecordings({ someOtherHash: '{"recorded":true}' });
    const router = createRouter("key");
    await expect(router.strong(req)).rejects.toThrow("boom");
  });
});
