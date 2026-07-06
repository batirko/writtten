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

describe("lintRegister — structural register rules", () => {
  it("passes a clean colleague message", () => {
    expect(lintRegister("The 30% target in §2 has no baseline to measure against.")).toEqual([]);
  });

  it("flags a question mark", () => {
    const v = lintRegister("Have you considered user demand?");
    expect(v.map((x) => x.rule)).toContain("question");
  });

  it("flags prescriptive patterns", () => {
    expect(lintRegister("You need to add a baseline.").map((x) => x.rule)).toContain("prescriptive");
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

  it("marks the >240-char length violation as soft", () => {
    const long = "§2. " + "x".repeat(300);
    const v = lintRegister(long);
    const lengthV = v.find((x) => x.rule === "length");
    expect(lengthV?.soft).toBe(true);
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
