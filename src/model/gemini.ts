import type { LLMRequest, ModelRouter } from "./router";
import type {
  ProviderAdapter,
  BuiltRequest,
  ParsedResponse,
  ErrorClassification,
} from "./provider";
import { parse429 } from "./logger";
import { createRouterForAdapter } from "./rotation";
import { rung, stepDown, seed } from "./requestCapabilities";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Model pools — free-tier ordering by RPD budget.
 *
 * FAST: summarization + span checks (frequent, latency-sensitive).
 * STRONG: contradiction + doc-level checks (rarer, quality-sensitive).
 *
 * Pool order is RPD-budget-first on the free tier:
 *   gemini-3.1-flash-lite = 500 RPD (25× more than the 20-RPD flash variants)
 *   gemini-3.5-flash      = 20 RPD
 *   gemini-2.5-pro        = 0 RPD (no free-tier quota — excluded from free pools)
 *
 * gemini-2.5-pro stays the paid strong adjudicator — it's the deepest reasoner
 * we have and is NOT retired (Google's announced retirement is 2026-10-16; until
 * then it has full paid quota). The redundant gemini-2.5-flash / -flash-lite
 * fallbacks were dropped: 3.1-flash-lite + 3.5-flash already cover the flash tier,
 * and trimming the 2.5 line shrinks exposure to its eventual retirement. NB: a
 * transient 404 "no longer available" can hit any of these mid-rollout — it's not
 * a real deprecation; the rotation engine already recovers by trying the next model.
 *
 * Paid pools use better models since RPD is not a constraint.
 * See docs/projects/model_rotation_and_debugging.md §2.
 *
 * 2026-07-27 refresh — newer models exist (gemini-3.5-flash-lite, gemini-3.6-flash,
 * gemini-3.1-pro-preview) and all three answer live, so they join the pools.
 *
 * Free-tier budgets read off the AI Studio dashboard 2026-07-27, and the useful
 * finding is that **the free budget tracks the model CLASS, not the version**:
 * gemini-3.5-flash-lite gets the same 500 RPD / 15 RPM as gemini-3.1-flash-lite,
 * and gemini-3.6-flash the same 20 RPD / 5 RPM as gemini-3.5-flash. Quotas are
 * per model, so pooling both members of a class **doubles** the tier's daily
 * budget (flash-lite: 500 → 1000/day) rather than sharing one.
 *
 * That parity is why the newcomers sit *behind* the incumbents rather than
 * replacing them. With budget equal, primary-vs-fallback is no longer a quota
 * decision — it is a **signal-quality** decision about which model writes the
 * observations most users read, and that belongs to the eval ratchet, not to a
 * version number. Left in the safe order until an eval says otherwise.
 */
const FREE_FAST_POOL = [
  "gemini-3.1-flash-lite", // 500 RPD / 15 RPM — primary workhorse on free tier
  "gemini-3.5-flash-lite", // same class → its own 500 RPD / 15 RPM bucket
  "gemini-3.5-flash", // 20 RPD fallback
];
const FREE_STRONG_POOL = [
  "gemini-3.1-flash-lite", // 500 RPD / 15 RPM — best available on free tier
  "gemini-3.5-flash-lite", // same class → its own 500 RPD / 15 RPM bucket
  "gemini-3.5-flash", // 20 RPD fallback
  // Both pro models are 0/0 on the free tier (dashboard + a first-request 429
  // carrying `…PerDay…-FreeTier`), so they stay out of the free pools entirely.
];

// Paid key pools: RPD not a bottleneck, so quality ordering.
const PAID_FAST_POOL = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.6-flash"];
// gemini-3.1-pro-preview sits directly behind gemini-2.5-pro: it is the only
// successor on offer for the deep adjudicator ahead of 2.5-pro's 2026-10-16
// retirement, but it is preview-tagged, so it stays off the critical path until
// a stable 3.x pro ships. Paid budgets (AI Studio, 2026-07-27) argue the same
// way and more sharply: 3.1-pro gets 25 RPM / 250 RPD against 2.5-pro's
// 150 RPM / 1K RPD, so it is a 6×-tighter burst budget on exactly the tier that
// fires several strong calls in a row. That gap is the real cost of the October
// retirement — not the model swap itself.
const PAID_STRONG_POOL = [
  "gemini-2.5-pro",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

/**
 * Thinking-budget rungs, cheapest first. `0` turns thinking off outright, which
 * is what a located-critique judgment wants — it is billable, it adds latency,
 * and an unbounded strong-tier sweep over a large ledger blows past our request
 * timeout (see strong_tier_eval_reliability.md).
 *
 * But `0` is not universally accepted, and the old rule here (`model.includes(
 * "2.5-pro") ? 128 : 0`) encoded the assumption that only 2.5-pro refuses it.
 * That is now false for the whole 3.5+ generation: gemini-3.5-flash-lite,
 * gemini-3.6-flash and gemini-3.1-pro-preview all 400 on a zero budget
 * ("Budget 0 is invalid. This model only works in thinking mode."). Rung 1 is the
 * smallest non-zero floor those models accept.
 *
 * The floor is NOT free, which is why it stays rung 1 rather than becoming the
 * single uniform value: measured 2026-07-27, gemini-3.5-flash at budget 128 spent
 * 90 thinking tokens and took 1368ms, versus 0 tokens and 816ms at budget 0.
 */
const THINKING_BUDGET_LADDER = [0, 128];

// Verified against the live API 2026-07-27 — skips the discovery round-trip.
seed("gemini", {
  "gemini-2.5-pro": 1,
  "gemini-3.1-pro-preview": 1,
  "gemini-3.5-flash-lite": 1,
  "gemini-3.6-flash": 1,
});

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
    thinkingConfig?: { thinkingBudget: number };
  } = {
    temperature: 0.2,
    // Floor the hidden reasoning at the lowest rung this model accepts (see the
    // ladder above). `buildRequest` gets no `tier`, but capping unconditionally is
    // safe — our evals are located-critique judgments, not open-ended reasoning —
    // and mirrors Anthropic's `thinking:{disabled}`.
    thinkingConfig: { thinkingBudget: THINKING_BUDGET_LADDER[rung("gemini", model)] },
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

function classifyError(
  status: number,
  headers: Headers,
  body: string,
  model: string
): ErrorClassification {
  // A 400 is Gemini refusing our thinking rung, not a bad prompt. The precise
  // form varies ("Budget 0 is invalid. This model only works in thinking mode."
  // on a pro model, a bare "Request contains an invalid argument." on the 3.5+
  // flash models), so gate on the status and let the finite ladder bound the
  // damage: at most one extra request per model per session (requestCapabilities.ts).
  if (status === 400 && stepDown("gemini", model, THINKING_BUDGET_LADDER.length)) {
    return { retryable: true, coolDownMs: 0, renegotiate: true };
  }
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
