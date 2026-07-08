import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { openaiAdapter } from "./openai";
import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import { fetchModelCatalog, cachedCatalog, presetCatalog, _clearModelCatalogCache } from "./modelList";

describe("adapter.parseModelsList", () => {
  it("OpenAI: keeps chat models, drops embeddings/audio/image/legacy", () => {
    const body = {
      object: "list",
      data: [
        { id: "gpt-5.5", object: "model" },
        { id: "gpt-5.4-mini", object: "model" },
        { id: "text-embedding-3-large", object: "model" },
        { id: "dall-e-3", object: "model" },
        { id: "whisper-1", object: "model" },
        { id: "tts-1", object: "model" },
        { id: "omni-moderation-latest", object: "model" },
        { id: "davinci-002", object: "model" },
        { id: "sora-2", object: "model" }, // video, not chat
        { id: "sora-2-pro", object: "model" },
        { id: "gpt-3.5-turbo-instruct", object: "model" }, // completions, not chat
      ],
    };
    expect(openaiAdapter.parseModelsList!(body).sort()).toEqual(["gpt-5.4-mini", "gpt-5.5"]);
  });

  it("Anthropic: extracts every model id (all are chat)", () => {
    const body = {
      data: [
        { type: "model", id: "claude-opus-4-6", display_name: "Claude Opus 4.6" },
        { type: "model", id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" },
      ],
      has_more: false,
    };
    expect(anthropicAdapter.parseModelsList!(body)).toEqual(["claude-opus-4-6", "claude-haiku-4-5"]);
  });

  it("Gemini: keeps generateContent models, strips models/ prefix, drops embed/tts", () => {
    const body = {
      models: [
        { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-3.1-flash-lite", supportedGenerationMethods: ["generateContent", "countTokens"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        { name: "models/aqa", supportedGenerationMethods: ["generateAnswer"] },
      ],
    };
    expect(geminiAdapter.parseModelsList!(body)).toEqual(["gemini-2.5-pro", "gemini-3.1-flash-lite"]);
  });

  it("all parsers return [] on a garbled/unexpected shape (→ preset fallback)", () => {
    for (const a of [openaiAdapter, anthropicAdapter, geminiAdapter]) {
      expect(a.parseModelsList!({})).toEqual([]);
      expect(a.parseModelsList!({ data: "nope" })).toEqual([]);
      expect(a.parseModelsList!(null)).toEqual([]);
    }
  });
});

describe("fetchModelCatalog", () => {
  beforeEach(() => {
    _clearModelCatalogCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the preset catalog when keyless (never fetches)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const cat = await fetchModelCatalog("openai", "");
    expect(cat).toEqual(presetCatalog("openai"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("splits a live list into fast/strong tiers and caches it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "gpt-5.5" }, { id: "gpt-5.4-mini" }, { id: "gpt-5.6" }],
        }),
      })
    );
    const cat = await fetchModelCatalog("openai", "sk-testkey");
    expect(cat.fast).toEqual(["gpt-5.4-mini"]);
    expect(cat.strong).toEqual(["gpt-5.5", "gpt-5.6"]);
    // cached synchronously now
    expect(cachedCatalog("openai", "sk-testkey")).toEqual(cat);
  });

  it("falls back to preset on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const cat = await fetchModelCatalog("anthropic", "sk-ant-x");
    expect(cat).toEqual(presetCatalog("anthropic"));
  });

  it("falls back to preset when fetch throws (network/CORS)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const cat = await fetchModelCatalog("openai", "sk-x");
    expect(cat).toEqual(presetCatalog("openai"));
  });

  it("falls back to preset on an empty live list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    const cat = await fetchModelCatalog("openai", "sk-empty");
    expect(cat).toEqual(presetCatalog("openai"));
  });

  it("backfills an empty tier from the preset so both dropdowns have options", async () => {
    // A response with only fast-classed models → strong tier backfilled from preset.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: "gpt-5.4-mini" }] }) })
    );
    const cat = await fetchModelCatalog("openai", "sk-onlyfast");
    expect(cat.fast).toEqual(["gpt-5.4-mini"]);
    expect(cat.strong).toEqual(presetCatalog("openai").strong);
  });
});
