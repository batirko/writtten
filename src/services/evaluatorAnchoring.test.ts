/**
 * Unit tests for anchorClaimsToMembers — the claim-level precise-anchoring
 * resolver. It maps each claim's text to the section member block + offsets that
 * actually contain it, so contradiction/tension observations later anchor to the
 * real clause instead of the section's heading block.
 */

import { describe, it, expect } from "vitest";
import { anchorClaimsToMembers, firstBodyMember, blockPairKey } from "./evaluatorAnchoring";
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
    expect(c.anchorExact).toBe(true);
    const start = members[1].text.indexOf(
      "every enterprise activation requires a solutions engineer"
    );
    expect(c.anchorStartOffset).toBe(start);
    expect(c.anchorEndOffset).toBe(
      start + "every enterprise activation requires a solutions engineer".length
    );
    // UX-008: verbatim excerpt = the exact source slice at those offsets.
    expect(c.anchorQuote).toBe("every enterprise activation requires a solutions engineer");
  });

  it("falls back to the body block whole-block (never the heading) when reworded (OBS-032)", () => {
    const [c] = anchorClaimsToMembers(members, [
      { text: "activation needs a human in the loop", kind: "fact_claim" },
    ]);
    // Anchored to the body block, whole-block — NOT the heading, NOT undefined.
    expect(c.anchorBlockId).toBe("b1");
    expect(c.anchorBlockId).not.toBe("h1");
    expect(c.anchorStartOffset).toBe(0);
    // 9999 sentinel, not the real body length: downstream code (evaluator.ts
    // emit, reanchorOffset's isWholeBlockSentinel) tells "whole-block
    // fallback" apart from "exact anchor whose text vanished" by this exact
    // value — a real length there gets misread as the latter and suppressed.
    expect(c.anchorEndOffset).toBe(9999);
    expect(c.anchorExact).toBe(false);
    // UX-008: no faithful excerpt on the paraphrase fallback → absent.
    expect(c.anchorQuote).toBeUndefined();
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
    // UX-008: the excerpt is the verbatim source clause (no trailing period).
    expect(c.anchorQuote).toBe("The rollout will ship to all customers in Q3");
  });

  it("anchors a mix — verbatim precise, reworded to whole body block — independently", () => {
    const out = anchorClaimsToMembers(members, [
      { text: "requires a solutions engineer", kind: "constraint" },
      { text: "onboarding is fully automated", kind: "commitment" },
    ]);
    expect(out[0].anchorBlockId).toBe("b1");
    expect(out[0].anchorExact).toBe(true);
    // Reworded still resolves to the body block (whole-block), not the heading.
    expect(out[1].anchorBlockId).toBe("b1");
    expect(out[1].anchorExact).toBe(false);
  });

  it("captures a mid-sentence, lowercase excerpt verbatim (UX-008 core case)", () => {
    // The extractor lifted a mid-sentence clause; the source keeps it lowercase.
    // The excerpt must be the user's actual words (so the card can lead with `…`),
    // not a capitalized standalone rendering.
    const secs: SectionMember[] = [
      { blockId: "h", text: "Latency", isHeading: true },
      { blockId: "b", text: "The push notification arrives within 10 seconds of the event." },
    ];
    const [c] = anchorClaimsToMembers(secs, [
      { text: "push notification arrives within 10 seconds", kind: "constraint" },
    ]);
    expect(c.anchorExact).toBe(true);
    expect(c.anchorQuote).toBe("push notification arrives within 10 seconds");
    // Its start offset is mid-block (not 0), i.e. mid-sentence — the render uses
    // this to decide the leading ellipsis.
    expect(c.anchorStartOffset).toBeGreaterThan(0);
  });

  it("returns a new array without mutating the inputs", () => {
    const claims = [{ text: "requires a solutions engineer", kind: "constraint" as const }];
    const out = anchorClaimsToMembers(members, claims);
    expect(out[0]).not.toBe(claims[0]);
    expect(claims[0]).not.toHaveProperty("anchorBlockId");
  });
});

describe("firstBodyMember (OBS-032)", () => {
  it("skips heading and table members, returning the first body block", () => {
    const secs: SectionMember[] = [
      { blockId: "h", text: "Proposed solution", isHeading: true },
      { blockId: "t", text: "col1col2", isTable: true },
      { blockId: "body", text: "We will ship in Q3." },
      { blockId: "body2", text: "A later paragraph." },
    ];
    expect(firstBodyMember(secs)?.blockId).toBe("body");
  });

  it("skips an empty body paragraph to the first non-empty body member", () => {
    const secs: SectionMember[] = [
      { blockId: "h", text: "Heading", isHeading: true },
      { blockId: "empty", text: "   " },
      { blockId: "body", text: "Real content here." },
    ];
    expect(firstBodyMember(secs)?.blockId).toBe("body");
  });

  it("falls back to members[0] when there is no body member (defensive)", () => {
    const secs: SectionMember[] = [{ blockId: "h", text: "Just a heading", isHeading: true }];
    expect(firstBodyMember(secs)?.blockId).toBe("h");
  });

  it("returns the intro block for a headingless section (members[0] is body)", () => {
    const secs: SectionMember[] = [{ blockId: "intro", text: "An intro paragraph." }];
    expect(firstBodyMember(secs)?.blockId).toBe("intro");
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
