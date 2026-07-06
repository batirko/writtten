/**
 * Mode-aware router factory. Returns a ModelRouter that, depending on the
 * current LLM mode (see ./mock), either calls Gemini, records its responses,
 * or replays canned ones. The evaluator builds its router through here instead
 * of calling createGeminiRouter directly, so tests can go deterministic/offline
 * without touching the evaluation logic.
 */

import type { LLMRequest, LLMResponse, ModelRouter } from "./router";
import { createGeminiRouter } from "./gemini";
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

export function createRouter(apiKey: string, paidKey?: string): ModelRouter {
  const live = createGeminiRouter(apiKey, paidKey);
  return {
    fast: wrap(live.fast),
    strong: wrap(live.strong),
  };
}
