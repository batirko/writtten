/**
 * Keyless replay for the "See it in action" example.
 *
 * The contradiction check is LLM-only and the evaluator skips it when there's no
 * API key — so a keyless first-run user who loads the example would see nothing,
 * defeating the whole point of the demo. To keep the hero witnessable without a
 * key, we install a bundled recording of the example's real responses and route
 * the model router to replay them (the existing `mock` mode, which the evaluator
 * already exempts from the no-key skip).
 *
 * This is a demo affordance over pre-written text and captured real responses —
 * it does not author or rewrite the user's document (Hard Invariant #1). With a
 * key present the live pipeline runs instead; replay is never installed.
 */

import { EXAMPLE_DOC_RECORDING } from "./exampleDocRecording";
import { setLlmMode, getLlmMode, loadRecordings, clearRecordings } from "../model/mock";

let replayActive = false;

/** True while the keyless example replay is installed. */
export function isExampleReplayActive(): boolean {
  return replayActive;
}

/** Install the bundled example recordings and route the router to replay them. */
export function activateExampleReplay(): void {
  loadRecordings(EXAMPLE_DOC_RECORDING);
  setLlmMode("mock");
  replayActive = true;
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
  if (getLlmMode() === "mock") setLlmMode("live");
}
