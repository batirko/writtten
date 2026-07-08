import type { LLMRequest, ModelRouter } from "./router";
import type {
  ProviderAdapter,
  BuiltRequest,
  ParsedResponse,
  ErrorClassification,
} from "./provider";
import { parse429 } from "./logger";
import { createRouterForAdapter } from "./rotation";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
  "gemini-3.1-flash-lite", // 500 RPD — primary workhorse on free tier
  "gemini-2.5-flash-lite", // 20 RPD fallback
  "gemini-2.5-flash", // 20 RPD fallback
  "gemini-3.5-flash", // 20 RPD last resort
];
const FREE_STRONG_POOL = [
  "gemini-3.1-flash-lite", // 500 RPD — best available on free tier
  "gemini-3.5-flash", // 20 RPD fallback
  "gemini-2.5-flash", // 20 RPD last resort
  // gemini-2.5-pro excluded: 0 RPD on free tier (limit: 0 in every 429 payload)
];

// Paid key pools: RPD not a bottleneck, so quality ordering.
const PAID_FAST_POOL = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
const PAID_STRONG_POOL = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3.5-flash"];

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
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const elapsedMs = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  const msInDay = 24 * 60 * 60 * 1000;
  // Add 60 s buffer so we don't fire a request right at the reset boundary.
  return msInDay - elapsedMs + 60_000;
}

function buildRequest(model: string, req: LLMRequest, key: string): BuiltRequest {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${key}`;

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

  return {
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  };
}

function parseResponse(body: unknown): ParsedResponse {
  const data = body as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const um = data.usageMetadata;
  const usage = um
    ? {
        promptTokens: um.promptTokenCount ?? 0,
        candidateTokens: um.candidatesTokenCount ?? 0,
        totalTokens: um.totalTokenCount ?? 0,
      }
    : undefined;
  return { text, usage };
}

// GET /v1beta/models?key=… → { models: [{ name: "models/gemini-…",
// supportedGenerationMethods: [...] }], nextPageToken }. Keep only models that
// support generateContent (drops embedding/aqa/imagen/tts variants), and strip
// the "models/" resource prefix to bare ids.
function listModelsRequest(key: string): BuiltRequest {
  return { url: `${GEMINI_API_BASE}?key=${key}&pageSize=1000`, init: { method: "GET" } };
}

function parseModelsList(body: unknown): string[] {
  const models = (body as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] })
    ?.models;
  if (!Array.isArray(models)) return [];
  return models
    .filter(
      (m) =>
        Array.isArray(m?.supportedGenerationMethods) &&
        (m.supportedGenerationMethods as unknown[]).includes("generateContent")
    )
    .map((m) => m?.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .map((name) => name.replace(/^models\//, ""));
}

function classifyError(status: number, headers: Headers, body: string): ErrorClassification {
  if (status === 429) {
    const parsed = parse429(body);
    const isPerDay = parsed?.kinds.includes("perDay") ?? false;
    // PerDay exhaustion: cool down until Pacific midnight — the retry-delay header
    // only gives RPM back-off (5–45 s) and is useless once the daily cap is hit.
    const coolDownMs = isPerDay ? msTilPacificMidnight() : (parseRetryDelay(headers) ?? 45_000);
    return { retryable: true, coolDownMs, quotaKind: parsed?.kinds[0] };
  }
  // 503 (incl. our own timeout) and 404 rotate to the next model; other statuses
  // abort the logical call (matches the pre-refactor behavior exactly).
  if (status === 503 || status === 404) {
    return { retryable: true, coolDownMs: 0 };
  }
  return { retryable: false, coolDownMs: 0 };
}

export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  label: "Gemini",
  pools: {
    freeFast: FREE_FAST_POOL,
    freeStrong: FREE_STRONG_POOL,
    paidFast: PAID_FAST_POOL,
    paidStrong: PAID_STRONG_POOL,
  },
  // The free rotation pool isn't user-editable in Phase 6 (RPD spreading is
  // load-bearing), so Gemini shows a read-only pool note, not a picker. The
  // catalog therefore only feeds the "what's running" legibility card — point it
  // at the *free* pools so the card names what actually runs by default
  // (flash-lite), not the paid `pro` model that has 0 free-tier RPD.
  catalog: {
    fast: FREE_FAST_POOL,
    strong: FREE_STRONG_POOL,
  },
  buildRequest,
  parseResponse,
  classifyError,
  listModelsRequest,
  parseModelsList,
};

/** Thin shim preserving the original public surface: build a Gemini `ModelRouter`
 *  by driving the generic rotation engine with the Gemini adapter. Every existing
 *  call site and test mock (`../model/gemini` → `createGeminiRouter`) is unchanged. */
export function createGeminiRouter(freeKey: string, paidKey?: string): ModelRouter {
  return createRouterForAdapter(geminiAdapter, freeKey, paidKey);
}
