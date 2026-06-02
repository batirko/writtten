/**
 * Mode-aware router factory. Returns a ModelRouter that, depending on the
 * current LLM mode (see ./mock), either calls Gemini, records its responses,
 * or replays canned ones. The evaluator builds its router through here instead
 * of calling createGeminiRouter directly, so tests can go deterministic/offline
 * without touching the evaluation logic.
 */

import type { LLMRequest, LLMResponse, ModelRouter } from "./router";
import { createGeminiRouter } from "./gemini";
import { getLlmMode, reqHash, recordResponse, replayResponse } from "./mock";

function wrap(call: (req: LLMRequest) => Promise<LLMResponse>) {
  return async (req: LLMRequest): Promise<LLMResponse> => {
    const mode = getLlmMode();
    if (mode === "live") return call(req);

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

export function createRouter(apiKey: string): ModelRouter {
  const live = createGeminiRouter(apiKey);
  return {
    fast: wrap(live.fast),
    strong: wrap(live.strong),
  };
}
