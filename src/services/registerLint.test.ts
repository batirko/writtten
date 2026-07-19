/**
 * Register lint + tone classifier — Tier-1 deterministic guard (in CI).
 *
 * Two jobs:
 *   1. Unit-cover each lintRegister rule (the structural G3 + voice/copy guide
 *      mechanical rules the ratchet asserts against).
 *   2. Make the tone dimension *measured*: assert classifyTone reproduces the
 *      labeled toneCorpus — every wrong-persona message classifies as its
 *      failing label, every colleague version as `colleague`. A change that
 *      makes the classifier or the corpus inconsistent fails CI.
 *
 * See docs/projects/emotional_register.md § Tone as an eval dimension.
 */

import { describe, it, expect } from "vitest";
import { lintRegister, classifyTone } from "./registerLint";
import { toneCorpus } from "./eval-fixtures/tone-corpus";
import { registerLintCorpus } from "./eval-fixtures/register-lint-corpus";

describe("lintRegister — structural register rules", () => {
  it("passes a clean colleague message", () => {
    expect(lintRegister("The 30% target in §2 has no baseline to measure against.")).toEqual([]);
  });

  it("flags a question mark", () => {
    const v = lintRegister("Have you considered user demand?");
    expect(v.map((x) => x.rule)).toContain("question");
  });

  it("flags prescriptive patterns", () => {
    expect(lintRegister("You need to add a baseline.").map((x) => x.rule)).toContain(
      "prescriptive"
    );
    expect(lintRegister("I recommend defining the metric.").map((x) => x.rule)).toContain(
      "prescriptive"
    );
  });

  it("flags hedge words", () => {
    expect(lintRegister("This perhaps conflicts with §2.").map((x) => x.rule)).toContain("hedge");
  });

  it("flags evaluative verdicts", () => {
    expect(lintRegister("This section is weak.").map((x) => x.rule)).toContain("evaluative");
  });

  it("flags a claim-index leak only for contradiction/tension types", () => {
    expect(
      lintRegister("This contradicts Claim #2.", { type: "contradiction" }).map((x) => x.rule)
    ).toContain("claim-index");
    // Same text on a non-cross-span type is not linted for the index rule.
    expect(
      lintRegister("This contradicts Claim #2.", { type: "clarity" }).map((x) => x.rule)
    ).not.toContain("claim-index");
  });

  it('does not flag the ordinary phrase "the existing claim"', () => {
    expect(
      lintRegister("This restates the existing claim about Q3.", {
        type: "contradiction",
      }).map((x) => x.rule)
    ).not.toContain("claim-index");
  });

  // OBS-034: the doc-level pass leaked `claim [3]` / `claims [1] and [2]` /
  // fabricated `§N` numbers into user-facing copy. The lint now covers the
  // doc-level types (missing_topic / underexposed_topic / audience_mismatch /
  // structure_flow) as a backstop to the prompt fix.
  it("flags the doc-level `claim [3]` bracket form on doc-level types", () => {
    expect(
      lintRegister('The functionality in claim [3] as "key issues" is underspecified.', {
        type: "underexposed_topic",
      }).map((x) => x.rule)
    ).toContain("claim-index");
  });

  it("flags the plural `claims [1] and [2]` bracket form", () => {
    expect(
      lintRegister("The informal phrasing in claims [1] and [2] does not fit the audience.", {
        type: "audience_mismatch",
      }).map((x) => x.rule)
    ).toContain("claim-index");
  });

  it("flags a `block [2]` reference on a doc-level type", () => {
    expect(
      lintRegister("The topic in block [2] is never developed.", { type: "missing_topic" }).map(
        (x) => x.rule
      )
    ).toContain("claim-index");
  });

  it("flags a fabricated `§N` number on doc-level types", () => {
    expect(
      lintRegister("It introduces the solution in §1 before the problem in §2.", {
        type: "structure_flow",
      }).map((x) => x.rule)
    ).toContain("section-number");
  });

  it("does not flag a `§2` reference on a span-scoped type (author may have written it)", () => {
    expect(
      lintRegister("The metric in §2 has no baseline.", { type: "clarity" }).map((x) => x.rule)
    ).not.toContain("section-number");
  });

  it("passes doc-level copy that quotes content instead of numbering", () => {
    expect(
      lintRegister(
        'The "Success metrics" section sets a launch date but never names a go-to-market path.',
        { type: "missing_topic" }
      )
    ).toEqual([]);
  });

  it("marks the >240-char length violation as soft", () => {
    const long = "§2. " + "x".repeat(300);
    const v = lintRegister(long);
    const lengthV = v.find((x) => x.rule === "length");
    expect(lengthV?.soft).toBe(true);
  });
});

/**
 * G3b — the adversarial corpus. Both directions are load-bearing:
 *   · every `violating` row must trip its named rule (the lint catches what it claims);
 *   · every `clean` row must lint EMPTY (the lint hasn't been over-tightened).
 *
 * The clean column is a set of deliberate near misses — each shares vocabulary
 * with its violating partner and differs only in the grammatical feature the rule
 * is anchored on. A change that passes the first loop and fails the second has
 * broken the lint, not tightened it. See eval-fixtures/register-lint-corpus.ts.
 */
describe("lintRegister — adversarial corpus (G3b)", () => {
  for (const c of registerLintCorpus) {
    const opts = c.type ? { type: c.type } : undefined;

    it(`${c.id}: violating trips "${c.rule}"`, () => {
      const rules = lintRegister(c.violating, opts)
        .filter((v) => !v.soft)
        .map((v) => v.rule);
      expect(rules, `"${c.violating}" — ${c.why}`).toContain(c.rule);
    });

    it(`${c.id}: clean near-miss passes`, () => {
      const hard = lintRegister(c.clean, opts).filter((v) => !v.soft);
      expect(
        hard,
        `OVER-REJECTION — "${c.clean}" is legitimate product voice.\n  ${c.why}\n  ${hard
          .map((v) => v.detail)
          .join("\n  ")}`
      ).toEqual([]);
    });
  }

  it("covers every rule the lint can emit", () => {
    // Stops a rule being added without adversarial rows — the exact gap that let
    // the denylist survive two phases unprobed.
    const covered = new Set(registerLintCorpus.map((c) => c.rule));
    for (const rule of [
      "question",
      "prescriptive",
      "hedge",
      "evaluative",
      "claim-index",
      "section-number",
    ]) {
      expect(covered, `no corpus row probes the "${rule}" rule`).toContain(rule);
    }
  });
});

describe("classifyTone — tone dimension (measured drift guard)", () => {
  it("classifies clean colleague messages as colleague", () => {
    expect(classifyTone("§2 commits to Q3; the dependency in §6 isn't due until Q4.")).toBe(
      "colleague"
    );
  });

  // The load-bearing assertion: the classifier reproduces every labeled corpus pair.
  for (const pair of toneCorpus) {
    it(`corpus "${pair.id}": wrong → ${pair.wrongTone}`, () => {
      expect(classifyTone(pair.wrong)).toBe(pair.wrongTone);
    });

    // The linter's `right` column is a "(anti-taxonomy — never fires)" placeholder
    // note, not a real observation message. Skip it; assert only the real ones.
    if (!pair.right.startsWith("(")) {
      it(`corpus "${pair.id}": right → colleague`, () => {
        expect(classifyTone(pair.right)).toBe("colleague");
      });
    }
  }
});
