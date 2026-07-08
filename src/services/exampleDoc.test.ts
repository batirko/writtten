import { describe, it, expect } from "vitest";
import { EXAMPLE_DOC_HTML, EXAMPLE_STAGE } from "./exampleDoc";

/** The example doc is the "See it in action" hero fixture. These guards keep a
 *  well-meaning copy edit from quietly removing the planted contradiction (the
 *  whole point of the example) or dropping it below the contradiction-sweep
 *  word threshold. */
describe("exampleDoc", () => {
  it("ships non-empty PRD content and a stage", () => {
    expect(EXAMPLE_DOC_HTML.trim().length).toBeGreaterThan(0);
    expect(EXAMPLE_STAGE).toBe("PRD");
  });

  it("keeps the planted Q2-vs-Q3 contradiction", () => {
    expect(EXAMPLE_DOC_HTML).toContain("Q2 2026");
    expect(EXAMPLE_DOC_HTML).toContain("Q3 2026");
  });

  it("keeps the planted BM25 term (the undefined_jargon exemplar)", () => {
    // The demo's one undefined_jargon card anchors to this acronym; a copy edit
    // that drops it would silently remove that capability from the "See it in
    // action" spread. See docs/projects/onboarding_first_run.md § Revision.
    expect(EXAMPLE_DOC_HTML).toContain("BM25");
  });

  it("stays above the 150-word contradiction-sweep threshold", () => {
    const words = EXAMPLE_DOC_HTML.replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    expect(words.length).toBeGreaterThanOrEqual(150);
  });
});
