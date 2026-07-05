/**
 * Unit tests for anchorClaimsToMembers — the claim-level precise-anchoring
 * resolver. It maps each claim's text to the section member block + offsets that
 * actually contain it, so contradiction/tension observations later anchor to the
 * real clause instead of the section's heading block.
 */

import { describe, it, expect } from "vitest";
import { anchorClaimsToMembers, blockPairKey } from "./evaluatorAnchoring";
import type { SectionMember } from "./types";

// A section: heading block + one body block (the common headed-document shape
// that made conflicts anchor to the heading).
const members: SectionMember[] = [
  { blockId: "h1", text: "Problem", isHeading: true },
  {
    blockId: "b1",
    text: "Today every enterprise activation requires a solutions engineer on a live call.",
  },
];

describe("anchorClaimsToMembers", () => {
  it("resolves a verbatim claim to its body block + offsets (not the heading)", () => {
    const [c] = anchorClaimsToMembers(members, [
      { text: "every enterprise activation requires a solutions engineer", kind: "fact_claim" },
    ]);
    expect(c.anchorBlockId).toBe("b1");
    const start = members[1].text.indexOf(
      "every enterprise activation requires a solutions engineer"
    );
    expect(c.anchorStartOffset).toBe(start);
    expect(c.anchorEndOffset).toBe(
      start + "every enterprise activation requires a solutions engineer".length
    );
  });

  it("leaves anchor fields undefined when the claim was reworded (no verbatim match)", () => {
    const [c] = anchorClaimsToMembers(members, [
      { text: "activation needs a human in the loop", kind: "fact_claim" },
    ]);
    expect(c.anchorBlockId).toBeUndefined();
    expect(c.anchorStartOffset).toBeUndefined();
    expect(c.anchorEndOffset).toBeUndefined();
    // Original fields are preserved untouched.
    expect(c.text).toBe("activation needs a human in the loop");
    expect(c.kind).toBe("fact_claim");
  });

  it("tolerates a trailing sentence period the extractor added to a mid-sentence clause", () => {
    // Source has "...in Q3, giving..." (comma); the extractor lifted it as a
    // standalone claim ending in a period. Exact match misses on that one char;
    // the punctuation-tolerant fallback recovers the real clause.
    const secs: SectionMember[] = [
      { blockId: "h", text: "Summary", isHeading: true },
      { blockId: "body", text: "The rollout will ship to all customers in Q3, giving support time." },
    ];
    const [c] = anchorClaimsToMembers(secs, [
      { text: "The rollout will ship to all customers in Q3.", kind: "commitment" },
    ]);
    expect(c.anchorBlockId).toBe("body");
    // Anchored to the clause (without the trailing period), not the heading.
    expect(secs[1].text.slice(c.anchorStartOffset, c.anchorEndOffset)).toBe(
      "The rollout will ship to all customers in Q3"
    );
  });

  it("anchors a mix — some verbatim, some reworded — independently", () => {
    const out = anchorClaimsToMembers(members, [
      { text: "requires a solutions engineer", kind: "constraint" },
      { text: "onboarding is fully automated", kind: "commitment" },
    ]);
    expect(out[0].anchorBlockId).toBe("b1");
    expect(out[1].anchorBlockId).toBeUndefined();
  });

  it("returns a new array without mutating the inputs", () => {
    const claims = [{ text: "requires a solutions engineer", kind: "constraint" as const }];
    const out = anchorClaimsToMembers(members, claims);
    expect(out[0]).not.toBe(claims[0]);
    expect(claims[0]).not.toHaveProperty("anchorBlockId");
  });
});

describe("blockPairKey", () => {
  it("is order-independent and type-agnostic", () => {
    expect(blockPairKey({ blockId: "a", conflictingBlockId: "b" })).toBe(
      blockPairKey({ blockId: "b", conflictingBlockId: "a" })
    );
    expect(blockPairKey({ blockId: "a", conflictingBlockId: "b" })).toBe("a|b");
  });
});
