/**
 * Tone scorer — Tier 2, opt-in live LLM judge (the "felt-tone" half).
 *
 * The deterministic registerLint.classifyTone is the CI drift guard; this is the
 * subtler judgment a rule can't make ("does this read like a colleague?"). It
 * sends each labeled toneCorpus message to the model with TONE_SCORER_PROMPT and
 * checks the model agrees with the human label.
 *
 * Skipped by default (no network, no quota in CI).
 * Activate with: EVAL_LIVE=1 npx vitest run src/services/toneScorer.live.test.ts
 * Requires: VITE_GEMINI_API_KEY in .env.local
 *
 * This asserts a soft agreement floor (not per-item exactness): an LLM judge is
 * itself fuzzy on adjacent tones (pedant vs. condescending), so we require it to
 * (a) never call a `wrong` message "colleague" and (b) always call a `right`
 * message "colleague" — the load-bearing colleague/not-colleague boundary — and
 * merely *report* the finer-grained label agreement.
 *
 * Design: docs/projects/emotional_register.md § Tone as an eval dimension.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createGeminiRouter } from "../model/gemini";
import { TONE_SCORER_PROMPT, parseJSONResponse } from "./evaluatorPrompts";
import { toneCorpus, type ToneLabel } from "./eval-fixtures/tone-corpus";

const LIVE = !!process.env.EVAL_LIVE;

async function judge(
  router: ReturnType<typeof createGeminiRouter>,
  message: string
): Promise<ToneLabel> {
  const res = await router.fast({
    system: TONE_SCORER_PROMPT,
    user: `Message to grade:\n"""${message}"""`,
    json: true,
    meta: { evalId: "tone-scorer", promptRef: "tone-scorer" },
  });
  const parsed = parseJSONResponse(res.text) as { tone?: string };
  return (parsed.tone ?? "colleague") as ToneLabel;
}

describe.skipIf(!LIVE)("Tone scorer — Tier 2 (live LLM judge)", () => {
  let router: ReturnType<typeof createGeminiRouter>;

  beforeAll(() => {
    const apiKey = process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("VITE_GEMINI_API_KEY not set");
    router = createGeminiRouter(apiKey);
  });

  for (const pair of toneCorpus) {
    it(`live: "${pair.id}" wrong is judged not-colleague`, async () => {
      const tone = await judge(router, pair.wrong);
      if (tone !== pair.wrongTone) {
        console.warn(
          `[tone-judge] "${pair.id}" wrong: judge said "${tone}", human label "${pair.wrongTone}" (adjacent-tone drift, reported not asserted)`
        );
      }
      expect(tone, `judge called a wrong-persona message "colleague": ${pair.wrong}`).not.toBe(
        "colleague"
      );
    }, 45_000);

    // The linter `right` column is a "(anti-taxonomy — never fires)" placeholder.
    if (!pair.right.startsWith("(")) {
      it(`live: "${pair.id}" right is judged colleague`, async () => {
        const tone = await judge(router, pair.right);
        expect(tone, `judge failed to call a colleague message "colleague": ${pair.right}`).toBe(
          "colleague"
        );
      }, 45_000);
    }
  }
});
