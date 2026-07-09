/**
 * Pool-liveness early-warning (opt-in, key-gated) — flags a pinned Gemini model
 * that has become CONSISTENTLY unreachable, so a real retirement surfaces before
 * users feel it.
 *
 * WHY & CAVEAT: Gemini `generateContent` can return a 404 "no longer available"
 * for a model that is NOT retired — an intermittent, misleadingly-worded backend
 * error (observed 2026-07-09: gemini-2.5-pro 404'd, then served 200 an hour
 * later; announced retirement is 2026-10-16). The rotation engine already
 * recovers from such a blip by trying the next model. So this check is a coarse
 * EARLY-WARNING, not ground truth: it probes each pooled model several times and
 * flags it only if it 404s on EVERY attempt (unanimity separates a real
 * retirement from a flap). Treat a failure as "go verify against Google's
 * status/retirement schedule", not proof. A 429 is alive — never a failure.
 *
 * NOT part of `npm test` — `describe.skipIf`-skipped unless LIVE_CHECK=1. Runs
 * through the wrapper (which sources keys without printing them):
 *
 *   scripts/live-check.sh                    # includes this check
 *   scripts/live-check.sh --provider gemini  # just gemini
 *
 * This file never logs a key. Run it on a cadence (weekly / pre-release). The
 * detection LOGIC is unit-tested deterministically in liveness.test.ts.
 */

import { describe, it, expect } from "vitest";
import { geminiAdapter } from "./gemini";
import { isDeprecationSignal, isConsistentlyUnreachable, pooledGeminiModels } from "./liveness";

const LIVE = !!process.env.LIVE_CHECK;
const only = process.env.LIVE_CHECK_PROVIDER; // optional narrowing; we only care if it's gemini
const geminiSelected = !only || only === "gemini";

// Same key resolution as livecheck.live.test.ts. Prefer the paid key: it gets a
// clean 200 for every live model (the free key 429s the paid-only pro model,
// which is alive-but-throttled — still not a deprecation signal, so it'd pass).
const geminiKey =
  process.env.GEMINI_PAID ||
  process.env.VITE_GEMINI_PAID_KEY ||
  process.env.GEMINI_FREE ||
  process.env.VITE_GEMINI_API_KEY ||
  undefined;

const active = LIVE && geminiSelected && !!geminiKey;

// Probe each model this many times. A retiring model 404s on all of them; a
// transient blip won't (the model answers at least once), so it isn't flagged.
const PROBES_PER_MODEL = 3;

/** Probe one model's generateContent N times sequentially (natural spacing so a
 *  sub-second flap doesn't hit every attempt), then judge consistency. */
async function probe(model: string, key: string): Promise<{ model: string; statuses: number[]; unreachable: boolean }> {
  const results: { status: number; body: string }[] = [];
  for (let i = 0; i < PROBES_PER_MODEL; i++) {
    const { url, init } = geminiAdapter.buildRequest(model, { system: "", user: "ping", json: false }, key);
    const res = await fetch(url, init);
    const body = res.ok ? "" : (await res.text().catch(() => "")).toLowerCase();
    results.push({ status: res.status, body });
  }
  return {
    model,
    statuses: results.map((r) => r.status),
    unreachable: isConsistentlyUnreachable(results),
  };
}

describe.skipIf(!active)("pool-liveness — no pinned Gemini model is consistently unreachable", () => {
  it(`no pooled model 404s on all ${PROBES_PER_MODEL} probes (transient blips are ignored)`, async () => {
    const models = pooledGeminiModels();
    const results = await Promise.all(models.map((m) => probe(m, geminiKey!)));

    for (const r of results) {
      const flappy = !r.unreachable && r.statuses.some((s) => isDeprecationSignal(s, ""));
      const mark = r.unreachable ? "✗ UNREACHABLE" : flappy ? "~ flapped (recovered)" : "✓ live";
      console.log(`  ${mark}  ${r.model} → [${r.statuses.join(" ")}]`);
    }

    const unreachable = results.filter((r) => r.unreachable).map((r) => r.model);
    expect(
      unreachable,
      `Gemini model(s) 404'd on every probe: ${unreachable.join(", ")}. Verify against Google's ` +
        `status page / retirement schedule — if genuinely retired, repin src/model/gemini.ts pools.`
    ).toEqual([]);
  }, 30_000);
});
