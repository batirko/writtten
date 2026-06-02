import { describe, it, expect } from "vitest";
import { tokenize, prefilterClaims } from "./prefilter";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumeric separators", () => {
    const tokens = tokenize("We'll ship the Q3 release!");
    expect(tokens.has("ship")).toBe(true);
    expect(tokens.has("q3")).toBe(true);
    expect(tokens.has("release")).toBe(true);
  });

  it("removes stop words", () => {
    const tokens = tokenize("this is a test");
    expect(tokens.has("this")).toBe(false);
    expect(tokens.has("is")).toBe(false);
    expect(tokens.has("a")).toBe(false);
    expect(tokens.has("test")).toBe(true);
  });

  it("removes single-character tokens (2+ chars are kept)", () => {
    const tokens = tokenize("A B CD EFG");
    expect(tokens.has("a")).toBe(false);  // single char stripped
    expect(tokens.has("b")).toBe(false);  // single char stripped
    expect(tokens.has("cd")).toBe(true);  // 2-char tokens kept (important for "q3", "q2", etc.)
    expect(tokens.has("efg")).toBe(true);
  });

  it("returns empty set for all-stop-word input", () => {
    expect(tokenize("is it the a").size).toBe(0);
  });
});

describe("prefilterClaims", () => {
  it("returns all candidates unchanged when count <= topK", () => {
    const claims = [
      { text: "Launch in Q3." },
      { text: "Budget is $1M." },
    ];
    const result = prefilterClaims("ship in Q3", claims, 10);
    expect(result).toBe(claims); // exact same array reference
  });

  it("returns topK candidates when count exceeds topK", () => {
    const claims = Array.from({ length: 15 }, (_, i) => ({
      text: `Unrelated claim number ${i}.`,
    }));
    // Splice in two highly relevant ones
    claims[2].text = "We plan to launch in Q3 on schedule.";
    claims[7].text = "Q3 target date confirmed for the release.";

    const result = prefilterClaims("ship Q3 release", claims, 5);
    expect(result).toHaveLength(5);

    const texts = result.map((c) => c.text);
    expect(texts).toContain("We plan to launch in Q3 on schedule.");
    expect(texts).toContain("Q3 target date confirmed for the release.");
  });

  it("breaks ties by original insertion order (stable sort)", () => {
    const claims = [
      { text: "aaa bbb ccc ddd" },
      { text: "aaa bbb ccc eee" },
      { text: "aaa bbb ccc fff" },
    ];
    // All share "aaa bbb ccc" with query — identical Jaccard scores
    const result = prefilterClaims("aaa bbb ccc", claims, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(claims[0]);
    expect(result[1]).toBe(claims[1]);
  });

  it("handles empty candidates array", () => {
    expect(prefilterClaims("anything", [], 5)).toEqual([]);
  });

  it("handles empty query gracefully (all scores equal 0, returns first K)", () => {
    const claims = [
      { text: "Launch in Q3." },
      { text: "Budget is $1M." },
      { text: "Team size is 5." },
    ];
    // Empty query → queryTokens is empty → similarity = 0 for all → stable order
    const result = prefilterClaims("", claims, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(claims[0]);
    expect(result[1]).toBe(claims[1]);
  });

  it("ranks semantically closer claims higher", () => {
    const claims = [
      { text: "The sky is blue and clear today." },
      { text: "The project will ship in Q3 next quarter." },
      { text: "Budget allocation is confirmed for Q2 and Q3." },
    ];
    const result = prefilterClaims("Q3 launch deadline", claims, 2);
    const texts = result.map((c) => c.text);
    expect(texts).toContain("The project will ship in Q3 next quarter.");
    expect(texts).toContain("Budget allocation is confirmed for Q2 and Q3.");
    expect(texts).not.toContain("The sky is blue and clear today.");
  });
});
