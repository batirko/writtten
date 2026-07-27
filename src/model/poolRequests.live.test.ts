/**
 * Request-acceptance check (opt-in, key-gated) — every model we route to or offer
 * in the picker must ACCEPT the request our adapter actually builds.
 *
 * WHY THIS EXISTS, separate from poolLiveness.live.test.ts: that check asks "does
 * this model still exist?" and only treats a 404 / "no longer available" as a
 * failure. A model that exists but rejects our request shape returns 400, which
 * sails straight through it. That is precisely how three separate bugs shipped
 * undetected (found 2026-07-27, all by probing the live APIs):
 *
 *   • Gemini floored `thinkingBudget` to 0 for anything that wasn't 2.5-pro, but
 *     the entire 3.5+ generation only runs in thinking mode → 400 on first call.
 *   • Anthropic only disabled thinking when the id contained "sonnet", so Opus 5
 *     silently ran (billable) adaptive thinking that also ate its max_tokens.
 *   • OpenAI sent `reasoning_effort: "none"` to every model, which o3 / o4-mini /
 *     *-chat-latest reject outright.
 *
 * Each was invisible to unit tests (the request shape was "correct", just not
 * accepted) and invisible to liveness (the models were alive). Only a real 200
 * proves it. So: build the request through the adapter, fire it, require a 200
 * and non-empty parsed text — and allow exactly the one renegotiation retry the
 * router itself would perform, since discovering a knob is legitimate behaviour.
 *
 * A 429 counts as PASS: rate-limited is alive and accepted (our free-tier keys
 * routinely 429), and this check is about request shape, not quota.
 *
 * NOT part of `npm test` — `describe.skipIf`-skipped unless LIVE_CHECK=1:
 *
 *   scripts/live-check.sh                     # all providers with a key
 *   scripts/live-check.sh --provider openai   # just one
 *
 * This file never logs a key.
 */

import { describe, it, expect } from "vitest";
import { PROVIDERS, PROVIDER_IDS } from "./registry";
import type { ProviderId } from "./provider";
import type { LLMRequest } from "./router";

const LIVE = !!process.env.LIVE_CHECK;
const only = process.env.LIVE_CHECK_PROVIDER;

const env = (n: string) => process.env[n] || undefined;

/** The key to probe each provider with — the paid key where there is a tier
 *  split, so a paid-only model (gemini-2.5-pro) isn't judged on its 0-RPD free
 *  quota. Same env var names as livecheck.live.test.ts. */
function keyFor(id: ProviderId): string | undefined {
  if (id === "openai") return env("OPENAI");
  if (id === "anthropic") return env("ANTHROPIC");
  return env("GEMINI_PAID") || env("VITE_GEMINI_PAID_KEY") || env("GEMINI_FREE");
}

/** Everything a user can reach: the routing pools plus the picker's catalog. */
function reachableModels(id: ProviderId): string[] {
  const a = PROVIDERS[id];
  const { freeFast, freeStrong, paidFast, paidStrong } = a.pools;
  return [
    ...new Set([...freeFast, ...freeStrong, ...paidFast, ...paidStrong, ...a.catalog.fast, ...a.catalog.strong]),
  ];
}

const REQ: LLMRequest = {
  system: "You are a terse JSON API. Reply with JSON only, no prose, no code fences.",
  user: 'Return exactly {"ok":true}',
  json: true,
};

describe.skipIf(!LIVE)("pooled + offered models accept the request we build", () => {
  for (const id of PROVIDER_IDS) {
    const key = keyFor(id);
    const active = !!key && (!only || only === id);

    for (const model of reachableModels(id)) {
      it.skipIf(!active)(`${id}/${model} answers 200`, async () => {
        const adapter = PROVIDERS[id];

        const fire = async () => {
          const { url, init } = adapter.buildRequest(model, REQ, key!);
          const res = await fetch(url, init);
          return { res, body: await res.text() };
        };

        let { res, body } = await fire();

        // Rate-limited is alive and accepted — shape is what's under test.
        if (res.status === 429) return;

        // Mirror the router: one renegotiation retry when the adapter says the
        // provider rejected a knob and it has stepped the model down a rung.
        if (!res.ok) {
          const c = adapter.classifyError(res.status, res.headers, body, model);
          if (c.renegotiate) ({ res, body } = await fire());
          if (res.status === 429) return;
        }

        expect(res.status, `${model} rejected our request: ${body.slice(0, 300)}`).toBe(200);
        const { text } = adapter.parseResponse(JSON.parse(body));
        expect(text.trim(), `${model} returned no text`).not.toBe("");
      }, 60_000);
    }
  }
});
