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
import { rung, stepDown } from "./requestCapabilities";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS_ENDPOINT = "https://api.openai.com/v1/models";

// Default per tier is `[0]`. fast = cheap/frequent; strong = capable/rare.
// Verified live 2026-07-27: every id here answers on /v1/chat/completions at the
// `none` reasoning rung. `gpt-5.6` is real but does NOT appear in /v1/models —
// it is an unlisted alias, so don't "clean it up" for being absent from the picker.
const FAST_CATALOG = ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4"];
const STRONG_CATALOG = ["gpt-5.5", "gpt-5.6", "gpt-5.4"];

/**
 * Reasoning-effort rungs, cheapest first. The whole GPT-5.x family reasons, and
 * an unbounded strong-tier sweep over a large ledger blew past our 45s cap (see
 * strong_tier_eval_reliability.md), so we floor it. `none` is the true floor on
 * gpt-5.4/5.5/5.6 — but it is NOT universal, and the picker offers the models
 * that reject it:
 *   o3 / o4-mini        → "does not support 'none'. Supported: low, medium, high, xhigh"
 *   *-chat-latest       → "does not support 'none'. Supported: medium"
 *   gpt-5-search-api    → "Unrecognized request argument supplied: reasoning_effort"
 * The last rung omits the parameter entirely, which covers models that don't take
 * it at all. (The older 5.0/5.1 line took `minimal`, which 400s on 5.4+ — that is
 * why this is a ladder and not a single constant.)
 */
const REASONING_EFFORT_LADDER: (string | undefined)[] = ["none", "low", "medium", undefined];

function buildRequest(model: string, req: LLMRequest, key: string): BuiltRequest {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    // Deliberately NO `temperature`: the GPT-5.x family rejects any non-default
    // sampling value with a 400 ("Only the default (1) value is supported") — this
    // was silently killing every strong-tier (contradiction/doc-quality) call on
    // gpt-5.5. Determinism is driven by the prompt + JSON mode, as with Anthropic.
  };
  // Floor the hidden reasoning at the lowest rung this model accepts (see the
  // ladder above). Capping unconditionally is safe — our evals are located-critique
  // judgments, not open-ended reasoning — and mirrors Anthropic's `thinking:{disabled}`.
  const effort = REASONING_EFFORT_LADDER[rung("openai", model)];
  if (effort !== undefined) body.reasoning_effort = effort;
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

function classifyError(
  status: number,
  headers: Headers,
  body: string,
  model: string
): ErrorClassification {
  // A 400 naming `reasoning_effort` is the model refusing our effort rung, not a
  // bad prompt — step down and retry the same model once (see requestCapabilities.ts).
  if (status === 400 && /reasoning_effort/i.test(body)) {
    if (stepDown("openai", model, REASONING_EFFORT_LADDER.length)) {
      return { retryable: true, coolDownMs: 0, renegotiate: true };
    }
  }
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

// GET /v1/models → { object: "list", data: [{ id, object: "model", owned_by }] }.
function listModelsRequest(key: string): BuiltRequest {
  return {
    url: OPENAI_MODELS_ENDPOINT,
    init: { method: "GET", headers: { Authorization: `Bearer ${key}` } },
  };
}

// The list includes non-chat models — drop them by id substring so the picker
// offers only text-chat models. Covers embeddings, audio/tts/whisper, image/dall-e,
// moderation, realtime, video (sora), and legacy completions (…-instruct, and the
// pre-chat davinci/babbage/ada/curie families). Confirmed against a live
// /v1/models response (2026-07-08): sora-2 and gpt-3.5-turbo-instruct were the
// two non-chat ids that slipped through the first pass.
//
// 2026-07-27: `-pro` and `-codex` join them. They are text models and read like
// the most capable thing on offer, so a user picking `gpt-5.5-pro` for the strong
// tier is the obvious mistake — but they are not served by this endpoint at all
// ("This is not a chat model", "only supported in v1/responses"), so no capability
// renegotiation can rescue them; the only fix is not offering them. The `pro`
// pattern is anchored to a token boundary so it can't eat a future `gpt-6-prose`.
const OPENAI_NON_CHAT =
  /embedding|whisper|tts|audio|dall-e|image|moderation|realtime|transcribe|sora|instruct|davinci|babbage|ada|curie|codex|(?:^|[-_.])pro(?:$|[-_.])/i;

function parseModelsList(body: unknown): string[] {
  const data = (body as { data?: { id?: unknown }[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => m?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .filter((id) => !OPENAI_NON_CHAT.test(id));
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
    // Multi-model so a strong-tier failure (e.g. a timeout on a heavy sweep) can
    // rotate instead of dropping the whole call — OpenAI's strong pool was a
    // single model, so a `gpt-5.5` timeout had nowhere to go. `defaultModels`
    // still reads `catalog.strong[0]`, so the default stays `gpt-5.5`; the
    // per-selection routed pool preserves this fallback tail (see
    // `withSelection` in registry.ts). See strong_tier_eval_reliability.md.
    paidStrong: [...STRONG_CATALOG],
  },
  catalog: { fast: FAST_CATALOG, strong: STRONG_CATALOG },
  buildRequest,
  parseResponse,
  classifyError,
  listModelsRequest,
  parseModelsList,
};
