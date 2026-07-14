import { describe, it, expect } from "vitest";
import { openaiAdapter } from "./openai";
import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import {
  resolveProvider,
  defaultModels,
  geminiRunningModels,
  withSelection,
  PROVIDER_IDS,
} from "./registry";
import type { LLMRequest } from "./router";

const req: LLMRequest = { system: "SYS", user: "USER", json: true };

describe("openai adapter", () => {
  it("builds a Bearer-authed chat-completions request with json mode", () => {
    const { url, init } = openaiAdapter.buildRequest("gpt-5.4-mini", req, "sk-key");
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "USER" },
    ]);
    // GPT-5.x rejects a non-default temperature with a 400 — must be omitted.
    expect(body).not.toHaveProperty("temperature");
    // Reasoning is floored unconditionally so a heavy strong-tier sweep can't run
    // away past our request timeout (strong_tier_eval_reliability.md). `none` is
    // gpt-5.5's floor — `minimal` is rejected by this model (verified live).
    expect(body.reasoning_effort).toBe("none");
  });

  it("parses choices[0].message.content and usage", () => {
    const { text, usage } = openaiAdapter.parseResponse({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    });
    expect(text).toBe('{"ok":true}');
    expect(usage).toEqual({ promptTokens: 10, candidateTokens: 4, totalTokens: 14 });
  });

  it("treats insufficient_quota 429 as non-retryable, plain rate-limit as retryable", () => {
    const h = new Headers({ "retry-after": "12" });
    expect(openaiAdapter.classifyError(429, h, "insufficient_quota")).toMatchObject({
      retryable: false,
    });
    expect(openaiAdapter.classifyError(429, h, "rate limit")).toMatchObject({
      retryable: true,
      coolDownMs: 12_000,
    });
    expect(openaiAdapter.classifyError(401, new Headers(), "bad key")).toMatchObject({
      retryable: false,
    });
  });
});

describe("anthropic adapter", () => {
  it("sets the browser-access + version headers and omits temperature", () => {
    const { url, init } = anthropicAdapter.buildRequest("claude-haiku-4-5", req, "sk-ant-key");
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("temperature");
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it("disables thinking for the sonnet (strong) model only", () => {
    const strong = JSON.parse(
      anthropicAdapter.buildRequest("claude-sonnet-5", req, "k").init.body as string
    );
    expect(strong.thinking).toEqual({ type: "disabled" });
    const fast = JSON.parse(
      anthropicAdapter.buildRequest("claude-haiku-4-5", req, "k").init.body as string
    );
    expect(fast).not.toHaveProperty("thinking");
  });

  it("reads the first text block and maps usage", () => {
    const { text, usage } = anthropicAdapter.parseResponse({
      content: [{ type: "text", text: '{"ok":1}' }],
      usage: { input_tokens: 7, output_tokens: 3 },
    });
    expect(text).toBe('{"ok":1}');
    expect(usage).toEqual({ promptTokens: 7, candidateTokens: 3, totalTokens: 10 });
  });

  it("classifies 429 retryable (honoring retry-after) and 400 non-retryable", () => {
    expect(
      anthropicAdapter.classifyError(429, new Headers({ "retry-after": "5" }), "")
    ).toMatchObject({ retryable: true, coolDownMs: 5_000 });
    expect(anthropicAdapter.classifyError(400, new Headers(), "")).toMatchObject({
      retryable: false,
    });
    expect(anthropicAdapter.classifyError(529, new Headers(), "")).toMatchObject({
      retryable: true,
    });
  });
});

describe("gemini adapter", () => {
  it("floors thinking to 0 on flash variants and to a small non-zero on 2.5-pro", () => {
    // Flash accepts thinkingBudget: 0 (fully disabled).
    const flash = JSON.parse(
      geminiAdapter.buildRequest("gemini-3.1-flash-lite", req, "k").init.body as string
    );
    expect(flash.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    // gemini-2.5-pro enforces a non-zero minimum, so it gets a small floor, not 0.
    const pro = JSON.parse(
      geminiAdapter.buildRequest("gemini-2.5-pro", req, "k").init.body as string
    );
    expect(pro.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 128 });
  });
});

describe("registry", () => {
  it("resolves all three providers and falls back to gemini for unknown ids", () => {
    expect(resolveProvider("openai")).toBe(openaiAdapter);
    expect(resolveProvider("anthropic")).toBe(anthropicAdapter);
    expect(resolveProvider("gemini")).toBe(geminiAdapter);
    expect(resolveProvider("nonsense")).toBe(geminiAdapter);
    expect(PROVIDER_IDS).toEqual(["gemini", "openai", "anthropic"]);
  });

  it("exposes catalog defaults per provider", () => {
    expect(defaultModels("openai")).toEqual({ fast: "gpt-5.4-mini", strong: "gpt-5.5" });
    expect(defaultModels("anthropic")).toEqual({
      fast: "claude-haiku-4-5",
      strong: "claude-sonnet-5",
    });
  });

  it("geminiRunningModels reflects the actual tier — one model free, pro on paid", () => {
    // Free: fast + strong both ride the free pool primary (flash-lite).
    expect(geminiRunningModels(false)).toEqual({
      fast: "gemini-3.1-flash-lite",
      strong: "gemini-3.1-flash-lite",
    });
    // Paid: fast still rides flash-lite; strong is gemini-2.5-pro.
    expect(geminiRunningModels(true)).toEqual({
      fast: "gemini-3.1-flash-lite",
      strong: "gemini-2.5-pro",
    });
  });

  it("withSelection routes the chosen model per paid tier, single-strong collapses", () => {
    const routed = withSelection(anthropicAdapter, { strongModel: "claude-sonnet-5" });
    // Anthropic has one strong model, so the fallback tail is empty.
    expect(routed.pools.paidStrong).toEqual(["claude-sonnet-5"]);
    // Default fills in the fast tier when omitted.
    expect(routed.pools.paidFast).toEqual(["claude-haiku-4-5"]);
    // Free pools untouched (single-model routing only overrides the paid pools).
    expect(routed.pools.freeFast).toEqual([]);
  });

  it("withSelection keeps a failure-only strong fallback tail for multi-strong providers", () => {
    // Selected model leads; the rest of the strong catalog follows so a strong-tier
    // timeout rotates instead of dropping the call (strong_tier_eval_reliability.md).
    const routed = withSelection(openaiAdapter, { strongModel: "gpt-5.5" });
    expect(routed.pools.paidStrong).toEqual(["gpt-5.5", "gpt-5.6", "gpt-5.4"]);
    // fast stays single-model (a fast failure just retries next eval).
    expect(routed.pools.paidFast).toEqual(["gpt-5.4-mini"]);
    // A non-default selection still leads, with no duplicate of itself in the tail.
    const routed2 = withSelection(openaiAdapter, { strongModel: "gpt-5.6" });
    expect(routed2.pools.paidStrong).toEqual(["gpt-5.6", "gpt-5.5", "gpt-5.4"]);
    // Omitted selection falls back to the catalog default as the lead.
    const routed3 = withSelection(openaiAdapter, {});
    expect(routed3.pools.paidStrong).toEqual(["gpt-5.5", "gpt-5.6", "gpt-5.4"]);
  });
});
