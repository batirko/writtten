/**
 * Live-model sanity check for the section-eval prompt (Tier 2, opt-in).
 *
 * NOT part of `npm test` — it is collected but `describe.skipIf`-skipped unless
 * LIVE_CHECK=1 is set. Run it through the wrapper, which sources your keys:
 *
 *   scripts/live-check.sh                    # every provider you have a key for
 *   scripts/live-check.sh --provider openai  # just one
 *
 * Keys are read from process.env (see scripts/live-check.sh for the sources).
 * This file NEVER logs a key or any part of one — only model output + derived
 * quality signals. Add keys to ~/.config/writtten/test-keys.env (chmod 600).
 *
 * What it checks, per armed provider:
 *   1. The provider round-trips and returns parseable JSON.
 *   2. OBS-032 guard — an unsupported_claim's `text` is an INSIGHT, not a
 *      verbatim restatement of the cited `substring`.
 *
 * It asserts (1) and (2); everything else is reported for eyeballing. Because
 * it hits real APIs it costs quota/spend — keep the sample small.
 */

import { describe, it, expect } from "vitest";
import type { ProviderId } from "./provider";
import { createRouterForSelection } from "./factory";
import { setLlmMode } from "./mock";
import { MERGED_SYSTEM_PROMPT, parseJSONResponse } from "../services/evaluatorPrompts";

const LIVE = !!process.env.LIVE_CHECK;
const only = process.env.LIVE_CHECK_PROVIDER; // optional: "openai" | "gemini" | "anthropic"

/**
 * Key resolution → the router's ({ apiKey, paidKey }) shape.
 * Env var names (in .env.test.local): OPENAI, ANTHROPIC, GEMINI_FREE, GEMINI_PAID.
 * Gemini is the only tiered provider: apiKey = free key, paidKey = paid key.
 * Paid-only providers pass their single key as paidKey (apiKey is "").
 * VITE_GEMINI_API_KEY (from .env.local) is an extra fallback for the free key.
 */
const env = (n: string) => process.env[n] || undefined;
function keysFor(id: ProviderId): { apiKey: string; paidKey?: string } | undefined {
  switch (id) {
    case "openai": {
      const k = env("OPENAI");
      return k ? { apiKey: "", paidKey: k } : undefined;
    }
    case "anthropic": {
      const k = env("ANTHROPIC");
      return k ? { apiKey: "", paidKey: k } : undefined;
    }
    case "gemini": {
      // .env.local already carries the app's VITE_GEMINI_*_KEY pair — use it as fallback.
      const free = env("GEMINI_FREE") || env("VITE_GEMINI_API_KEY");
      const paid = env("GEMINI_PAID") || env("VITE_GEMINI_PAID_KEY");
      return free || paid ? { apiKey: free ?? "", paidKey: paid } : undefined;
    }
  }
}

/** A small PRD-shaped section with (a) an uncited world-fact and (b) an attributed claim. */
const SECTION_USER =
  "Background\n\n" +
  "Our transaction decline rate has been climbing for three consecutive quarters. " +
  "The root cause, per the fraud team's analysis, is that legitimate users are being " +
  "blocked by overly aggressive rules with no way to dispute in real time. This " +
  "initiative gives users a path to unblock themselves without contacting support.\n";

interface Parsed {
  summary?: string;
  claims?: { text: string; kind: string }[];
  clarity_observations?: { text: string; substring: string }[];
  unsupported_claim_observations?: { text: string; substring: string }[];
  undefined_jargon_observations?: { text: string; substring: string }[];
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

const providers: ProviderId[] = ["openai", "gemini", "anthropic"];

describe.skipIf(!LIVE)("livecheck — section-eval on the real model", () => {
  for (const id of providers) {
    const keys = keysFor(id);
    const active = !!keys && (!only || only === id);

    it.skipIf(!active)(`${id}: returns JSON and unsupported_claim text is an insight`, async () => {
      setLlmMode("live");
      const router = createRouterForSelection({ providerId: id }, keys!.apiKey, keys!.paidKey);

      const t0 = Date.now();
      const res = await router.fast({ system: MERGED_SYSTEM_PROMPT, user: SECTION_USER, json: true });
      const ms = Date.now() - t0;

      // Use the evaluator's own parser — it tolerates ```json fences and
      // brace-slices — so the harness mirrors production parsing (Anthropic
      // wraps its JSON in a markdown fence; the real pipeline handles that).
      let parsed: Parsed;
      try {
        parsed = parseJSONResponse(res.text) as Parsed;
      } catch {
        throw new Error(`[${id}] unparseable response (len ${res.text.length}): ${res.text.slice(0, 200)}`);
      }

      const unsupported = parsed.unsupported_claim_observations ?? [];
      const restatements = unsupported.filter((o) => norm(o.text) === norm(o.substring));

      console.log(
        `\n[${id}] ${ms}ms · summary="${parsed.summary ?? ""}"\n` +
          `  claims: ${(parsed.claims ?? []).length} · clarity: ${(parsed.clarity_observations ?? []).length} · ` +
          `unsupported: ${unsupported.length} · jargon: ${(parsed.undefined_jargon_observations ?? []).length}\n` +
          unsupported
            .map((o) => `  · UNSUPPORTED text="${o.text}"\n            span="${o.substring}"\n            restatement=${norm(o.text) === norm(o.substring)}`)
            .join("\n")
      );

      // (1) parseable JSON with the five keys present enough to be usable.
      expect(Array.isArray(parsed.claims ?? [])).toBe(true);
      // (2) OBS-032: no unsupported_claim may restate its cited span.
      expect(
        restatements.map((o) => o.text),
        `[${id}] unsupported_claim text restated the cited span verbatim (OBS-032 regression)`
      ).toEqual([]);
    }, 30_000);
  }
});
