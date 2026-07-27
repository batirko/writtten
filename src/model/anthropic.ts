/**
 * Anthropic reference adapter (Messages API, direct-from-browser).
 *
 * Paid-only — no free tier, so the `free*` pools are empty and the user's single
 * BYO key rides the `paid*` pools (one model per tier, no rotation).
 *
 * Browser CORS is supported via the `anthropic-dangerous-direct-browser-access`
 * header — the same trust posture as Gemini's key-in-localStorage (surfaced as a
 * plain note in the README, PR 4). Verified against the live Messages API
 * (2026-07-27): endpoint, headers, model IDs, and the thinking/sampling rules
 * below are all pinned against real responses.
 */

import type { LLMRequest } from "./router";
import type {
  ProviderAdapter,
  BuiltRequest,
  ParsedResponse,
  ErrorClassification,
} from "./provider";
import { rung, stepDown, seed } from "./requestCapabilities";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Eval responses are small JSON classifications; this cap is generous headroom.
// NB: on Claude 5 models `max_tokens` caps thinking AND answer together, which is
// why leaving thinking on (below) risks a truncated answer, not just a slow one.
const MAX_TOKENS = 4096;

const FAST_CATALOG = ["claude-haiku-4-5"];
// Sonnet 5 stays the default (`[0]` seeds the routing pool). Opus 5 is the
// stronger, pricier flagship and Opus 4.8 the prior generation — both are
// offered in the picker and double as the failure-only fallback tail that
// `withSelection` (registry.ts) builds from this list.
const STRONG_CATALOG = ["claude-sonnet-5", "claude-opus-5", "claude-opus-4-8"];

/**
 * Thinking rungs, cheapest first. Our evals are located-critique judgments, not
 * open-ended reasoning, so we want thinking off: it is billable, it adds latency,
 * and on Claude 5 it shares the `max_tokens` budget with the answer. Every
 * current model accepts `disabled` EXCEPT Claude Fable 5, which 400s with
 * `"thinking.type.disabled" is not supported for this model` — it only runs in
 * thinking mode, so it falls to rung 1 (omit the field entirely).
 */
const THINKING_LADDER: (Record<string, unknown> | undefined)[] = [{ type: "disabled" }, undefined];

// Verified against the live API 2026-07-27 — skips the discovery round-trip.
seed("anthropic", { "claude-fable-5": 1 });

function buildRequest(model: string, req: LLMRequest, key: string): BuiltRequest {
  const body: Record<string, unknown> = {
    model,
    max_tokens: MAX_TOKENS,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    // Deliberately NO `temperature`: the Claude 5 family rejects a non-default
    // sampling parameter with a 400. Determinism comes from the prompt and from
    // holding thinking at the lowest rung the model allows.
  };
  const thinking = THINKING_LADDER[rung("anthropic", model)];
  if (thinking) body.thinking = thinking;

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

function classifyError(
  status: number,
  headers: Headers,
  body: string,
  model: string
): ErrorClassification {
  if (status === 429) {
    const retryAfter = parseRetryAfter(headers);
    return { retryable: true, coolDownMs: retryAfter ?? 45_000, quotaKind: "perMinute" };
  }
  // A 400 naming `thinking` is the model refusing our thinking rung, not a bad
  // prompt — step down and retry the same model once (see requestCapabilities.ts).
  if (status === 400 && /thinking/i.test(body)) {
    if (stepDown("anthropic", model, THINKING_LADDER.length)) {
      return { retryable: true, coolDownMs: 0, renegotiate: true };
    }
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
    // Multi-model so a strong-tier failure (a timeout on a heavy contradiction
    // sweep) rotates instead of dropping the call. `defaultModels` still reads
    // `catalog.strong[0]`, so the default stays `claude-sonnet-5`; the
    // per-selection routed pool preserves this tail (`withSelection`, registry.ts).
    paidStrong: [...STRONG_CATALOG],
  },
  catalog: { fast: FAST_CATALOG, strong: STRONG_CATALOG },
  buildRequest,
  parseResponse,
  classifyError,
  listModelsRequest,
  parseModelsList,
};
