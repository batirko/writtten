import { describe, it, expect, vi, afterEach } from "vitest";
import { detectGeminiTier } from "./ping";

function stubFetch(res: Partial<Response> & { text: () => Promise<string> }) {
  vi.stubGlobal("fetch", () => Promise.resolve(res as Response));
}

function quotaBody(quotaId: string, quotaValue?: string): string {
  return JSON.stringify({
    error: {
      code: 429,
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId, quotaMetric: "generate_content_requests", quotaValue }],
        },
      ],
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("detectGeminiTier", () => {
  it("returns 'paid' when pro answers 200", async () => {
    stubFetch({ ok: true, status: 200, headers: new Headers(), text: () => Promise.resolve("{}") });
    expect(await detectGeminiTier("k")).toBe("paid");
  });

  it("returns 'free' when pro 429s with a per-day quota (0 free-tier RPD)", async () => {
    stubFetch({
      ok: false,
      status: 429,
      headers: new Headers(),
      text: () => Promise.resolve(quotaBody("GenerateContentPerDayPerProjectPerModel", "0")),
    });
    expect(await detectGeminiTier("k")).toBe("free");
  });

  it("returns 'paid' when pro 429s with only a per-minute limit (has access, rate-limited)", async () => {
    stubFetch({
      ok: false,
      status: 429,
      headers: new Headers(),
      text: () => Promise.resolve(quotaBody("GenerateRequestsPerMinutePerProject")),
    });
    expect(await detectGeminiTier("k")).toBe("paid");
  });

  it("returns 'invalid' on 401", async () => {
    stubFetch({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: () => Promise.resolve("unauthorized"),
    });
    expect(await detectGeminiTier("k")).toBe("invalid");
  });

  it("returns 'unknown' when the request can't be made (network / CORS)", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    expect(await detectGeminiTier("k")).toBe("unknown");
  });

  it("returns 'unknown' for an empty key without hitting the network", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await detectGeminiTier("   ")).toBe("unknown");
    expect(spy).not.toHaveBeenCalled();
  });
});
