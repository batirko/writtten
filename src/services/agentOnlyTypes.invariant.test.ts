/** @vitest-environment node */
/**
 * The anti-taxonomy claim, pinned as a fact about the code.
 *
 * writtten's positioning rests on "we never volunteer style critique". Since
 * `user_lens` landed, the taxonomy DOES contain a type that can carry style —
 * and the only thing keeping the claim true is that writtten's own evaluator
 * cannot produce one. A user asked for it, or it does not exist.
 *
 * That is currently an emergent property of several unrelated facts: the type
 * appears in no evaluator prompt, on no built-in eval path, and is admitted only
 * by the external boundary. Emergent properties rot silently — someone adds a
 * lens-shaped built-in check, every existing test stays green, and a marketing
 * claim quietly becomes false. So it is asserted here directly.
 *
 * See docs/projects/user_directed_review.md § Perception risk (risk 3), which
 * calls this the strongest available mitigation precisely because it is
 * structural rather than a matter of intent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AGENT_ONLY_TYPES } from "./externalObservations";
import { KIND_BY_TYPE } from "./priority";

/**
 * Every module on the built-in evaluation path — the code that turns a model
 * response into observations writtten produced on its own initiative.
 *
 * Read as source text rather than exercised, because the assertion is about
 * ABSENCE: no input exists that would make these modules emit an agent-only
 * type, and only reading the source can show that. Same technique the skill and
 * example-replay sync tests already use in this repo.
 */
const BUILT_IN_EVAL_PATH = [
  "src/services/evaluator.ts",
  "src/services/evaluatorPrompts.ts",
  "src/services/evaluatorReconcile.ts",
];

describe("agent-only types never enter the built-in eval path", () => {
  it("names at least one type, or this whole file is vacuously green", () => {
    // A guard on the guard: if AGENT_ONLY_TYPES were ever emptied, every
    // assertion below would pass while testing nothing at all.
    expect(AGENT_ONLY_TYPES.size).toBeGreaterThan(0);
    expect(AGENT_ONLY_TYPES.has("user_lens")).toBe(true);
  });

  for (const file of BUILT_IN_EVAL_PATH) {
    it(`${file} never mentions an agent-only type`, () => {
      const source = readFileSync(file, "utf8");
      for (const type of AGENT_ONLY_TYPES) {
        // Also catches the type appearing in prompt text, which would be worse
        // than a code path: it would teach our own model that the type exists.
        expect(source, `${file} must not reference "${type}"`).not.toContain(type);
      }
    });
  }

  it("keeps the lens label out of the logs that survive into production", () => {
    // The label is the USER'S OWN WORDS — user text, in the same class as their
    // prose. The agent-event log is the one log family that ships in production
    // builds (a BYOA user with a problem has nothing else to send), and it
    // deliberately carries types, codes and counts but never content.
    //
    // Today this holds because no `lens` field exists on those record types, so
    // TypeScript's excess-property checking rejects one at the call site. The
    // scan catches the case where someone ADDS the field — at which point the
    // type stops objecting and the leak becomes silent.
    for (const file of ["src/model/logger.ts", "src/model/debugLog.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not carry a lens label`).not.toMatch(/\blens\b/);
    }
  });

  it("keeps agent-only types in the shared per-type tables", () => {
    // The inverse mistake. These tables are exhaustive over the type union and
    // are read when RENDERING any observation, whatever produced it — so an
    // agent-only type must still have entries. Absence here would be a crash,
    // not a safeguard.
    for (const type of AGENT_ONLY_TYPES) {
      expect(KIND_BY_TYPE[type]).toBeDefined();
    }
  });
});
