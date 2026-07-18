import { describe, it, expect } from "vitest";
import { tokenize, prefilterClaims, selectContradictionCandidates } from "./prefilter";

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
    expect(tokens.has("a")).toBe(false); // single char stripped
    expect(tokens.has("b")).toBe(false); // single char stripped
    expect(tokens.has("cd")).toBe(true); // 2-char tokens kept (important for "q3", "q2", etc.)
    expect(tokens.has("efg")).toBe(true);
  });

  it("returns empty set for all-stop-word input", () => {
    expect(tokenize("is it the a").size).toBe(0);
  });
});

describe("prefilterClaims", () => {
  it("returns all candidates unchanged when count <= topK", () => {
    const claims = [{ text: "Launch in Q3." }, { text: "Budget is $1M." }];
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

describe("selectContradictionCandidates (OBS-038 — near-duplicate crowding)", () => {
  // The P09 shape, synthesized: a settling section whose claims are dominated by
  // unrelated "dashboard" claims (β is one of several new claims), and a ledger of
  // dashboard-flavoured decoys that all outrank the contradictory claim γ under the
  // OLD whole-section blob query — so γ is crowded out of the top-10 and the true pair
  // (β × γ) is never presented to the adjudicator. Per-claim retrieval fixes it:
  // querying β on its own surfaces γ (they share their subject) despite the decoys.
  const beta = { text: "alert creation completes within five minutes" };
  const gamma = { text: "alert creation takes up to sixty minutes" }; // β's contradiction
  // The other new claims in β's settling section — unrelated dashboard claims that
  // dominate the concatenated blob and dilute β's retrieval signal.
  const otherNewClaims = [
    { text: "dashboard widgets render on the analytics homepage" },
    { text: "the analytics homepage loads chart tiles for reports" },
    { text: "report chart tiles refresh on the analytics dashboard" },
  ];
  // Twelve ledger decoys lexically close to the dashboard claims (so the blob query
  // ranks them above γ) but sharing nothing with β — and mutually distinct enough
  // (Jaccard ≈ 0.71 < 0.9) that the dedup step keeps all of them, isolating the
  // per-claim-retrieval lever from the dedup lever.
  const decoys = Array.from({ length: 12 }, (_, i) => ({
    text: `analytics homepage dashboard tiles reports decoy${i}`,
  }));

  it("retains the contradictory claim the OLD blob prefilter crowded out", () => {
    const newClaims = [beta, ...otherNewClaims];
    const otherClaims = [...decoys, gamma];

    // OLD behaviour: query = the concatenated new-claim blob, single global top-10.
    // γ is crowded out by the dashboard decoys.
    const blob = newClaims.map((c) => c.text).join(" ");
    const oldSelection = prefilterClaims(blob, otherClaims, 10);
    expect(oldSelection).not.toContain(gamma);

    // NEW behaviour: per-claim retrieval surfaces γ via β's own query, so the true
    // pair can co-occur in the assembled prompt (β ∈ newClaims, γ ∈ candidates).
    const newSelection = selectContradictionCandidates(newClaims, otherClaims, {
      perClaimK: 5,
      totalCap: 15,
    });
    expect(newSelection).toContain(gamma);
  });

  it("dedups near-duplicate candidates (>= 0.9 Jaccard), keeping the first", () => {
    // a1 and a2 have identical token sets ("the" is a stop word) → Jaccard 1.0.
    const a1 = { text: "alert creation flow completes within five minutes reliably" };
    const a2 = { text: "the alert creation flow completes within five minutes reliably" };
    const distinct = { text: "dashboard widgets render analytics homepage tiles" };

    const result = selectContradictionCandidates(
      [{ text: "alert creation timing" }],
      [a1, a2, distinct],
      { perClaimK: 5, totalCap: 15 }
    );
    expect(result).toContain(a1); // keep-first
    expect(result).not.toContain(a2); // near-duplicate collapsed
    expect(result).toContain(distinct);
  });

  it("is a no-op set on small same-section pools (byte-identity guard)", () => {
    // Mechanism-A same-section case: the new claims ARE the candidate pool. Each new
    // claim retrieves itself at Jaccard 1.0, so the union covers every candidate and
    // the output set equals the input — this is what keeps existing fixtures identical.
    const c1 = { text: "we will launch the checkout redesign in Q2" };
    const c2 = { text: "the marketing budget is one million dollars" };
    const c3 = { text: "the platform team has five backend engineers" };
    const pool = [c1, c2, c3];
    const result = selectContradictionCandidates(pool, pool, { perClaimK: 5, totalCap: 15 });
    expect(new Set(result)).toEqual(new Set(pool));
    expect(result).toHaveLength(3);
  });

  it("preserves all candidates on the clarity-wordy-specified shape (3 cross + 3 same)", () => {
    // The corpus's highest-candidate contradiction fixture: 3 cross-section claims +
    // 3 same-section claims (== the new claims), 6 candidates total. Even though each
    // per-claim top-5 of 6 drops one candidate, the union across the 3 new claims
    // covers all 6 (each new claim retrieves itself; the cross claims fill every list).
    const cross = [
      { text: "the mobile team ships the notification service by November 30 2025" },
      { text: "a maximum of three retries at thirty second intervals" },
      { text: "delivery success rate stays at or above 98.5 percent" },
    ];
    const same = [
      { text: "we plan to launch the feature when it is ready" },
      { text: "stakeholder alignment happens through the usual channels before release" },
      { text: "we will track progress against our standard metrics" },
    ];
    const otherClaims = [...cross, ...same];
    const result = selectContradictionCandidates(same, otherClaims, {
      perClaimK: 5,
      totalCap: 15,
    });
    expect(new Set(result)).toEqual(new Set(otherClaims));
    expect(result).toHaveLength(6);
  });
});
