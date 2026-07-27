import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRouterForAdapter } from "./rotation";
import type { ProviderAdapter } from "./provider";
import type { LLMRequest } from "./router";

/**
 * Exercises the provider-agnostic rotation engine with a fake adapter, so the
 * pool-rotation / cool-down / free→paid fallback logic is covered independently
 * of any real provider. (Gemini's own behavior is covered end-to-end elsewhere;
 * this pins the generic seam introduced by the multi-provider refactor.)
 */

const req: LLMRequest = { system: "sys", user: "user", json: true };

// A fake fetch that returns a canned status/body/headers per URL substring.
type Rule = { match: string; status: number; body: string; headers?: Record<string, string> };
let rules: Rule[] = [];
let fetchCalls: string[] = [];

function fakeFetch(url: string): Promise<Response> {
  fetchCalls.push(url);
  const rule = rules.find((r) => url.includes(r.match));
  if (!rule) throw new Error(`no rule for ${url}`);
  const ok = rule.status >= 200 && rule.status < 300;
  return Promise.resolve({
    ok,
    status: rule.status,
    headers: new Headers(rule.headers ?? {}),
    text: () => Promise.resolve(rule.body),
    json: () => Promise.resolve(JSON.parse(rule.body)),
  } as Response);
}

// Minimal adapter: model name lands in the URL so `fakeFetch` can key on it.
const fakeAdapter: ProviderAdapter = {
  id: "openai",
  label: "Fake",
  pools: {
    freeFast: [],
    freeStrong: [],
    paidFast: ["cheap-a", "cheap-b"],
    paidStrong: ["big-a", "big-b"],
  },
  catalog: { fast: ["cheap-a"], strong: ["big-a"] },
  buildRequest: (model, _r, key) => ({
    url: `https://fake/${model}?key=${key}`,
    init: { method: "POST", body: "{}" },
  }),
  parseResponse: (body) => ({ text: (body as { text: string }).text }),
  classifyError: (status) => {
    if (status === 429) return { retryable: true, coolDownMs: 60_000 };
    if (status === 503) return { retryable: true, coolDownMs: 0 };
    return { retryable: false, coolDownMs: 0 };
  },
};

beforeEach(() => {
  rules = [];
  fetchCalls = [];
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRouterForAdapter — generic rotation", () => {
  it("returns the first pool model's parsed response", async () => {
    rules = [{ match: "cheap-a", status: 200, body: '{"text":"ok"}' }];
    const router = createRouterForAdapter(fakeAdapter, "free", "paid");
    await expect(router.fast(req)).resolves.toEqual({ text: "ok", callId: expect.any(String) });
    expect(fetchCalls).toHaveLength(1);
  });

  it("rotates to the next model on a retryable (503) failure", async () => {
    rules = [
      { match: "big-a", status: 503, body: "unavailable" },
      { match: "big-b", status: 200, body: '{"text":"recovered"}' },
    ];
    const router = createRouterForAdapter(fakeAdapter, "free", "paid");
    await expect(router.strong(req)).resolves.toMatchObject({ text: "recovered" });
    expect(fetchCalls.some((u) => u.includes("big-a"))).toBe(true);
    expect(fetchCalls.some((u) => u.includes("big-b"))).toBe(true);
  });

  it("retries the SAME model on a renegotiate, without consuming a pool slot", async () => {
    // The adapter rejected a request knob and stepped the model down a rung; the
    // fix belongs to this model, so rotating away from it would both lose the
    // better model and leave the knob unfixed. Fake adapter: first call to big-a
    // 400s asking to renegotiate, second call succeeds.
    let seen = 0;
    const negotiating: ProviderAdapter = {
      ...fakeAdapter,
      classifyError: (status) =>
        status === 400
          ? { retryable: true, coolDownMs: 0, renegotiate: true }
          : { retryable: false, coolDownMs: 0 },
    };
    vi.stubGlobal("fetch", (url: string) => {
      fetchCalls.push(url);
      const first = url.includes("big-a") && seen++ === 0;
      return Promise.resolve({
        ok: !first,
        status: first ? 400 : 200,
        headers: new Headers(),
        text: () => Promise.resolve("knob rejected"),
        json: () => Promise.resolve({ text: "renegotiated" }),
      } as Response);
    });
    const router = createRouterForAdapter(negotiating, "free", "paid");
    await expect(router.strong(req)).resolves.toMatchObject({ text: "renegotiated" });
    expect(fetchCalls.filter((u) => u.includes("big-a"))).toHaveLength(2);
    expect(fetchCalls.some((u) => u.includes("big-b"))).toBe(false);
  });

  it("gives up after one renegotiation and rotates on (a model out of rungs)", async () => {
    // `stepDown` returns false once the ladder is exhausted, so a real adapter
    // stops asking. Pin that a still-failing model doesn't spin: it rotates on.
    const exhausted: ProviderAdapter = {
      ...fakeAdapter,
      classifyError: (status) =>
        status === 400 ? { retryable: true, coolDownMs: 0 } : { retryable: false, coolDownMs: 0 },
    };
    rules = [
      { match: "big-a", status: 400, body: "still rejected" },
      { match: "big-b", status: 200, body: '{"text":"next model"}' },
    ];
    const router = createRouterForAdapter(exhausted, "free", "paid");
    await expect(router.strong(req)).resolves.toMatchObject({ text: "next model" });
    expect(fetchCalls.filter((u) => u.includes("big-a"))).toHaveLength(1);
  });

  it("aborts the pool on a non-retryable status (no fallback path)", async () => {
    // Use the no-paid-key strong path so the raw error propagates without the
    // router's free→paid fallback reshaping it. freeStrong has two models; a
    // non-retryable 401 on the first must NOT advance to the second.
    const noFallback: ProviderAdapter = {
      ...fakeAdapter,
      pools: { freeFast: [], freeStrong: ["fs-a", "fs-b"], paidFast: [], paidStrong: [] },
    };
    rules = [{ match: "fs-a", status: 401, body: "unauthorized" }];
    const router = createRouterForAdapter(noFallback, "free");
    await expect(router.strong(req)).rejects.toThrow(/error 401/);
    expect(fetchCalls.some((u) => u.includes("fs-b"))).toBe(false);
  });

  it("throws when the paid pool is exhausted", async () => {
    rules = [
      { match: "big-a", status: 429, body: "{}" },
      { match: "big-b", status: 429, body: "{}" },
    ];
    const router = createRouterForAdapter(fakeAdapter, "free", "paid");
    await expect(router.strong(req)).rejects.toThrow(/Pool exhausted/);
  });

  it("fast() falls back to the paid pool when the free pool is empty", async () => {
    // freeFast is [] → free attempt exhausts immediately → paid pool carries it.
    rules = [{ match: "cheap-a", status: 200, body: '{"text":"paid-fast"}' }];
    const router = createRouterForAdapter(fakeAdapter, "free", "paid");
    await expect(router.fast(req)).resolves.toMatchObject({ text: "paid-fast" });
  });

  it("fast() throws a clear message when free is empty and no paid key is set", async () => {
    const router = createRouterForAdapter(fakeAdapter, "free");
    await expect(router.fast(req)).rejects.toThrow(/no paid key configured/);
  });
});
