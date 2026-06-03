import type { LLMRequest, LLMResponse, ModelRouter } from "./router";
import { llmLogger, parse429 } from "./logger";
import { trackCall } from "./rpmBudget";
import { reportStall, reportProgress } from "./stallSignal";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Per-request timeout. A real call observed at 40.6s justifies a hard cap: past
 * this we abort, mark the call as a (retryable) failure so rotation moves to the
 * next model, and raise the stall signal so the UI stops looking frozen.
 */
const REQUEST_TIMEOUT_MS: Record<"fast" | "strong", number> = {
  fast: 30_000,
  strong: 45_000,
};

/**
 * Model pools — free-tier ordering by RPD budget.
 *
 * FAST: summarization + span checks (frequent, latency-sensitive).
 * STRONG: contradiction + doc-level checks (rarer, quality-sensitive).
 *
 * Pool order is RPD-budget-first on the free tier:
 *   gemini-3.1-flash-lite = 500 RPD (25× more than the 20-RPD flash variants)
 *   Everything else       = 20 RPD
 *   gemini-2.5-pro        = 0 RPD (no free-tier quota — excluded entirely)
 *
 * Paid pools use better models since RPD is not a constraint.
 * See docs/projects/model_rotation_and_debugging.md §2.
 */
const FREE_FAST_POOL = [
  "gemini-3.1-flash-lite",   // 500 RPD — primary workhorse on free tier
  "gemini-2.5-flash-lite",   // 20 RPD fallback
  "gemini-2.5-flash",        // 20 RPD fallback
  "gemini-3.5-flash",        // 20 RPD last resort
];
const FREE_STRONG_POOL = [
  "gemini-3.1-flash-lite",   // 500 RPD — best available on free tier
  "gemini-3.5-flash",        // 20 RPD fallback
  "gemini-2.5-flash",        // 20 RPD last resort
  // gemini-2.5-pro excluded: 0 RPD on free tier (limit: 0 in every 429 payload)
];

// Paid key pools: RPD not a bottleneck, so quality ordering.
const PAID_FAST_POOL = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];
const PAID_STRONG_POOL = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-3.5-flash",
];

class CoolDownRegistry {
  private coolDowns = new Map<string, number>();

  markUnavailable(model: string, delayMs: number) {
    // Only extend the cool-down — never shorten an existing one.
    const current = this.coolDowns.get(model) ?? 0;
    const proposed = Date.now() + delayMs;
    if (proposed > current) this.coolDowns.set(model, proposed);
  }

  isAvailable(model: string): boolean {
    const expiresAt = this.coolDowns.get(model);
    if (!expiresAt) return true;
    return Date.now() > expiresAt;
  }
}

// Separate registries: a free-tier PerDay cool-down must not block the paid key.
const freeRegistry = new CoolDownRegistry();
const paidRegistry = new CoolDownRegistry();

function parseRetryDelay(headers: Headers): number | null {
  const delayStr = headers.get("retry-delay");
  if (!delayStr) return null;
  const seconds = parseInt(delayStr, 10);
  if (isNaN(seconds)) return null;
  return seconds * 1000;
}

/**
 * Ms until the next Pacific midnight — when Google's free-tier RPD counters reset.
 * Used as the cool-down for PerDay quota exhaustion, since the retry-delay header
 * only reflects RPM back-off (typically 5–45 s) and is useless for a daily cap.
 */
function msTilPacificMidnight(): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const elapsedMs = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  const msInDay = 24 * 60 * 60 * 1000;
  // Add 60 s buffer so we don't fire a request right at the reset boundary.
  return msInDay - elapsedMs + 60_000;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(
  model: string,
  req: LLMRequest,
  apiKey: string,
  tier: "fast" | "strong",
  keyTier: "free" | "paid",
): Promise<LLMResponse> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const generationConfig: {
    temperature: number;
    responseMimeType?: string;
  } = {
    temperature: 0.2,
  };

  if (req.json) {
    generationConfig.responseMimeType = "application/json";
  }

  const body = {
    system_instruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig,
  };

  const startTime = Date.now();
  llmLogger.log({
    type: "request",
    tier,
    model,
    endpoint: url,
    payload: { system: req.system, user: req.user },
    keyTier,
  });

  const controller = new AbortController();
  const timeoutMs = REQUEST_TIMEOUT_MS[tier];
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      // Surface the stall to the UI and report a retryable error (503) so the
      // rotation pool tries the next model rather than aborting the whole eval.
      reportStall();
      const latencyMs = Date.now() - startTime;
      llmLogger.log({
        type: "error",
        model,
        endpoint: url,
        latencyMs,
        statusCode: 503,
        payload: { system: req.system, user: req.user },
        errorMessage: `Request timeout (503) after ${timeoutMs}ms`,
        keyTier,
      });
      throw new Error(`Gemini timeout (503) after ${timeoutMs}ms`);
    }
    throw e;
  }
  clearTimeout(timeoutId);

  const latencyMs = Date.now() - startTime;

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 429) {
      const parsed = parse429(err);
      const isPerDay = parsed?.kinds.includes("perDay") ?? false;
      // PerDay exhaustion: cool down until Pacific midnight — the retry-delay header
      // only gives RPM back-off (5–45 s) and is useless once the daily cap is hit.
      const waitTime = isPerDay ? msTilPacificMidnight() : (parseRetryDelay(res.headers) ?? 45_000);
      const reg = keyTier === "paid" ? paidRegistry : freeRegistry;
      reg.markUnavailable(model, waitTime);
    }

    llmLogger.log({
      type: "error",
      model,
      endpoint: url,
      latencyMs,
      statusCode: res.status,
      payload: { system: req.system, user: req.user },
      errorMessage: err,
      keyTier,
    });
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  llmLogger.log({
    type: "response",
    tier,
    model,
    endpoint: url,
    latencyMs,
    statusCode: res.status,
    payload: { system: req.system, user: req.user },
    response: text,
    keyTier,
  });

  // Record call completion for RPM budget tracking.
  trackCall();
  // A good response clears any prior stall state.
  reportProgress();

  return { text };
}

async function callWithRotation(
  pool: string[],
  req: LLMRequest,
  apiKey: string,
  tier: "fast" | "strong",
  keyTier: "free" | "paid",
): Promise<LLMResponse> {
  const reg = keyTier === "paid" ? paidRegistry : freeRegistry;
  let attempt = 0;

  for (const model of pool) {
    if (!reg.isAvailable(model)) continue;

    try {
      llmLogger.setActiveProvider(keyTier === "paid" ? `${model} [paid]` : model);
      if (attempt > 0) {
        const backoff = 500 * Math.pow(2, attempt - 1);
        llmLogger.log({
          type: "retry",
          tier,
          model,
          endpoint: "",
          payload: { system: req.system, user: req.user },
          errorMessage: `Retrying with ${model} after ${backoff}ms`,
          keyTier,
        });
        await delay(backoff);
      }

      return await callGemini(model, req, apiKey, tier, keyTier);
    } catch (e) {
      const err = e as Error;
      if (
        !err.message.includes("429") &&
        !err.message.includes("503") &&
        !err.message.includes("404")
      ) {
        throw err;
      }
    }
    attempt++;
  }

  throw new Error(`Pool exhausted (${keyTier})`);
}

export function createGeminiRouter(freeKey: string, paidKey?: string): ModelRouter {
  return {
    async fast(req) {
      try {
        return await callWithRotation(FREE_FAST_POOL, req, freeKey, "fast", "free");
      } catch {
        if (!paidKey) throw new Error("All models exhausted and no paid key configured.");
        return callWithRotation(PAID_FAST_POOL, req, paidKey, "fast", "paid");
      }
    },
    async strong(req) {
      try {
        return await callWithRotation(FREE_STRONG_POOL, req, freeKey, "strong", "free");
      } catch {
        if (!paidKey) throw new Error("All models exhausted and no paid key configured.");
        return callWithRotation(PAID_STRONG_POOL, req, paidKey, "strong", "paid");
      }
    },
  };
}
