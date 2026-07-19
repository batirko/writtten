/** @vitest-environment node */
/**
 * The skill's worked examples, validated against the real lint — not by eye.
 *
 * docs/skills/writtten-agent.md teaches a connected agent how to phrase an observation.
 * `lintRegister` is a **hard reject** at the external-observation boundary, so any
 * example that fails it teaches a phrasing the boundary will refuse — the skill would be
 * actively training agents to get rejected.
 *
 * The lexicons are actively growing (#213 added the imperative family; #215 reopened G3
 * to replace the denylist wholesale), so eyeballing the examples is guaranteed to rot.
 * This runs them through the same function the boundary calls, in both directions:
 *   ✅ examples MUST lint clean · ❌ examples MUST fail (demonstrating a violation is
 *   their entire job — a ❌ that passes means the lint no longer catches what the skill
 *   claims it catches).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lintRegister } from "./registerLint";
import type { Observation } from "../store/db";

const skill = readFileSync(
  fileURLToPath(new URL("../../docs/skills/writtten-agent.md", import.meta.url)),
  "utf8"
);

/**
 * Rows of the do/don't table: `| ✅ | "…" |` / `| ❌ | "…" *(why)*|`.
 *
 * The ❌ rows fail for two different reasons, and only one of them is the register
 * lint's job — so the `why` parenthetical is parsed rather than assuming a blanket
 * "every ❌ must fail lintRegister" (it must not; see the surface-nit case below).
 */
function extractVerdictExamples(): Array<{ ok: boolean; text: string; why: string }> {
  return [...skill.matchAll(/^\|\s*(✅|❌)\s*\|\s*"([^"]+)"([^|]*)\|/gm)].map((m) => ({
    ok: m[1] === "✅",
    text: m[2],
    why: m[3],
  }));
}

/** A ❌ the register lint is responsible for catching (prescription / leading question),
 *  as opposed to one the taxonomy gate catches (a surface nit). */
function isRegisterViolation(why: string): boolean {
  return /prescribes|leading question/.test(why);
}

/** Rows of the taxonomy table: `| \`type\` | what it flags | "example" |`. */
function extractTaxonomyExamples(): Array<{ type: string; text: string }> {
  return [...skill.matchAll(/^\|\s*`([a-z_]+)`\s*\|[^|]*\|\s*"(.+?)"\s*\|/gm)].map((m) => ({
    type: m[1],
    text: m[2],
  }));
}

describe("skill examples ↔ registerLint", () => {
  const verdicts = extractVerdictExamples();
  const taxonomy = extractTaxonomyExamples();

  it("finds the examples it claims to check", () => {
    // Guards the extraction itself: a markdown reformat that breaks these regexes would
    // otherwise turn this whole file into a silent no-op.
    expect(verdicts.filter((v) => v.ok).length).toBeGreaterThanOrEqual(2);
    expect(verdicts.filter((v) => !v.ok).length).toBeGreaterThanOrEqual(3);
    expect(taxonomy.length).toBe(9);
  });

  it.each(extractVerdictExamples().filter((v) => v.ok))(
    "✅ example lints clean: %s",
    ({ text }) => {
      expect(lintRegister(text)).toEqual([]);
    }
  );

  it.each(extractVerdictExamples().filter((v) => !v.ok && isRegisterViolation(v.why)))(
    "❌ register example is actually caught by the lint: %s",
    ({ text }) => {
      // If this fails, the skill is teaching that a phrasing is forbidden while the
      // boundary would happily accept it.
      expect(lintRegister(text).length).toBeGreaterThan(0);
    }
  );

  it.each(extractVerdictExamples().filter((v) => !v.ok && !isRegisterViolation(v.why)))(
    "❌ anti-taxonomy example is NOT the lint's job: %s",
    ({ text }) => {
      // Deliberately asserts the opposite. A grammar/style nit phrased declaratively is
      // legitimately register-clean — the anti-taxonomy is enforced by the fixed type
      // enum (no `type` admits a surface nit), not by lintRegister. Pinning this stops a
      // future reader from "fixing" the lint to cover prose style, which would start
      // rejecting legitimate observations that merely mention wording.
      expect(lintRegister(text)).toEqual([]);
    }
  );

  it.each(extractTaxonomyExamples())(
    "taxonomy example for $type lints clean",
    ({ type, text }) => {
      // Pass the type through: `claim-index` and `section-number` only fire for
      // contradiction / strategic_tension / doc-level types, so linting these
      // type-blind would miss exactly the violations the doc-level examples can commit.
      expect(lintRegister(text, { type: type as Observation["type"] })).toEqual([]);
    }
  );

  it("every taxonomy example is within the hard 240-char cap", () => {
    for (const { type, text } of taxonomy) {
      expect(text.length, `${type} example is ${text.length} chars`).toBeLessThanOrEqual(240);
    }
  });
});
