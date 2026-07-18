import { describe, it, expect } from "vitest";
import { isExcludedScopeHeading } from "./scopeHeading";

describe("isExcludedScopeHeading (OBS-030)", () => {
  it("matches the exclusion heading families", () => {
    const excluded = [
      "Out of scope",
      "Out of Scope",
      "OUT OF SCOPE",
      "Out-of-scope",
      "Not in scope",
      "Non-goals",
      "Non goals",
      "Nongoals",
      "Non-Goal",
      "Future work",
      "Future Work",
      "Future considerations",
      "Future enhancements",
      "Future scope",
      "3. Out of Scope",
      "## Non-Goals",
      "Out of scope:",
      "Future Enhancements (Post-MVP)",
    ];
    for (const h of excluded) {
      expect(isExcludedScopeHeading(h), h).toBe(true);
    }
  });

  it("does not match normal or ambiguous headings", () => {
    const notExcluded = [
      "Solution",
      "Overview",
      "Scope", // bare "scope" is the section's scope, not an exclusion
      "In scope",
      "Goals",
      "Success metrics",
      "Future state", // a design direction, not an exclusion
      "Future vision",
      "The future of the product",
      "Rollout",
      "",
      undefined,
      null,
    ];
    for (const h of notExcluded) {
      expect(isExcludedScopeHeading(h), String(h)).toBe(false);
    }
  });
});
