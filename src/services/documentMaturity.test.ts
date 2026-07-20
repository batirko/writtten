import { describe, it, expect } from "vitest";
import { documentMaturity, isDocLevelArmed } from "./documentMaturity";

describe("documentMaturity", () => {
  it("is unformed for a genuinely half-formed draft (below every bar)", () => {
    expect(documentMaturity({ wordCount: 40, blockCount: 2 })).toBe("unformed");
    expect(documentMaturity({ wordCount: 79, blockCount: 3 })).toBe("unformed");
    // 4 blocks but too few words → still unformed
    expect(documentMaturity({ wordCount: 79, blockCount: 4 })).toBe("unformed");
    // Enough words for the short-draft path but too few blocks
    expect(documentMaturity({ wordCount: 100, blockCount: 3 })).toBe("unformed");
  });

  it("is forming at the old word bar regardless of block count", () => {
    expect(documentMaturity({ wordCount: 150, blockCount: 1 })).toBe("forming");
    expect(documentMaturity({ wordCount: 399, blockCount: 5 })).toBe("forming");
  });

  it("is forming for a structurally-complete short draft (UX-013)", () => {
    // ~intro/body/conclusion shape, under the old 150 cliff
    expect(documentMaturity({ wordCount: 80, blockCount: 4 })).toBe("forming");
    expect(documentMaturity({ wordCount: 120, blockCount: 6 })).toBe("forming");
  });

  it("is mature only when both the word AND block bars are met", () => {
    expect(documentMaturity({ wordCount: 400, blockCount: 6 })).toBe("mature");
    expect(documentMaturity({ wordCount: 900, blockCount: 12 })).toBe("mature");
    // Long but structurally thin → not mature (falls to forming)
    expect(documentMaturity({ wordCount: 500, blockCount: 5 })).toBe("forming");
    // Many blocks but short → forming via short-draft path, not mature
    expect(documentMaturity({ wordCount: 200, blockCount: 8 })).toBe("forming");
  });

  it("isDocLevelArmed arms for forming/mature and stays quiet for unformed", () => {
    expect(isDocLevelArmed({ wordCount: 40, blockCount: 2 })).toBe(false);
    expect(isDocLevelArmed({ wordCount: 80, blockCount: 4 })).toBe(true);
    expect(isDocLevelArmed({ wordCount: 400, blockCount: 6 })).toBe(true);
  });
});
