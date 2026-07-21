/** @vitest-environment node */
/**
 * The skill's worked examples, validated against the real lint — not by eye.
 *
 * `docs/skills/writtten-agent.md` teaches a connected agent how to phrase an observation.
 * `lintRegister` is a **hard reject** at the external-observation boundary, so any example
 * that fails it teaches a phrasing the boundary will refuse — the skill would be
 * actively training agents to get rejected.
 *
 * The lexicons are actively growing (#213 added the imperative family; #215 reopened G3 to
 * replace the denylist wholesale), so eyeballing the examples is guaranteed to rot. This
 * runs them through the same function the boundary calls, in both directions:
 *   ✅ examples MUST lint clean · ❌ examples MUST fail (demonstrating a violation is
 *   their entire job — a ❌ that passes means the lint no longer catches what the skill
 *   claims it catches).
 *
 * **Extraction is anchored to its section.** It used to match any table row shaped
 * `` | `token` | … | "text" | `` anywhere in the file, which meant an unrelated table
 * added elsewhere silently inflated the taxonomy count (reading as extraction drift) and
 * fed prose that was never an observation through `lintRegister` under an unsound cast.
 * Now each extractor is scoped to the `##` section that owns it, so prose tables elsewhere
 * in the skill are free to exist.
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

/** The body of one `## `-level section, exclusive of the next one. */
function section(heading: string): string {
  const marker = `## ${heading}\n`;
  const start = skill.indexOf(marker);
  if (start === -1) throw new Error(`the skill has no "## ${heading}" section`);
  const rest = skill.slice(start + marker.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Rows of a do/don't table: `| ✅ | "…" |` / `| ❌ | "…" *(why)*|`.
 *
 * The ❌ rows fail for two different reasons, and only one of them is the register lint's
 * job — so the `why` parenthetical is parsed rather than assuming a blanket "every ❌ must
 * fail lintRegister" (it must not; see the surface-nit and lens-verdict cases below).
 */
function extractVerdictExamples(
  heading: string
): Array<{ ok: boolean; text: string; why: string }> {
  return [...section(heading).matchAll(/^\|\s*(✅|❌)\s*\|\s*"([^"]+)"([^|]*)\|/gm)].map((m) => ({
    ok: m[1] === "✅",
    text: m[2],
    why: m[3],
  }));
}

/** Every section that teaches with ✅/❌ rows. */
const VERDICT_SECTIONS = [
  "You are a critic, not a co-author",
  "When the author steers the pass",
  "Lenses (`user_lens`)",
];

function allVerdictExamples(): Array<{ ok: boolean; text: string; why: string }> {
  return VERDICT_SECTIONS.flatMap(extractVerdictExamples);
}

/** A ❌ the register lint is responsible for catching (prescription / leading question),
 *  as opposed to one the taxonomy gate catches (a surface nit) or nothing catches at all
 *  (a lens verdict — see the assertion below). */
function isRegisterViolation(why: string): boolean {
  return /prescribes|prescription|leading question/.test(why);
}

/** Rows of the taxonomy table: `| \`type\` | what it flags | "example" |`. */
function extractTaxonomyExamples(): Array<{ type: string; text: string }> {
  return [
    ...section("What to look for").matchAll(
      /^\|\s*`([a-z_]+)`\s*\|[^|]*\|\s*"(.+?)"\s*\|/gm
    ),
  ].map((m) => ({ type: m[1], text: m[2] }));
}

describe("skill examples ↔ registerLint", () => {
  const verdicts = allVerdictExamples();
  const taxonomy = extractTaxonomyExamples();

  it("finds the examples it claims to check", () => {
    // Guards the extraction itself: a markdown reformat that breaks these regexes would
    // otherwise turn this whole file into a silent no-op.
    expect(verdicts.filter((v) => v.ok).length).toBeGreaterThanOrEqual(4);
    expect(verdicts.filter((v) => !v.ok).length).toBeGreaterThanOrEqual(4);
    // Nine built-in types plus `user_lens`. Hardcoded on purpose — this number moving is
    // either a real taxonomy change (update it deliberately) or extraction drift.
    expect(taxonomy.length).toBe(10);
  });

  it("documents exactly the types the boundary accepts", () => {
    // The skill is the agent's only enumeration of the taxonomy, so a type listed here
    // that the boundary rejects teaches an agent to earn `unknown_type`, and a type missing
    // here is one no agent will ever use.
    expect(taxonomy.map((t) => t.type).sort()).toEqual(
      [
        "audience_mismatch",
        "clarity",
        "contradiction",
        "missing_topic",
        "strategic_tension",
        "structure_flow",
        "underexposed_topic",
        "undefined_jargon",
        "unsupported_claim",
        "user_lens",
      ].sort()
    );
  });

  it.each(allVerdictExamples().filter((v) => v.ok))("✅ example lints clean: %s", ({ text }) => {
    expect(lintRegister(text)).toEqual([]);
  });

  it.each(allVerdictExamples().filter((v) => !v.ok && isRegisterViolation(v.why)))(
    "❌ register example is actually caught by the lint: %s",
    ({ text }) => {
      // If this fails, the skill is teaching that a phrasing is forbidden while the
      // boundary would happily accept it.
      expect(lintRegister(text).length).toBeGreaterThan(0);
    }
  );

  it.each(allVerdictExamples().filter((v) => !v.ok && !isRegisterViolation(v.why)))(
    "❌ example the lint deliberately does NOT catch: %s",
    ({ text }) => {
      // Deliberately asserts the opposite, for two distinct cases the skill teaches:
      //
      //   1. A grammar/style nit phrased declaratively is legitimately register-clean —
      //      the anti-taxonomy is enforced by the fixed type enum (no `type` admits a
      //      surface nit), not by lintRegister.
      //   2. A lens *verdict* ("this paragraph sounds AI-written") is also clean, because
      //      the copula-verdict rule deliberately excludes surface-style adjectives.
      //      `user_lens` is the first type that admits style at all, so this is a real
      //      residual gap, contained by the skill's guidance rather than by code
      //      (user_directed_review.md § Perception risk, risk 1).
      //
      // Pinning both stops a future reader from "fixing" the lint to cover prose style,
      // which would start rejecting legitimate observations that merely mention wording.
      expect(lintRegister(text)).toEqual([]);
    }
  );

  it.each(extractTaxonomyExamples())("taxonomy example for $type lints clean", ({ type, text }) => {
    // Pass the type through: `claim-index` and `section-number` only fire for
    // contradiction / strategic_tension / doc-level types, so linting these type-blind
    // would miss exactly the violations the doc-level examples can commit.
    expect(lintRegister(text, { type: type as Observation["type"] })).toEqual([]);
  });

  it("every taxonomy example is within the hard 240-char cap", () => {
    for (const { type, text } of taxonomy) {
      expect(text.length, `${type} example is ${text.length} chars`).toBeLessThanOrEqual(240);
    }
  });
});
