import type { LLMRequest, LLMResponse, ModelRouter } from "./router";
import { llmLogger } from "./logger";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Model Pools
const FAST_POOL = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
];
const STRONG_POOL = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

class CoolDownRegistry {
  private coolDowns = new Map<string, number>();

  markUnavailable(model: string, delayMs: number) {
    this.coolDowns.set(model, Date.now() + delayMs);
  }

  isAvailable(model: string): boolean {
    const expiresAt = this.coolDowns.get(model);
    if (!expiresAt) return true;
    return Date.now() > expiresAt;
  }
}

const registry = new CoolDownRegistry();

function parseRetryDelay(headers: Headers): number | null {
  const delayStr = headers.get("retry-delay");
  if (!delayStr) return null;
  const seconds = parseInt(delayStr, 10);
  if (isNaN(seconds)) return null;
  return seconds * 1000;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(model: string, req: LLMRequest, apiKey: string): Promise<LLMResponse> {
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
    model,
    endpoint: url,
    payload: { system: req.system, user: req.user },
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  
  const latencyMs = Date.now() - startTime;

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 429) {
      const waitTime = parseRetryDelay(res.headers) ?? 45_000;
      registry.markUnavailable(model, waitTime);
    }
    
    llmLogger.log({
      type: "error",
      model,
      endpoint: url,
      latencyMs,
      statusCode: res.status,
      payload: { system: req.system, user: req.user },
      errorMessage: err,
    });
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  
  llmLogger.log({
    type: "response",
    model,
    endpoint: url,
    latencyMs,
    statusCode: res.status,
    payload: { system: req.system, user: req.user },
    response: text,
  });

  return { text };
}

async function callWithRotation(pool: string[], req: LLMRequest, apiKey: string): Promise<LLMResponse> {
  let attempt = 0;
  
  for (const model of pool) {
    if (!registry.isAvailable(model)) {
      continue;
    }
    
    try {
      llmLogger.setActiveProvider(model);
      if (attempt > 0) {
        // Backoff before retry
        const backoff = 500 * Math.pow(2, attempt - 1);
        llmLogger.log({
          type: "retry",
          model,
          endpoint: "",
          payload: { system: req.system, user: req.user },
          errorMessage: `Retrying with ${model} after ${backoff}ms`,
        });
        await delay(backoff);
      }
      
      const res = await callGemini(model, req, apiKey);
      return res;
    } catch (e) {
      const err = e as Error;
      // If it's a 429 (rate limit), 503 (unavailable), or 404 (model not found), try the next model
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
  
  const msg = "All models in the pool are exhausted or rate-limited.";
  llmLogger.log({
    type: "error",
    model: "none",
    endpoint: "",
    payload: { system: req.system, user: req.user },
    errorMessage: msg,
  });
  throw new Error(msg);
}

export function createGeminiRouter(apiKey: string): ModelRouter {
  return {
    fast: (req) => callWithRotation(FAST_POOL, req, apiKey),
    strong: (req) => callWithRotation(STRONG_POOL, req, apiKey),
  };
}
