import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouterForSelection } from "./factory";
import { setLlmMode } from "./mock";
import type { LLMRequest } from "./router";

/**
 * End-to-end (through the generic rotation engine + mock/record wrap) check that
 * a paid-provider selection routes to the right endpoint with the chosen model.
 * fetch is stubbed so no network call is made.
 */

const req: LLMRequest = { system: "s", user: "u", json: true };
let calls: { url: string; body: string }[] = [];

beforeEach(() => {
  setLlmMode("live");
  calls = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as string });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: () => Promise.resolve(""),
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: '{"routed":true}' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
    } as Response);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  setLlmMode("live");
});

describe("createRouterForSelection", () => {
  it("routes an Anthropic strong selection to the messages endpoint with the chosen model", async () => {
    const router = createRouterForSelection(
      { providerId: "anthropic", strongModel: "claude-sonnet-5" },
      "", // no free key for a paid-only provider
      "sk-ant-user-key"
    );
    const res = await router.strong(req);
    expect(res.text).toBe('{"routed":true}');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(JSON.parse(calls[0].body).model).toBe("claude-sonnet-5");
  });

  it("gemini selection reuses the default Gemini path", async () => {
    // Gemini fast hits the free flash-lite endpoint with the free key.
    const router = createRouterForSelection({ providerId: "gemini" }, "free-key");
    await router.fast(req).catch(() => {
      /* response body shape differs for gemini; we only assert routing */
    });
    expect(calls[0].url).toContain("generativelanguage.googleapis.com");
    expect(calls[0].url).toContain("key=free-key");
  });
});
