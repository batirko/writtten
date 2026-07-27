import { describe, it, expect, beforeEach } from "vitest";
import { openaiAdapter } from "./openai";
import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { _resetCapabilities } from "./requestCapabilities";
import {
  resolveProvider,
  defaultModels,
  geminiRunningModels,
  withSelection,
  PROVIDER_IDS,
} from "./registry";
import type { LLMRequest } from "./router";

const req: LLMRequest = { system: "SYS", user: "USER", json: true };

// Capability discovery is session-scoped and sticky by design, so clear what a
// previous test taught it. Adapter seeds survive this (see requestCapabilities.ts).
beforeEach(() => _resetCapabilities());

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

  it("steps reasoning_effort down the ladder when a model rejects the floor", () => {
    // o3/o4-mini/*-chat-latest are offered by the picker but reject `none`.
    const body = (model: string) =>
      JSON.parse(openaiAdapter.buildRequest(model, req, "k").init.body as string);
    expect(body("o4-mini").reasoning_effort).toBe("none");
    const rejection = "Unsupported value: 'reasoning_effort' does not support 'none'";
    expect(openaiAdapter.classifyError(400, new Headers(), rejection, "o4-mini")).toMatchObject({
      retryable: true,
      renegotiate: true,
    });
    expect(body("o4-mini").reasoning_effort).toBe("low");
  });

  it("drops reasoning_effort entirely at the end of the ladder", () => {
    const unsupported = "Unrecognized request argument supplied: reasoning_effort";
    for (const expected of ["low", "medium"]) {
      openaiAdapter.classifyError(400, new Headers(), unsupported, "gpt-5-search-api");
      const b = JSON.parse(
        openaiAdapter.buildRequest("gpt-5-search-api", req, "k").init.body as string
      );
      expect(b.reasoning_effort).toBe(expected);
    }
    openaiAdapter.classifyError(400, new Headers(), unsupported, "gpt-5-search-api");
    const last = JSON.parse(
      openaiAdapter.buildRequest("gpt-5-search-api", req, "k").init.body as string
    );
    expect(last).not.toHaveProperty("reasoning_effort");
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
    expect(openaiAdapter.classifyError(429, h, "insufficient_quota", "gpt-5.5")).toMatchObject({
      retryable: false,
    });
    expect(openaiAdapter.classifyError(429, h, "rate limit", "gpt-5.5")).toMatchObject({
      retryable: true,
      coolDownMs: 12_000,
    });
    expect(openaiAdapter.classifyError(401, new Headers(), "bad key", "gpt-5.5")).toMatchObject({
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

  it("disables thinking on every model that accepts it, including new ones", () => {
    // Regression: this used to key off `model.includes("sonnet")`, so Opus 5 —
    // the flagship, now in the catalog — silently ran adaptive thinking, billing
    // for it and sharing the max_tokens budget with the answer.
    for (const m of ["claude-sonnet-5", "claude-opus-5", "claude-opus-4-8", "claude-haiku-4-5"]) {
      const body = JSON.parse(anthropicAdapter.buildRequest(m, req, "k").init.body as string);
      expect(body.thinking, m).toEqual({ type: "disabled" });
    }
  });

  it("omits thinking for claude-fable-5, which 400s on an explicit disable", () => {
    const body = JSON.parse(
      anthropicAdapter.buildRequest("claude-fable-5", req, "k").init.body as string
    );
    expect(body).not.toHaveProperty("thinking");
  });

  it("renegotiates once on a 400 that names thinking, then reports a real failure", () => {
    const rejection = '"thinking.type.disabled" is not supported for this model';
    // An unseeded future model starts at rung 0 (disabled) and steps down to "omit".
    expect(
      anthropicAdapter.classifyError(400, new Headers(), rejection, "claude-next-6")
    ).toMatchObject({ retryable: true, renegotiate: true });
    const after = JSON.parse(
      anthropicAdapter.buildRequest("claude-next-6", req, "k").init.body as string
    );
    expect(after).not.toHaveProperty("thinking");
    // Ladder exhausted — a second rejection is a genuine error, not another retry.
    expect(
      anthropicAdapter.classifyError(400, new Headers(), rejection, "claude-next-6")
    ).toMatchObject({ retryable: false });
  });

  it("leaves an unrelated 400 alone (a bad prompt is not a capability problem)", () => {
    const c = anthropicAdapter.classifyError(
      400,
      new Headers(),
      "messages: text content blocks must be non-empty",
      "claude-sonnet-5"
    );
    expect(c).toMatchObject({ retryable: false });
    expect(c.renegotiate).toBeFalsy();
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
      anthropicAdapter.classifyError(429, new Headers({ "retry-after": "5" }), "", "claude-sonnet-5")
    ).toMatchObject({ retryable: true, coolDownMs: 5_000 });
    expect(anthropicAdapter.classifyError(400, new Headers(), "", "claude-sonnet-5")).toMatchObject({
      retryable: false,
    });
    expect(anthropicAdapter.classifyError(529, new Headers(), "", "claude-sonnet-5")).toMatchObject({
      retryable: true,
    });
  });
});

describe("gemini adapter", () => {
  const budgetFor = (model: string) =>
    JSON.parse(geminiAdapter.buildRequest(model, req, "k").init.body as string).generationConfig
      .thinkingConfig.thinkingBudget;

  it("floors thinking to 0 only on models that actually accept a zero budget", () => {
    expect(budgetFor("gemini-3.1-flash-lite")).toBe(0);
    expect(budgetFor("gemini-3.5-flash")).toBe(0);
  });

  it("gives every thinking-mode-only model a non-zero floor, not just 2.5-pro", () => {
    // Regression: the old rule was `model.includes("2.5-pro") ? 128 : 0`, which
    // assumed every flash model takes a zero budget. The whole 3.5+ generation
    // rejects it ("This model only works in thinking mode"), so each of these
    // 400'd on the very first call once a user picked it in Settings.
    for (const m of [
      "gemini-2.5-pro",
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
    ]) {
      expect(budgetFor(m), m).toBe(128);
    }
  });

  it("renegotiates a zero-budget rejection for an unknown future model", () => {
    expect(budgetFor("gemini-4-flash")).toBe(0);
    expect(
      geminiAdapter.classifyError(400, new Headers(), "invalid argument", "gemini-4-flash")
    ).toMatchObject({ retryable: true, renegotiate: true });
    expect(budgetFor("gemini-4-flash")).toBe(128);
  });

  it("still rotates on 404/503 and cools down on 429", () => {
    expect(
      geminiAdapter.classifyError(404, new Headers(), "no longer available", "gemini-2.5-pro")
    ).toMatchObject({ retryable: true });
    expect(geminiAdapter.classifyError(503, new Headers(), "", "gemini-3.5-flash")).toMatchObject({
      retryable: true,
    });
    expect(
      geminiAdapter.classifyError(429, new Headers(), "quota", "gemini-3.5-flash")
    ).toMatchObject({ retryable: true, coolDownMs: expect.any(Number) });
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

  it("withSelection routes the chosen model per paid tier, selection first", () => {
    // Anthropic gained a strong fallback tail when Opus 5 / Opus 4.8 joined the
    // catalog; the user's pick still leads, and the rest follow it in order.
    const routed = withSelection(anthropicAdapter, { strongModel: "claude-opus-5" });
    expect(routed.pools.paidStrong[0]).toBe("claude-opus-5");
    expect(routed.pools.paidStrong).toEqual(["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8"]);
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
