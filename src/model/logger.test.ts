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
                quotaMetric:
                  "generativelanguage.googleapis.com/generate_content_free_tier_requests",
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

describe("llmLogger retention", () => {
  beforeEach(() => {
    llmLogger.clearLogs();
  });

  it("keeps LLM call rows despite a flood of lifecycle events (per-class caps)", () => {
    // Two real Gemini calls early in the session.
    for (let i = 0; i < 2; i++) {
      llmLogger.log({
        type: "request",
        tier: "fast",
        model: "gemini-3.1-flash-lite",
        payload: { system: "S", user: "U" },
      });
      llmLogger.log({
        type: "response",
        tier: "fast",
        model: "gemini-3.1-flash-lite",
        statusCode: 200,
        latencyMs: 100,
        payload: { system: "S", user: "U" },
        response: "{}",
      });
    }
    // A session's worth of high-frequency lifecycle churn (settle on every pause,
    // observation on every reconcile) — far past any single shared cap.
    for (let i = 0; i < 500; i++) {
      llmLogger.log({ type: "settle" });
      llmLogger.log({ type: "observation" });
    }

    const logs = llmLogger.getLogs();
    const llmRows = logs.filter((l) => (l.type === "request" || l.type === "response") && l.model);
    const lifecycle = logs.filter((l) => l.type === "settle" || l.type === "observation");
    // All four LLM legs survive; before per-class retention they were all evicted.
    expect(llmRows).toHaveLength(4);
    // Lifecycle chatter is capped by its own budget, not by starving LLM rows.
    expect(lifecycle).toHaveLength(200);
  });
});

describe("llmLogger archive + produced", () => {
  beforeEach(() => {
    llmLogger.clearLogs();
  });

  it("logArchive appends an archive entry carrying actor + reason, without touching quota stats", () => {
    llmLogger.logArchive(
      {
        observationId: "o1",
        obsType: "clarity",
        scope: "span",
        blockId: "b1",
        text: "vague phrase",
        reason: "dismissed",
        actor: "user",
      },
      "E7"
    );
    const entry = llmLogger.getLogs().find((l) => l.type === "archive");
    expect(entry).toBeDefined();
    expect(entry!.evalId).toBe("E7");
    expect(entry!.archive).toMatchObject({
      actor: "user",
      reason: "dismissed",
      obsType: "clarity",
    });
    // Archive entries have no model, so they never pollute per-model quota stats.
    expect(llmLogger.getApiStats().models).toHaveLength(0);
  });

  it("recordProduced merges repeated calls for the same callId", () => {
    llmLogger.recordProduced("c1", { observations: ["clarity"], ledgerWrites: 2 });
    llmLogger.recordProduced("c1", { observations: ["contradiction"], resolvedPrior: [1] });
    const p = llmLogger.getProducedByCall().get("c1")!;
    expect(p.observations).toEqual(["clarity", "contradiction"]);
    expect(p.ledgerWrites).toBe(2);
    expect(p.resolvedPrior).toEqual([1]);
  });

  it("recordProduced is a no-op when callId is undefined (mock mode)", () => {
    llmLogger.recordProduced(undefined, { observations: ["clarity"] });
    expect(llmLogger.getProducedByCall().size).toBe(0);
  });
});

describe("llmLogger.getInflightTier (activity-dot tier cue)", () => {
  beforeEach(() => {
    llmLogger.clearLogs();
  });

  const req = (callId: string, tier: "fast" | "strong") =>
    llmLogger.log({ type: "request", tier, model: "m", endpoint: "x", callId, payload: { system: "", user: "" } });
  const done = (callId: string, tier: "fast" | "strong", type: "response" | "error" = "response") =>
    llmLogger.log({ type, tier, model: "m", endpoint: "x", callId, statusCode: type === "response" ? 200 : 500, payload: { system: "", user: "" } });

  it("is null when idle", () => {
    expect(llmLogger.getInflightTier()).toBeNull();
  });

  it("reports the in-flight tier between request and its terminal", () => {
    req("c1", "fast");
    expect(llmLogger.getInflightTier()).toBe("fast");
    done("c1", "fast");
    expect(llmLogger.getInflightTier()).toBeNull();
  });

  it("strong dominates while fast + strong run concurrently", () => {
    req("c1", "fast");
    req("c2", "strong");
    expect(llmLogger.getInflightTier()).toBe("strong");
    // strong finishes first → falls back to the still-running fast
    done("c2", "strong");
    expect(llmLogger.getInflightTier()).toBe("fast");
    done("c1", "fast");
    expect(llmLogger.getInflightTier()).toBeNull();
  });

  it("clears on an error terminal, not just a response", () => {
    req("c1", "strong");
    expect(llmLogger.getInflightTier()).toBe("strong");
    done("c1", "strong", "error");
    expect(llmLogger.getInflightTier()).toBeNull();
  });

  it("rotation retries reuse one callId → one terminal balances it", () => {
    // A logical call may log multiple `request`s (one per rotation attempt) under
    // the same callId, plus a `retry`; a single terminal must clear it.
    req("c1", "strong");
    llmLogger.log({ type: "retry", tier: "strong", model: "m", endpoint: "x", callId: "c1", payload: { system: "", user: "" } });
    req("c1", "strong"); // next rotation attempt, same callId
    expect(llmLogger.getInflightTier()).toBe("strong");
    done("c1", "strong");
    expect(llmLogger.getInflightTier()).toBeNull();
  });

  it("clearLogs() empties the in-flight set", () => {
    req("c1", "strong");
    llmLogger.clearLogs();
    expect(llmLogger.getInflightTier()).toBeNull();
  });
});
