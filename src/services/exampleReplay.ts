/**
 * Replay for the "See it in action" example.
 *
 * The contradiction check is LLM-only, so the example's hero needs the model to
 * run. Two failure modes would leave a first-run user staring at silence:
 *
 *   1. No API key — the evaluator skips every check outright.
 *   2. A key is present but the live call fails (free-tier quota 429, network,
 *      model down).
 *
 * We install a bundled recording of the example's real responses to cover both:
 *
 *   - Keyless → route the whole router to `mock` mode (the evaluator already
 *     exempts `mock` from the no-key skip): the demo replays with zero network.
 *   - Keyed → stay live, but arm the recording as a *fallback* the router serves
 *     only if a live call throws. So the demo runs for real when it can, and
 *     still lands the hero when the quota's gone.
 *
 * This is a demo affordance over pre-written text and captured real responses —
 * it does not author or rewrite the user's document (Hard Invariant #1).
 *
 * Note: the recording is captured at *weak* capability, so the live-error
 * fallback matches a weak-tier key (the free-tier user who actually hits the
 * daily limit). A strong-tier (paid) key builds different prompts → different
 * hashes → the fallback won't match, but a paid key rarely exhausts quota; it
 * degrades to the same live-only behaviour as before.
 */

import { EXAMPLE_DOC_RECORDING } from "./exampleDocRecording";
import type { ModelCapability } from "../model/capability";
import {
  setLlmMode,
  getLlmMode,
  loadRecordings,
  clearRecordings,
  loadFallbackRecordings,
  clearFallbackRecordings,
} from "../model/mock";

let replayActive = false;

/** True while the example replay (mock and/or fallback) is installed. */
export function isExampleReplayActive(): boolean {
  return replayActive;
}

/**
 * The capability the demo runs under: the ambient tier, but with the weak-tier
 * contradiction gate held open.
 *
 * The gate exists because a weak model asserts conflicts that aren't real (V1
 * measured 0/2 wild precision on real documents — `docs/projects/field_validation.md`).
 * The demo doesn't adjudicate: it replays a hand-curated recording of verified
 * responses, so that reason doesn't apply. Gating it would leave the landing page
 * unable to demonstrate the product's central capability — misleading in the
 * opposite direction. The expectation gap this leaves ("why don't I get these on
 * my own draft?") is closed by the key-entry copy, not by silencing the demo.
 *
 * Exported so `App.tsx` and the demo's drift guard share one definition — if the
 * two drifted, the guard would be asserting a demo that production doesn't run.
 */
export function exampleReplayCapability(base: ModelCapability): ModelCapability {
  return { ...base, emitContradictions: true };
}

/**
 * Arm the example replay. Always installs the live-error fallback; keyless also
 * routes the whole router to `mock` so the demo needs no network at all.
 */
export function activateExampleReplay(opts: { keyless: boolean }): void {
  loadFallbackRecordings(EXAMPLE_DOC_RECORDING);
  if (opts.keyless) {
    loadRecordings(EXAMPLE_DOC_RECORDING);
    setLlmMode("mock");
  }
  replayActive = true;
}

/**
 * A key became available mid-demo (e.g. the user pasted a BYO key). If we were
 * in keyless full-`mock` replay, tear it down so their own edits evaluate live —
 * the fallback safety net can stay for the still-loaded example.
 */
export function onKeyBecameAvailable(): void {
  if (replayActive && getLlmMode() === "mock") deactivateExampleReplay();
}

/**
 * Tear down the replay and return the router to live. Idempotent, and only acts
 * on a replay we installed — it won't clobber a `mock`/`record` mode set for a
 * different reason (e.g. the dev harness).
 */
export function deactivateExampleReplay(): void {
  if (!replayActive) return;
  replayActive = false;
  clearRecordings();
  clearFallbackRecordings();
  if (getLlmMode() === "mock") setLlmMode("live");
}
