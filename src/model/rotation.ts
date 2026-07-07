/**
 * Provider-agnostic resilience engine.
 *
 * Drives any `ProviderAdapter` through the rotation/cool-down/retry/stall/
 * timeout/logging machinery that used to live inside `gemini.ts`. The
 * Gemini-specific bits (pool constants, 429/quota parsing, Pacific-midnight
 * cool-down) now live inside the Gemini adapter's `pools`/`classifyError`; this
 * module knows nothing about any one provider. See
 * docs/projects/multi_provider_router.md.
 */

import type { LLMRequest, LLMResponse, ModelRouter } from "./router";
import type { ProviderAdapter } from "./provider";
import { llmLogger } from "./logger";
import { trackCall } from "./rpmBudget";
import { reportStall, reportProgress } from "./stallSignal";
import { nanoid } from "nanoid";

/**
 * Per-request timeout. A real Gemini call observed at 40.6s justifies a hard cap:
 * past this we abort, mark the attempt as a (retryable) failure so rotation moves
 * to the next model, and raise the stall signal so the UI stops looking frozen.
 */
const REQUEST_TIMEOUT_MS: Record<"fast" | "strong", number> = {
  fast: 30_000,
  strong: 45_000,
};

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
// Keyed by model name, which is unique across providers, so a single pair of
// process-global registries is safe to share across adapters.
const freeRegistry = new CoolDownRegistry();
const paidRegistry = new CoolDownRegistry();

/** Thrown by `callAttempt`; `retryable` tells the pool loop whether to advance to
 *  the next model or abort the whole logical call. */
class ProviderCallError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderCallError";
    this.retryable = retryable;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callAttempt(
  adapter: ProviderAdapter,
  model: string,
  req: LLMRequest,
  apiKey: string,
  tier: "fast" | "strong",
  keyTier: "free" | "paid",
  callId: string
): Promise<LLMResponse> {
  const { url, init } = adapter.buildRequest(model, req, apiKey);
  // Redact the key from the logged endpoint generically: providers that put the
  // key in the URL (Gemini `?key=`) get it masked; header-auth providers have no
  // key in the URL, so this is a no-op and the endpoint logs clean.
  const loggedUrl = apiKey ? url.split(apiKey).join(`<${keyTier}>`) : url;
  const evalId = req.meta?.evalId;
  const promptRef = req.meta?.promptRef;

  const startTime = Date.now();
  llmLogger.log({
    type: "request",
    tier,
    model,
    endpoint: loggedUrl,
    payload: { system: req.system, user: req.user },
    keyTier,
    callId,
    evalId,
    promptRef,
  });

  const controller = new AbortController();
  const timeoutMs = REQUEST_TIMEOUT_MS[tier];
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
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
        endpoint: loggedUrl,
        latencyMs,
        statusCode: 503,
        payload: { system: req.system, user: req.user },
        errorMessage: `Request timeout (503) after ${timeoutMs}ms`,
        keyTier,
        callId,
        evalId,
        promptRef,
      });
      throw new ProviderCallError(`Request timeout (503) after ${timeoutMs}ms`, true);
    }
    // Non-abort fetch failure (network error): not retryable — abort the call.
    throw e;
  }
  clearTimeout(timeoutId);

  const latencyMs = Date.now() - startTime;

  if (!res.ok) {
    const errText = await res.text();
    const classification = adapter.classifyError(res.status, res.headers, errText);
    if (classification.coolDownMs > 0) {
      const reg = keyTier === "paid" ? paidRegistry : freeRegistry;
      reg.markUnavailable(model, classification.coolDownMs);
    }

    llmLogger.log({
      type: "error",
      model,
      endpoint: loggedUrl,
      latencyMs,
      statusCode: res.status,
      payload: { system: req.system, user: req.user },
      errorMessage: errText,
      keyTier,
      callId,
      evalId,
      promptRef,
    });
    throw new ProviderCallError(
      `${adapter.id} error ${res.status}: ${errText}`,
      classification.retryable
    );
  }

  const data = await res.json();
  const { text, usage } = adapter.parseResponse(data);

  llmLogger.log({
    type: "response",
    tier,
    model,
    endpoint: loggedUrl,
    latencyMs,
    statusCode: res.status,
    payload: { system: req.system, user: req.user },
    response: text,
    keyTier,
    callId,
    evalId,
    promptRef,
    usage,
  });

  // Record call completion for RPM budget tracking.
  trackCall();
  // A good response clears any prior stall state.
  reportProgress();

  return { text, callId };
}

async function callWithRotation(
  adapter: ProviderAdapter,
  pool: string[],
  req: LLMRequest,
  apiKey: string,
  tier: "fast" | "strong",
  keyTier: "free" | "paid"
): Promise<LLMResponse> {
  const reg = keyTier === "paid" ? paidRegistry : freeRegistry;
  // One callId spans the whole logical call, including every rotation attempt,
  // so the export projection folds request/retry/response/error into one record.
  const callId = nanoid(10);
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
          latencyMs: backoff,
          payload: { system: req.system, user: req.user },
          errorMessage: `Retrying with ${model} after ${backoff}ms`,
          keyTier,
          callId,
          evalId: req.meta?.evalId,
          promptRef: req.meta?.promptRef,
        });
        await delay(backoff);
      }

      return await callAttempt(adapter, model, req, apiKey, tier, keyTier, callId);
    } catch (e) {
      if (!(e instanceof ProviderCallError) || !e.retryable) throw e;
    }
    attempt++;
  }

  throw new Error(`Pool exhausted (${keyTier})`);
}

/**
 * Build a `ModelRouter` for one provider adapter. The free→paid fallback
 * orchestration (try the free pool, fall back to the paid pool on exhaustion for
 * `fast`; prefer the paid pool then fall back to free for `strong`) is the same
 * shape Gemini used and generalizes to any adapter: a paid-only provider simply
 * has empty `free*` pools, so the free attempt exhausts immediately and the paid
 * key carries the call.
 */
export function createRouterForAdapter(
  adapter: ProviderAdapter,
  freeKey: string,
  paidKey?: string
): ModelRouter {
  return {
    async fast(req) {
      try {
        return await callWithRotation(
          adapter,
          adapter.pools.freeFast,
          req,
          freeKey,
          "fast",
          "free"
        );
      } catch {
        if (!paidKey) throw new Error("All models exhausted and no paid key configured.");
        return callWithRotation(adapter, adapter.pools.paidFast, req, paidKey, "fast", "paid");
      }
    },
    async strong(req) {
      if (paidKey) {
        try {
          return await callWithRotation(
            adapter,
            adapter.pools.paidStrong,
            req,
            paidKey,
            "strong",
            "paid"
          );
        } catch {
          return callWithRotation(
            adapter,
            adapter.pools.freeStrong,
            req,
            freeKey,
            "strong",
            "free"
          );
        }
      }
      return callWithRotation(adapter, adapter.pools.freeStrong, req, freeKey, "strong", "free");
    },
  };
}
