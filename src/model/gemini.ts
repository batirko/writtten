import type { LLMRequest, LLMResponse, ModelRouter } from "./router";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const FLASH_MODEL = "gemini-2.0-flash";

async function callGemini(model: string, req: LLMRequest, apiKey: string): Promise<LLMResponse> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: { temperature: 0.2 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { text };
}

export function createGeminiRouter(apiKey: string): ModelRouter {
  return {
    fast: (req) => callGemini(FLASH_MODEL, req, apiKey),
    // Phase 0: both tiers use Flash; promote strong to Pro when needed.
    strong: (req) => callGemini(FLASH_MODEL, req, apiKey),
  };
}
