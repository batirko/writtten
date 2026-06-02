import { describe, it, expect, beforeEach } from "vitest";
import { llmLogger, parse429 } from "./logger";

/** A realistic Gemini free-tier 429 body for the per-DAY request quota. */
function perDay429Body(model: string, limit = 20, retryDelay = "43s"): string {
  return JSON.stringify({
    error: {
      code: 429,
      message: `You exceeded your current quota... limit: ${limit}, model: ${model}`,
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [
            {
              quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
              quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
              quotaDimensions: { location: "global", model },
              quotaValue: String(limit),
            },
          ],
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
      ],
    },
  });
}

describe("parse429", () => {
  it("identifies a per-day request quota violation and its limit", () => {
    const p = parse429(perDay429Body("gemini-2.5-flash", 20));
    expect(p).not.toBeNull();
    expect(p!.kinds).toContain("perDay");
    expect(p!.dailyLimit).toBe(20);
    expect(p!.retryDelayMs).toBe(43_000);
  });

  it("classifies an input-token-per-minute violation as inputTokens", () => {
    const body = JSON.stringify({
      error: {
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              {
                quotaMetric:
                  "generativelanguage.googleapis.com/generate_content_free_tier_input_token_count",
                quotaId: "GenerateContentInputTokensPerModelPerMinute-FreeTier",
              },
            ],
          },
        ],
      },
    });
    const p = parse429(body);
    expect(p!.kinds).toContain("inputTokens");
    expect(p!.dailyLimit).toBeNull();
  });

  it("classifies a per-minute request violation as perMinute", () => {
    const body = JSON.stringify({
      error: {
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [
              {
                quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
              },
            ],
          },
        ],
      },
    });
    expect(parse429(body)!.kinds).toContain("perMinute");
  });

  it("returns null for non-JSON or non-quota bodies", () => {
    expect(parse429("not json")).toBeNull();
    expect(parse429(undefined)).toBeNull();
    expect(parse429(JSON.stringify({ foo: "bar" }))).toBeNull();
  });
});

describe("llmLogger.getApiStats", () => {
  beforeEach(() => {
    llmLogger._resetApiStatsForTests();
  });

  it("counts successes and computes remaining daily budget", () => {
    llmLogger.log({
      type: "request",
      tier: "fast",
      model: "gemini-2.5-flash-lite",
      endpoint: "x",
      payload: { system: "", user: "" },
    });
    llmLogger.log({
      type: "response",
      tier: "fast",
      model: "gemini-2.5-flash-lite",
      endpoint: "x",
      statusCode: 200,
      latencyMs: 100,
      payload: { system: "", user: "" },
      response: "{}",
    });

    const stats = llmLogger.getApiStats();
    const m = stats.models.find((x) => x.model === "gemini-2.5-flash-lite")!;
    expect(m.requests).toBe(1);
    expect(m.successes).toBe(1);
    expect(m.successesToday).toBe(1);
    // KNOWN_DAILY_RPD fallback for flash-lite is 20.
    expect(m.dailyLimit).toBe(20);
    expect(m.remainingToday).toBe(19);
    expect(m.avgLatencyMs).toBe(100);
  });

  it("buckets a 429 by quotaId and overrides the daily limit from the payload", () => {
    llmLogger.log({
      type: "error",
      model: "gemini-2.5-flash",
      endpoint: "x",
      statusCode: 429,
      payload: { system: "", user: "" },
      errorMessage: perDay429Body("gemini-2.5-flash", 20),
    });

    const m = llmLogger.getApiStats().models.find((x) => x.model === "gemini-2.5-flash")!;
    expect(m.rate429).toBe(1);
    expect(m.quota429.perDay).toBe(1);
    expect(m.dailyLimit).toBe(20);
    expect(m.lastRetryDelayMs).toBe(43_000);
    expect(m.lastStatus).toBe(429);
  });

  it("ignores synthetic 'none' pool-exhausted entries", () => {
    llmLogger.log({
      type: "error",
      model: "none",
      endpoint: "",
      payload: { system: "", user: "" },
      errorMessage: "All models in the pool are exhausted or rate-limited.",
    });
    expect(llmLogger.getApiStats().models.some((x) => x.model === "none")).toBe(false);
  });

  it("sorts the most-pressured model (least remaining budget) first", () => {
    // pro: 0/day → remaining 0; flash-lite: 20/day, 0 used → remaining 20.
    llmLogger.log({
      type: "response",
      tier: "fast",
      model: "gemini-2.5-flash-lite",
      endpoint: "x",
      statusCode: 200,
      payload: { system: "", user: "" },
      response: "{}",
    });
    llmLogger.log({
      type: "error",
      model: "gemini-2.5-pro",
      endpoint: "x",
      statusCode: 429,
      payload: { system: "", user: "" },
      errorMessage: perDay429Body("gemini-2.5-pro", 0),
    });

    const stats = llmLogger.getApiStats();
    expect(stats.models[0].model).toBe("gemini-2.5-pro");
    expect(stats.models[0].remainingToday).toBe(0);
  });
});
