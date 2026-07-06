import { describe, it, expect } from "vitest";
import { parseCsv, parseLabels, parseEmissions, labelToExpected } from "./loadLabels";
import { buildCorpus, anonymisedId } from "../loadCorpus";

describe("parseCsv", () => {
  it("handles quoted fields with embedded commas, quotes, and newlines", () => {
    const csv = 'a,b,c\n"has, comma","has ""quote""","line1\nline2"\n';
    const grid = parseCsv(csv);
    expect(grid[0]).toEqual(["a", "b", "c"]);
    expect(grid[1]).toEqual(["has, comma", 'has "quote"', "line1\nline2"]);
  });

  it("flushes a trailing row with no final newline", () => {
    expect(parseCsv("x,y\n1,2")[1]).toEqual(["1", "2"]);
  });
});

describe("parseLabels", () => {
  const csv = [
    "doc_id,bucket,span_a,span_b,section_a_id,section_b_id,rationale,verified",
    "# a comment row is skipped,1,x,y,,,note,true",
    'P01,1,"ships in Q2","launch in Q3",s2,s5,"two ship dates",true',
    "P01,2,DAU,depth,,,soft conflict,false",
    "P02,9,bad,bucket,,,ignored,true",
  ].join("\n");

  it("parses bucketed rows and skips comments + out-of-range buckets", () => {
    const rows = parseLabels(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      docId: "P01",
      bucket: 1,
      spanA: "ships in Q2",
      spanB: "launch in Q3",
      sectionA: "s2",
      verified: true,
    });
    expect(rows[1]).toMatchObject({ bucket: 2, verified: false, sectionA: undefined });
  });

  it("throws when a required column is missing", () => {
    expect(() => parseLabels("doc_id,bucket,span_a\nP01,1,x")).toThrow(/span_b/);
  });

  it("labelToExpected maps buckets to the right observation types", () => {
    const rows = parseLabels(csv);
    expect(labelToExpected(rows[0])).toMatchObject({
      type: "contradiction",
      substring: "ships in Q2",
    });
    expect(labelToExpected(rows[1]).type).toBe("strategic_tension");
  });
});

describe("parseEmissions", () => {
  it("parses tp/fp verdicts and skips un-adjudicated rows", () => {
    const csv = [
      "doc_id,obs_type,anchored_span,message,verdict,verified",
      "P01,contradiction,span,msg,tp,true",
      "P01,clarity,vague,msg,fp,false",
      "P01,clarity,pending,msg,,false", // blank verdict → skipped
    ].join("\n");
    const rows = parseEmissions(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: "contradiction", verdict: "tp", verified: true });
    expect(rows[1].verdict).toBe("fp");
  });
});

describe("buildCorpus", () => {
  it("assigns anonymised, sorted-stable ids regardless of input order", () => {
    const files = [
      { name: "zeta.md", markdown: "# Z\n\nbody" },
      { name: "alpha.md", markdown: "# A\n\nbody" },
    ];
    const corpus = buildCorpus(files);
    expect(corpus.map((c) => c.id)).toEqual(["P01", "P02"]);
    // alpha sorts first → P01
    expect(corpus[0].description).toContain("alpha.md");
    expect(corpus[0].sections[0].id).toBe("s1-a");
    expect(corpus[0].expected).toEqual([]);
    expect(corpus[0].recordings).toEqual({});
  });

  it("anonymisedId zero-pads", () => {
    expect(anonymisedId(0)).toBe("P01");
    expect(anonymisedId(11)).toBe("P12");
  });
});
