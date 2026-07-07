/**
 * Provider-agnostic adapter seam.
 *
 * Everything the resilience layer (`rotation.ts`) needs to drive *one* LLM
 * provider is captured here: which models to try per tier, how to build one HTTP
 * attempt, how to read a success body, and how to classify a failure into the
 * rotation machinery's common vocabulary. A new provider is one new file that
 * implements this interface — zero changes to `rotation.ts`, the `ModelRouter`
 * interface, or any call site. See docs/projects/multi_provider_router.md.
 *
 * Gemini is the first implementation (`gemini.ts`); OpenAI and Anthropic follow
 * in the same shape.
 */

import type { LLMRequest } from "./router";

export type ProviderId = "gemini" | "openai" | "anthropic";

/** Which quota dimension a 429 violated — informational (surfaced by the future
 *  per-provider "Ping model" decode); the per-model stats in `logger.ts` are
 *  computed independently from the raw error body. */
export type QuotaKind = "perDay" | "perMinute" | "inputTokens" | "other";

/** Token usage for cost/session accounting, normalized across providers. */
export interface AdapterUsage {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

/** What a 2xx body yielded: the model's text plus optional usage. */
export interface ParsedResponse {
  text: string;
  usage?: AdapterUsage;
}

/** One concrete HTTP attempt. The key lives in `url` (query param) or `init`
 *  (header) per provider; `rotation.ts` redacts the key from the logged endpoint
 *  generically, so adapters don't format a log string themselves. */
export interface BuiltRequest {
  url: string;
  init: RequestInit;
}

/** How `rotation.ts` should treat a non-2xx response. */
export interface ErrorClassification {
  /** Move on to the next model in the pool (vs. abort the whole logical call). */
  retryable: boolean;
  /** How long to bench this model in the cool-down registry; 0 = don't bench. */
  coolDownMs: number;
  quotaKind?: QuotaKind;
}

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  /**
   * Ordered rotation pools per tier. `free*` pools ride the provider's free
   * tier (Gemini only); paid-only providers leave them empty and populate
   * `paid*`. Order matters — first available (non-cooled-down) model wins.
   */
  pools: { freeFast: string[]; freeStrong: string[]; paidFast: string[]; paidStrong: string[] };
  /** Build the HTTP call for one model attempt. */
  buildRequest(model: string, req: LLMRequest, key: string): BuiltRequest;
  /** Extract text (+ usage) from a parsed 2xx JSON body. */
  parseResponse(body: unknown): ParsedResponse;
  /** Map a non-2xx response to the rotation machinery's common vocabulary.
   *  `body` is the raw response text (adapters parse it as needed). */
  classifyError(status: number, headers: Headers, body: string): ErrorClassification;
}
