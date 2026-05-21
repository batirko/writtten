import type { LLMRequest, LLMResponse, ModelRouter } from "./router";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const FLASH_MODEL = "gemini-3.5-flash";

async function callGemini(model: string, req: LLMRequest, apiKey: string): Promise<LLMResponse> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  const generationConfig: {
    temperature: number;
    responseMimeType?: string;
  } = {
    temperature: 0.2,
  };

  if (req.json) {
    generationConfig.responseMimeType = "application/json";
  }

  const body = {
    system_instruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig,
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
    strong: (req) => callGemini(FLASH_MODEL, req, apiKey),
  };
}
