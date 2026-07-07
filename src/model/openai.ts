/**
 * OpenAI reference adapter (Chat Completions API).
 *
 * Paid-only — OpenAI has no free API tier, so the `free*` pools are empty and the
 * user's single BYO key rides the `paid*` pools. One model routes per tier (no
 * rotation for paid providers); the `catalog` offers the picker its alternatives.
 *
 * Model IDs reflect the July-2026 lineup (GPT-5.5 flagship, 5.4-mini cheap tier);
 * they move fast — re-check https://developers.openai.com/api/docs/models when a
 * default feels stale. The catalog + in-product picker (PR 3) make any single ID
 * non-load-bearing: the user can switch without a code change.
 */

import type { LLMRequest } from "./router";
import type {
  ProviderAdapter,
  BuiltRequest,
  ParsedResponse,
  ErrorClassification,
} from "./provider";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

// Default per tier is `[0]`. fast = cheap/frequent; strong = capable/rare.
const FAST_CATALOG = ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4"];
const STRONG_CATALOG = ["gpt-5.5", "gpt-5.6", "gpt-5.4"];

function buildRequest(model: string, req: LLMRequest, key: string): BuiltRequest {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    temperature: 0.2,
  };
  // Ask for a JSON object when the eval expects structured output — mirrors the
  // Gemini `responseMimeType: application/json` path.
  if (req.json) {
    body.response_format = { type: "json_object" };
  }

  return {
    url: OPENAI_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    },
  };
}

function parseResponse(body: unknown): ParsedResponse {
  const data = body as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const u = data.usage;
  const usage = u
    ? {
        promptTokens: u.prompt_tokens ?? 0,
        candidateTokens: u.completion_tokens ?? 0,
        totalTokens: u.total_tokens ?? 0,
      }
    : undefined;
  return { text, usage };
}

function classifyError(status: number, headers: Headers, body: string): ErrorClassification {
  if (status === 429) {
    // `insufficient_quota` is a hard wall (no billing / spend cap) — there is no
    // free tier to fall back to, so treat it as non-retryable with a clear body
    // for the "Ping model" decode (PR 3). A plain rate-limit honors Retry-After.
    if (body.includes("insufficient_quota")) {
      return { retryable: false, coolDownMs: 0, quotaKind: "other" };
    }
    const retryAfter = parseRetryAfter(headers);
    return { retryable: true, coolDownMs: retryAfter ?? 45_000, quotaKind: "perMinute" };
  }
  // 5xx (incl. 503) are transient; other statuses (400/401/403/404) abort.
  if (status >= 500) {
    return { retryable: true, coolDownMs: 0 };
  }
  return { retryable: false, coolDownMs: 0 };
}

/** OpenAI returns `Retry-After` in seconds (integer or HTTP-date). We honor the
 *  integer-seconds form; the date form falls back to the default. */
function parseRetryAfter(headers: Headers): number | null {
  const v = headers.get("retry-after");
  if (!v) return null;
  const seconds = parseInt(v, 10);
  if (isNaN(seconds)) return null;
  return seconds * 1000;
}

export const openaiAdapter: ProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  pools: {
    freeFast: [],
    freeStrong: [],
    paidFast: [FAST_CATALOG[0]],
    paidStrong: [STRONG_CATALOG[0]],
  },
  catalog: { fast: FAST_CATALOG, strong: STRONG_CATALOG },
  buildRequest,
  parseResponse,
  classifyError,
};
