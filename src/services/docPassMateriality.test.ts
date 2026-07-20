import { describe, it, expect } from "vitest";
import {
  agentPushFingerprint,
  buildCandidateSnapshot,
  isMaterialDelta,
  parseDocPassSnapshot,
  serializeDocPassSnapshot,
  SUMMARY_DELTA_FLOOR,
  type DocPassSnapshot,
} from "./docPassMateriality";

// A baseline last-executed snapshot: two sections, two claims, forming, staged.
function baseSnapshot(): DocPassSnapshot {
  return {
    stage: "PRD",
    maturity: "forming",
    sectionCount: 2,
    headings: ["Overview", "Requirements"],
    summaries: { a: "the overview section", b: "the requirements section" },
    claimSigs: ["a:ships in q3", "b:supports offline mode"],
    subFloorDirtyStreak: 0,
  };
}

// The candidate for an *identical* idle (no change) — omits the streak.
function sameCandidate() {
  const b = baseSnapshot();
  const { subFloorDirtyStreak: _drop, ...rest } = b;
  return rest;
}

describe("docPassMateriality - isMaterialDelta clauses", () => {
  it("is NOT material when nothing changed", () => {
    const { material, reasons } = isMaterialDelta(baseSnapshot(), sameCandidate());
    expect(material).toBe(false);
    expect(reasons).toEqual([]);
  });

  it("clause 1 — claim delta fires (claim reworded past normalization)", () => {
    const next = sameCandidate();
    next.claimSigs = ["a:ships in q4", "b:supports offline mode"];
    const { material, reasons } = isMaterialDelta(baseSnapshot(), next);
    expect(material).toBe(true);
    expect(reasons).toContain("claim");
  });

  it("clause 1 — claim delta fires when a claim is added", () => {
    const next = sameCandidate();
    next.claimSigs = [...next.claimSigs, "a:latency under 200ms"].sort();
    expect(isMaterialDelta(baseSnapshot(), next).reasons).toContain("claim");
  });

  it("clause 1 — claim delta fires when a claim is removed/orphaned", () => {
    const next = sameCandidate();
    next.claimSigs = ["a:ships in q3"];
    expect(isMaterialDelta(baseSnapshot(), next).reasons).toContain("claim");
  });

  it("clause 2 — structure delta fires on section-count change", () => {
    const next = sameCandidate();
    next.sectionCount = 3;
    expect(isMaterialDelta(baseSnapshot(), next).reasons).toContain("structure");
  });

  it("clause 2 — structure delta fires on heading rename (same count)", () => {
    const next = sameCandidate();
    next.headings = ["Overview", "Non-goals"]; // renamed, count unchanged
    const { material, reasons } = isMaterialDelta(baseSnapshot(), next);
    expect(material).toBe(true);
    expect(reasons).toContain("structure");
  });

  it("clause 2 — structure delta fires on heading reorder (same set)", () => {
    const next = sameCandidate();
    next.headings = ["Requirements", "Overview"]; // reordered
    expect(isMaterialDelta(baseSnapshot(), next).reasons).toContain("structure");
  });

  it("clause 3 — maturity edge fires", () => {
    const next = sameCandidate();
    next.maturity = "mature";
    const { material, reasons } = isMaterialDelta(baseSnapshot(), next);
    expect(material).toBe(true);
    expect(reasons).toContain("maturity");
  });

  it("clause 4 — stage change fires", () => {
    const next = sameCandidate();
    next.stage = "Comms";
    const { material, reasons } = isMaterialDelta(baseSnapshot(), next);
    expect(material).toBe(true);
    expect(reasons).toContain("stage");
  });

  it("clause 5 — K=2 changed summaries fire", () => {
    const next = sameCandidate();
    next.summaries = { a: "a totally rewritten overview", b: "a totally rewritten requirements" };
    const { material, reasons } = isMaterialDelta(baseSnapshot(), next);
    expect(material).toBe(true);
    expect(reasons).toContain("summaries");
    expect(SUMMARY_DELTA_FLOOR).toBe(2);
  });
});

describe("docPassMateriality - accumulation (diff against last executed pass)", () => {
  it("a single changed summary is sub-floor (not material)", () => {
    const next = sameCandidate();
    next.summaries = { a: "the overview section, reworded", b: "the requirements section" };
    const { material, reasons } = isMaterialDelta(baseSnapshot(), next);
    expect(material).toBe(false);
    expect(reasons).toEqual([]);
  });

  it("a second changed summary (vs the SAME prev) crosses the floor — edits accumulate", () => {
    const prev = baseSnapshot();
    // First edit: only section a changed → sub-floor.
    const afterOne = sameCandidate();
    afterOne.summaries = { a: "reworded a", b: "the requirements section" };
    expect(isMaterialDelta(prev, afterOne).material).toBe(false);
    // Second edit accumulates against the SAME prev (snapshot stays pinned to the
    // last executed pass) → now two summaries differ → material.
    const afterTwo = sameCandidate();
    afterTwo.summaries = { a: "reworded a", b: "reworded b" };
    expect(isMaterialDelta(prev, afterTwo).reasons).toContain("summaries");
  });
});

describe("docPassMateriality - buildCandidateSnapshot normalization", () => {
  it("normalizes summary content and builds sorted claimSigs", () => {
    const snap = buildCandidateSnapshot({
      stage: undefined,
      maturity: undefined,
      sectionCount: 2,
      headings: ["H1"],
      summaries: [
        { blockId: "b2", summary: "  ZEBRA Summary " },
        { blockId: "b1", summary: "Alpha Summary" },
      ],
      claims: [
        { sourceBlockId: "b2", text: "  Ships In Q3 " },
        { sourceBlockId: "b1", text: "Offline Mode" },
      ],
    });
    expect(snap.stage).toBe("");
    expect(snap.maturity).toBe("");
    expect(snap.summaries.b2).toBe("zebra summary"); // trimmed + lowercased
    expect(snap.summaries.b1).toBe("alpha summary");
    // claimSigs sorted, normalized text.
    expect(snap.claimSigs).toEqual(["b1:offline mode", "b2:ships in q3"]);
  });
});

describe("docPassMateriality - serialize/parse", () => {
  it("round-trips a snapshot", () => {
    const snap = baseSnapshot();
    const parsed = parseDocPassSnapshot(serializeDocPassSnapshot(snap));
    expect(parsed).toEqual(snap);
  });

  it("returns null for absent / corrupt / legacy-shaped data", () => {
    expect(parseDocPassSnapshot(undefined)).toBeNull();
    expect(parseDocPassSnapshot(null)).toBeNull();
    expect(parseDocPassSnapshot("")).toBeNull();
    expect(parseDocPassSnapshot("not json {")).toBeNull();
    expect(parseDocPassSnapshot(JSON.stringify({ hash: "abc" }))).toBeNull(); // legacy string-hash value
    expect(parseDocPassSnapshot(JSON.stringify({ stage: "PRD" }))).toBeNull(); // missing fields
  });
});

// ---------------------------------------------------------------------------
// Agent-push materiality (BYOA)
// ---------------------------------------------------------------------------

const fp = agentPushFingerprint;

describe("agentPushFingerprint - re-partition is not material", () => {
  it("is stable when a heading is split into its own section", () => {
    // The 2026-07-20 field case. Same words; only the boundary moved.
    const before = fp({
      title: "PRD",
      stage: "spec",
      sections: [{ heading: "Goals", text: "Ship the thing. Rollout We start in Q3." }],
    });
    const after = fp({
      title: "PRD",
      stage: "spec",
      sections: [
        { heading: "Goals", text: "Ship the thing." },
        { heading: "Rollout", text: "We start in Q3." },
      ],
    });
    expect(after).toBe(before);
  });

  it("is stable across whitespace-only churn (blank lines, indentation, wrapping)", () => {
    const a = fp({ title: "T", stage: "S", sections: [{ heading: "H", text: "one two three" }] });
    const b = fp({
      title: "T",
      stage: "S",
      sections: [{ heading: " H ", text: "one\n\n  two\t three  " }],
    });
    expect(b).toBe(a);
  });

  it("is stable when a heading is demoted to body text without moving words", () => {
    const a = fp({
      title: "T",
      stage: "S",
      sections: [
        { heading: "Risks", text: "Latency may regress." },
        { heading: "Rollout", text: "Q3." },
      ],
    });
    const b = fp({
      title: "T",
      stage: "S",
      sections: [{ heading: "Risks", text: "Latency may regress. Rollout Q3." }],
    });
    expect(b).toBe(a);
  });
});

describe("agentPushFingerprint - real changes stay material", () => {
  it("changes when prose is added", () => {
    const a = fp({ title: "T", stage: "S", sections: [{ heading: "H", text: "one" }] });
    const b = fp({ title: "T", stage: "S", sections: [{ heading: "H", text: "one two" }] });
    expect(b).not.toBe(a);
  });

  it("changes when a sentence is reworded", () => {
    const a = fp({ title: "T", stage: "S", sections: [{ heading: "H", text: "We ship in Q3." }] });
    const b = fp({ title: "T", stage: "S", sections: [{ heading: "H", text: "We ship in Q4." }] });
    expect(b).not.toBe(a);
  });

  it("changes when a heading is renamed", () => {
    const a = fp({ title: "T", stage: "S", sections: [{ heading: "Goals", text: "x" }] });
    const b = fp({ title: "T", stage: "S", sections: [{ heading: "Non-goals", text: "x" }] });
    expect(b).not.toBe(a);
  });

  it("changes when sections are reordered — flow is a real conclusion", () => {
    const one = { heading: "A", text: "alpha" };
    const two = { heading: "B", text: "beta" };
    expect(fp({ title: "T", stage: "S", sections: [two, one] })).not.toBe(
      fp({ title: "T", stage: "S", sections: [one, two] })
    );
  });

  it("changes when the stage or title changes", () => {
    const base = { title: "T", stage: "S", sections: [{ heading: "H", text: "x" }] };
    expect(fp({ ...base, stage: "different" })).not.toBe(fp(base));
    expect(fp({ ...base, title: "different" })).not.toBe(fp(base));
  });

  it("changes when a section is deleted", () => {
    const a = fp({
      title: "T",
      stage: "S",
      sections: [
        { heading: "A", text: "alpha" },
        { heading: "B", text: "beta" },
      ],
    });
    const b = fp({ title: "T", stage: "S", sections: [{ heading: "A", text: "alpha" }] });
    expect(b).not.toBe(a);
  });
});
