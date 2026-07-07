/**
 * Mode-aware router factory. Returns a ModelRouter that, depending on the
 * current LLM mode (see ./mock), either calls Gemini, records its responses,
 * or replays canned ones. The evaluator builds its router through here instead
 * of calling createGeminiRouter directly, so tests can go deterministic/offline
 * without touching the evaluation logic.
 */

import type { LLMRequest, LLMResponse, ModelRouter } from "./router";
import type { ProviderId } from "./provider";
import { createGeminiRouter } from "./gemini";
import { createRouterForAdapter } from "./rotation";
import { resolveProvider, withSelection } from "./registry";
import {
  getLlmMode,
  reqHash,
  recordResponse,
  replayResponse,
  replayFallback,
  fallbackSize,
} from "./mock";

function wrap(call: (req: LLMRequest) => Promise<LLMResponse>) {
  return async (req: LLMRequest): Promise<LLMResponse> => {
    const mode = getLlmMode();
    if (mode === "live") {
      try {
        return await call(req);
      } catch (err) {
        // Live-error fallback (see mock.ts): if a bundled recording exists for
        // this exact request — the "See it in action" example — serve it rather
        // than fail, so a keyed user who's hit their quota still sees the demo.
        // Hash is computed only on the error path, so normal calls pay nothing.
        if (fallbackSize() > 0) {
          const recorded = replayFallback(reqHash(req.system, req.user, req.json));
          if (recorded !== undefined) {
            console.warn("[example-fallback] live call failed; serving recorded response", err);
            return { text: recorded };
          }
        }
        throw err;
      }
    }

    const hash = reqHash(req.system, req.user, req.json);

    if (mode === "mock") {
      const text = replayResponse(hash);
      if (text === undefined) {
        console.warn(`[mock] no recording for ${hash}; returning empty {}`);
        return { text: "{}" };
      }
      return { text };
    }

    // record
    const res = await call(req);
    recordResponse(hash, res.text);
    return res;
  };
}

/**
 * The active provider selection — a single app-global choice (one provider is
 * active at a time, exactly what the provider-chip reflects). The App sets it
 * from localStorage; `createRouter` consults it so the evaluator's call sites
 * (`createRouter(apiKey, paidKey)`) need no new parameters. Capability is *not*
 * read from here — it stays threaded explicitly via `EvalContext` (see
 * docs/projects/byok_capability_model.md). Defaults to Gemini, so every existing
 * call site and test behaves exactly as before until the App sets otherwise.
 */
let activeSelection: ProviderSelection = { providerId: "gemini" };

export function setActiveProviderSelection(selection: ProviderSelection): void {
  activeSelection = selection;
}

export function createRouter(apiKey: string, paidKey?: string): ModelRouter {
  if (activeSelection.providerId !== "gemini") {
    return createRouterForSelection(activeSelection, apiKey, paidKey);
  }
  const live = createGeminiRouter(apiKey, paidKey);
  return {
    fast: wrap(live.fast),
    strong: wrap(live.strong),
  };
}

/** How the App picks a provider + per-tier models (persisted in localStorage; the
 *  UI to set it lands in PR 3). Gemini uses its rotation pools; paid providers
 *  route the single chosen model per tier. */
export interface ProviderSelection {
  providerId: ProviderId;
  /** Override the routed model per tier; omit → the provider's catalog default. */
  fastModel?: string;
  strongModel?: string;
}

/**
 * Build a wrapped `ModelRouter` for a chosen provider. Gemini reuses the existing
 * `createRouter` path (rotation pools + free→paid fallback, and the mock/record
 * wrap around `createGeminiRouter` that the tests depend on). Paid providers are
 * driven through the generic engine with a single selected model per tier.
 *
 * For a paid-only provider the user's one key is the `paidKey`; `apiKey` (the
 * free key) is empty, so the free attempt exhausts instantly and the paid pool
 * carries the call.
 */
export function createRouterForSelection(
  selection: ProviderSelection,
  apiKey: string,
  paidKey?: string
): ModelRouter {
  if (selection.providerId === "gemini") {
    return createRouter(apiKey, paidKey);
  }
  const adapter = withSelection(resolveProvider(selection.providerId), selection);
  const live = createRouterForAdapter(adapter, apiKey, paidKey);
  return {
    fast: wrap(live.fast),
    strong: wrap(live.strong),
  };
}
