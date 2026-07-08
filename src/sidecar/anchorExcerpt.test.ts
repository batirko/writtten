import { describe, it, expect } from "vitest";
import { formatAnchorExcerpt } from "./anchorExcerpt";

// UX-008 — the card anchor quote should read as a faithful excerpt of the user's
// own words: verbatim, mid-sentence, ellipsis-fenced when clipped; never a
// force-capitalized standalone sentence when it was lifted from mid-clause.
describe("formatAnchorExcerpt (UX-008)", () => {
  it("prefers the verbatim anchorQuote over the normalized claim text", () => {
    // Cross-claim card: anchorText is the capitalized normalized claim; anchorQuote
    // is the user's mid-sentence slice → quote the slice, keep lowercase, fence it.
    expect(
      formatAnchorExcerpt({
        type: "contradiction",
        anchorText: "The feature ships in Q3.",
        anchorQuote: "ship this in Q3",
      })
    ).toBe("…ship this in Q3…");
  });

  it("leads with an ellipsis and keeps casing for a mid-sentence span excerpt", () => {
    expect(
      formatAnchorExcerpt({ type: "clarity", anchorText: "non-invasive way" })
    ).toBe("…non-invasive way…");
  });

  it("does not lead with an ellipsis when the excerpt starts a sentence", () => {
    expect(
      formatAnchorExcerpt({ type: "clarity", anchorText: "We will ship this soon" })
    ).toBe("We will ship this soon…");
  });

  it("does not trail with an ellipsis when the excerpt ends at a boundary", () => {
    expect(
      formatAnchorExcerpt({ type: "unsupported_claim", anchorText: "we own the market." })
    ).toBe("…we own the market.");
  });

  it("treats a closing quote after terminal punctuation as a boundary", () => {
    expect(
      formatAnchorExcerpt({ type: "clarity", anchorText: 'we call it "done."' })
    ).toBe('…we call it "done."');
  });

  it("renders the cross-claim paraphrase fallback plainly (no anchorQuote)", () => {
    // No verbatim slice was captured → anchorText is a normalized standalone
    // claim; render it as-is, no ellipsis fencing.
    expect(
      formatAnchorExcerpt({ type: "strategic_tension", anchorText: "Ships in Q3" })
    ).toBe("Ships in Q3");
  });

  it("returns null when there is nothing to quote", () => {
    expect(formatAnchorExcerpt({ type: "clarity" })).toBeNull();
    expect(formatAnchorExcerpt({ type: "clarity", anchorText: "   " })).toBeNull();
  });
});
