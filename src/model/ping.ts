/**
 * "Ping model" — a one-shot key check that turns a raw HTTP status into a
 * plain-language verdict. This is the single biggest confidence win for BYOK:
 * it tells a user whether a pasted key is valid, valid-but-unbilled, or simply
 * unreachable (CORS/network) — instead of a silent dead-end. See
 * docs/projects/multi_provider_router.md §D.
 *
 * Deliberately bypasses the rotation engine: it builds one request via the
 * provider adapter, fetches directly, and decodes the outcome. No retries, no
 * pool fallback — just "did this exact key reach this exact model?".
 */

import type { ProviderId } from "./provider";
import type { LLMRequest } from "./router";
import { resolveProvider } from "./registry";
import { parse429 } from "./logger";

export type PingStatus = "ok" | "invalid" | "billing" | "rate_limited" | "network" | "error";

export interface PingResult {
  status: PingStatus;
  /** Short, plain-language verdict for the settings panel. */
  label: string;
}

const PING_REQUEST: LLMRequest = {
  system: "Connectivity check.",
  user: "Reply with the single word OK.",
  json: false,
};

export async function pingProvider(
  providerId: ProviderId,
  key: string,
  model: string
): Promise<PingResult> {
  if (!key.trim()) return { status: "invalid", label: "Enter a key first." };

  const adapter = resolveProvider(providerId);
  const { url, init } = adapter.buildRequest(model, PING_REQUEST, key);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // A thrown fetch is a network failure or a CORS rejection — the request
    // never reached the provider, so this is not about the key's validity.
    return {
      status: "network",
      label: "Couldn't reach the provider — check your network or CORS.",
    };
  }

  if (res.ok) return { status: "ok", label: `Key works — ${model} replied.` };

  const body = (await res.text().catch(() => "")).toLowerCase();
  return decode(res.status, body);
}

/**
 * Whether a Gemini key is on the free or paid tier — a property the key string
 * can't reveal (it's server-side billing on the Google Cloud project). We infer
 * it: `gemini-2.5-pro` has **0 requests/day on the free tier**, so a one-shot
 * probe is decisive. 200 → billing is on (paid); a 429 with a *per-day* quota
 * violation → valid key but 0 pro quota (free); 401/403 → the key itself is bad.
 * This replaces the manual "capable model (paid tier)" checkbox — the product
 * answers the question the user can't. See docs/projects/multi_provider_router.md
 * and docs/projects/byok_capability_model.md.
 */
export type GeminiTier = "free" | "paid" | "invalid" | "unknown";

export async function detectGeminiTier(key: string): Promise<GeminiTier> {
  if (!key.trim()) return "unknown";
  const adapter = resolveProvider("gemini");
  const { url, init } = adapter.buildRequest("gemini-2.5-pro", PING_REQUEST, key);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return "unknown"; // network / CORS — can't tell; don't claim a tier
  }
  if (res.ok) return "paid"; // pro answered → billing enabled

  const body = await res.text().catch(() => "");
  const lower = body.toLowerCase();
  if (
    res.status === 401 ||
    res.status === 403 ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid")
  ) {
    return "invalid";
  }
  if (res.status === 429) {
    const parsed = parse429(body);
    // Free tier: pro's 0-RPD cap surfaces as a PerDay quota violation.
    if (parsed?.kinds.includes("perDay")) return "free";
    // A per-minute-only 429 means the key *reached* pro (has access) but is
    // momentarily rate-limited → paid.
    if (parsed && parsed.kinds.length > 0) return "paid";
    // Unparseable 429 on pro: default to the conservative free reading (never
    // over-claim the strong tier without a clear signal).
    return "free";
  }
  return "unknown";
}

function decode(status: number, body: string): PingResult {
  const invalidKey =
    status === 401 ||
    status === 403 ||
    body.includes("api_key_invalid") ||
    body.includes("invalid api key") ||
    body.includes("invalid x-api-key") ||
    body.includes("authentication_error");
  if (invalidKey) return { status: "invalid", label: "Invalid key." };

  const billing =
    status === 402 ||
    body.includes("insufficient_quota") ||
    body.includes("credit balance") ||
    body.includes("billing");
  if (billing) return { status: "billing", label: "Valid key — billing not enabled." };

  if (status === 429) {
    if (body.includes("quota")) {
      return { status: "billing", label: "Valid key, but quota is exhausted." };
    }
    return { status: "rate_limited", label: "Key works, but rate-limited right now." };
  }

  return { status: "error", label: `Provider error (${status}).` };
}
