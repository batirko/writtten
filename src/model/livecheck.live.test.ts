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
import { MERGED_SYSTEM_PROMPT } from "../services/evaluatorPrompts";

const LIVE = !!process.env.LIVE_CHECK;
const only = process.env.LIVE_CHECK_PROVIDER; // optional: "openai" | "gemini" | "anthropic"

/** Key resolution — plain names, with the repo's existing VITE_ gemini var as a fallback. */
function keyFor(id: ProviderId): string | undefined {
  switch (id) {
    case "openai":
      return process.env.OPENAI_API_KEY || undefined;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY || undefined;
    case "gemini":
      return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || undefined;
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
    const key = keyFor(id);
    const active = !!key && (!only || only === id);

    it.skipIf(!active)(`${id}: returns JSON and unsupported_claim text is an insight`, async () => {
      setLlmMode("live");
      // Paid providers take the single user key as paidKey; gemini as the free key.
      const [apiKey, paidKey] = id === "gemini" ? [key!, undefined] : ["", key!];
      const router = createRouterForSelection({ providerId: id }, apiKey, paidKey);

      const t0 = Date.now();
      const res = await router.fast({ system: MERGED_SYSTEM_PROMPT, user: SECTION_USER, json: true });
      const ms = Date.now() - t0;

      let parsed: Parsed;
      try {
        parsed = JSON.parse(res.text);
      } catch {
        throw new Error(`[${id}] non-JSON response (len ${res.text.length}): ${res.text.slice(0, 200)}`);
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
