/**
 * Anthropic reference adapter (Messages API, direct-from-browser).
 *
 * Paid-only — no free tier, so the `free*` pools are empty and the user's single
 * BYO key rides the `paid*` pools (one model per tier, no rotation).
 *
 * Browser CORS is supported via the `anthropic-dangerous-direct-browser-access`
 * header — the same trust posture as Gemini's key-in-localStorage (surfaced as a
 * plain note in the README, PR 4). Verified against the Claude API reference
 * (2026-07-07): endpoint, headers, model IDs, and the Sonnet-5 thinking/sampling
 * rules below are all pinned.
 */

import type { LLMRequest } from "./router";
import type {
  ProviderAdapter,
  BuiltRequest,
  ParsedResponse,
  ErrorClassification,
} from "./provider";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Eval responses are small JSON classifications; this cap is generous headroom.
const MAX_TOKENS = 4096;

const FAST_CATALOG = ["claude-haiku-4-5"];
const STRONG_CATALOG = ["claude-sonnet-5"];

function buildRequest(model: string, req: LLMRequest, key: string): BuiltRequest {
  const body: Record<string, unknown> = {
    model,
    max_tokens: MAX_TOKENS,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    // Deliberately NO `temperature`: Sonnet 5 rejects a non-default sampling
    // parameter with a 400. Determinism is driven by prompt + disabled thinking.
  };
  // Sonnet 5 runs adaptive thinking when `thinking` is omitted — unwanted (and
  // billable) on a deterministic span/contradiction check, so disable it. Haiku
  // 4.5 takes no thinking config, so only set it for the Sonnet (strong) tier.
  if (model.includes("sonnet")) {
    body.thinking = { type: "disabled" };
  }

  return {
    url: ANTHROPIC_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    },
  };
}

function parseResponse(body: unknown): ParsedResponse {
  const data = body as {
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  // The prompt asks for JSON in the text; read the first text block exactly as
  // the Gemini path does (the evaluator parses JSON out of `text`).
  const textBlock = data.content?.find((b) => b.type === "text") ?? data.content?.[0];
  const text = textBlock?.text ?? "";
  const u = data.usage;
  const usage = u
    ? {
        promptTokens: u.input_tokens ?? 0,
        candidateTokens: u.output_tokens ?? 0,
        totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      }
    : undefined;
  return { text, usage };
}

function classifyError(status: number, headers: Headers): ErrorClassification {
  if (status === 429) {
    const retryAfter = parseRetryAfter(headers);
    return { retryable: true, coolDownMs: retryAfter ?? 45_000, quotaKind: "perMinute" };
  }
  // 529 overloaded (and other 5xx) are transient; 400/401/403 abort with a clear
  // message for the "Ping model" decode (PR 3).
  if (status >= 500) {
    return { retryable: true, coolDownMs: 0 };
  }
  return { retryable: false, coolDownMs: 0 };
}

// GET /v1/models → { data: [{ id, type: "model", display_name, created_at }], … }.
// Same direct-from-browser headers as the Messages call. All returned models are
// Claude chat models, so no capability filtering is needed.
function listModelsRequest(key: string): BuiltRequest {
  return {
    url: "https://api.anthropic.com/v1/models?limit=1000",
    init: {
      method: "GET",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
    },
  };
}

function parseModelsList(body: unknown): string[] {
  const data = (body as { data?: { id?: unknown }[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => m?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Anthropic returns `retry-after` in integer seconds on a 429. */
function parseRetryAfter(headers: Headers): number | null {
  const v = headers.get("retry-after");
  if (!v) return null;
  const seconds = parseInt(v, 10);
  if (isNaN(seconds)) return null;
  return seconds * 1000;
}

export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
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
  listModelsRequest,
  parseModelsList,
};
