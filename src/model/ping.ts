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
