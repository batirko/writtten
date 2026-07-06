import { describe, it, expect } from "vitest";
import {
  scoreCorpusRecall,
  scoreWildPrecision,
  stratifyRecall,
  stratifyWildPrecision,
  diffTierRuns,
  unlabeledContradictions,
  observationMatchesLabel,
  type PerDocRun,
} from "./evalScorer";
import type { LabelRow, EmissionRow } from "./eval-fixtures/corpus/labeling/loadLabels";
import type { Observation } from "../store/db";

/** Minimal Observation factory — only the fields the corpus scorers read. */
function obs(over: Partial<Observation>): Observation {
  return {
    id: Math.random().toString(36).slice(2),
    docId: "P01",
    type: "contradiction",
    scope: "span",
    kind: "problem",
    severity: "medium",
    confidence: "medium",
    priority: 0,
    text: "",
    status: "active",
    ...over,
  };
}

function label(over: Partial<LabelRow>): LabelRow {
  return {
    docId: "P01",
    bucket: 1,
    spanA: "",
    spanB: "",
    rationale: "",
    verified: true,
    ...over,
  };
}

describe("scoreCorpusRecall", () => {
  const sectionTexts = new Map([
    ["s2", "The feature ships in Q2 to hit the launch window."],
    ["s5", "Final launch is slated for Q3 after the beta."],
  ]);
  const perDoc: PerDocRun[] = [
    {
      docId: "P01",
      sectionTexts,
      produced: [
        obs({
          type: "contradiction",
          blockId: "s2",
          conflictingBlockId: "s5",
          text: "The Q2 ship date conflicts with the Q3 launch stated later.",
        }),
      ],
    },
    { docId: "P02", sectionTexts: new Map(), produced: [] }, // zero-label, zero-emission doc
  ];

  it("matches a contradiction pair on footprint and reports per-bucket recall + base rate", () => {
    const labels = [
      label({ docId: "P01", bucket: 1, spanA: "ships in Q2", spanB: "launch is slated for Q3" }),
      label({ docId: "P02", bucket: 1, spanA: "unmatched", spanB: "also unmatched" }),
      label({ docId: "P01", bucket: 2, spanA: "no tension obs produced", spanB: "so this misses" }),
    ];
    const r = scoreCorpusRecall(perDoc, labels);

    expect(r.docCount).toBe(2);
    // Bucket 1: 2 labels over 2 docs → base rate 1.0/doc; 1 caught → recall 0.5.
    expect(r.strictContradiction.totalLabels).toBe(2);
    expect(r.strictContradiction.baseRatePerDoc).toBe(1);
    expect(r.strictContradiction.matched).toBe(1);
    expect(r.strictContradiction.recall).toBe(0.5);
    expect(r.strictContradiction.missed).toHaveLength(1);
    expect(r.strictContradiction.missed[0].docId).toBe("P02");

    // Bucket 2: 1 label, uncaught.
    expect(r.tension.totalLabels).toBe(1);
    expect(r.tension.matched).toBe(0);
    expect(r.tension.recall).toBe(0);
  });

  it("requires the observation type to line up with the bucket", () => {
    const tensionObs = obs({
      type: "strategic_tension",
      blockId: "s2",
      conflictingBlockId: "s5",
      text: "Q2 ship date sits in tension with the Q3 launch.",
    });
    // A Bucket-1 (contradiction) label must NOT be satisfied by a strategic_tension obs.
    const l = label({ bucket: 1, spanA: "ships in Q2", spanB: "launch is slated for Q3" });
    expect(observationMatchesLabel(tensionObs, l, sectionTexts)).toBe(false);
    // …but a Bucket-2 label is.
    expect(observationMatchesLabel(tensionObs, { ...l, bucket: 2 }, sectionTexts)).toBe(true);
  });

  it("verifiedOnly excludes draft labels", () => {
    const labels = [
      label({ bucket: 1, spanA: "ships in Q2", spanB: "launch is slated for Q3", verified: false }),
    ];
    const r = scoreCorpusRecall(perDoc, labels, { verifiedOnly: true });
    expect(r.strictContradiction.totalLabels).toBe(0);
    expect(Number.isNaN(r.strictContradiction.recall)).toBe(true);
  });

  it("uses each produced observation for at most one label (greedy)", () => {
    const labels = [
      label({ spanA: "ships in Q2", spanB: "launch is slated for Q3" }),
      label({ spanA: "ships in Q2", spanB: "launch is slated for Q3" }), // duplicate label
    ];
    const r = scoreCorpusRecall(perDoc, labels);
    // Only one contradiction obs exists → second duplicate label is a miss.
    expect(r.strictContradiction.matched).toBe(1);
    expect(r.strictContradiction.missed).toHaveLength(1);
  });
});

describe("scoreWildPrecision", () => {
  it("computes per-type precision against floors and surfaces uncovered types", () => {
    const emissions: EmissionRow[] = [
      {
        docId: "P01",
        type: "contradiction",
        anchoredSpan: "",
        message: "",
        verdict: "tp",
        verified: true,
      },
      {
        docId: "P01",
        type: "contradiction",
        anchoredSpan: "",
        message: "",
        verdict: "fp",
        verified: true,
      },
      {
        docId: "P02",
        type: "clarity",
        anchoredSpan: "",
        message: "",
        verdict: "tp",
        verified: true,
      },
    ];
    const r = scoreWildPrecision(emissions);
    const contradiction = r.perType.find((t) => t.type === "contradiction")!;
    expect(contradiction.n).toBe(2);
    expect(contradiction.precision).toBe(0.5);
    expect(contradiction.floor).toBe(0.95);
    expect(contradiction.meetsFloor).toBe(false);

    const clarity = r.perType.find((t) => t.type === "clarity")!;
    expect(clarity.precision).toBe(1);
    expect(clarity.meetsFloor).toBe(true);

    // A type never emitted is present with n=0 and meetsFloor null (coverage gap).
    const missing = r.perType.find((t) => t.type === "missing_topic")!;
    expect(missing.n).toBe(0);
    expect(missing.meetsFloor).toBeNull();

    expect(r.overall.tp).toBe(2);
    expect(r.overall.fp).toBe(1);
  });

  it("verifiedOnly drops unverified draft verdicts", () => {
    const emissions: EmissionRow[] = [
      {
        docId: "P01",
        type: "clarity",
        anchoredSpan: "",
        message: "",
        verdict: "fp",
        verified: false,
      },
    ];
    expect(scoreWildPrecision(emissions, { verifiedOnly: true }).overall.tp).toBe(0);
    expect(
      scoreWildPrecision(emissions, { verifiedOnly: true }).perType.find(
        (t) => t.type === "clarity"
      )!.n
    ).toBe(0);
  });
});

describe("diffTierRuns", () => {
  it("diffs conflict emissions by stable block-pair identity across tiers", () => {
    const shared = () => ({ blockId: "s2", conflictingBlockId: "s5" });
    const free = [
      obs({ type: "contradiction", ...shared(), text: "free wording" }),
      obs({
        type: "contradiction",
        blockId: "s1",
        conflictingBlockId: "s9",
        text: "free-only fabrication",
      }),
    ];
    const paid = [
      obs({ type: "contradiction", ...shared(), text: "paid wording (same pair)" }),
      obs({
        type: "strategic_tension",
        blockId: "s3",
        conflictingBlockId: "s7",
        text: "paid-only tension",
      }),
    ];
    const d = diffTierRuns(free, paid);
    expect(d.sharedContradictions).toBe(1); // s2|s5 present in both despite different wording
    expect(d.freeOnlyContradictions).toHaveLength(1);
    expect(d.freeOnlyContradictions[0].text).toContain("fabrication");
    expect(d.paidOnlyTensions).toHaveLength(1);
    expect(d.paidOnlyContradictions).toHaveLength(0);
  });
});

describe("unlabeledContradictions", () => {
  it("flags free-tier contradictions with no matching Bucket-1 label (confident-false)", () => {
    const run: PerDocRun = {
      docId: "P01",
      sectionTexts: new Map([
        ["s2", "The feature ships in Q2."],
        ["s5", "Launch is slated for Q3."],
        ["s8", "Pricing is undecided."],
      ]),
      produced: [
        obs({
          type: "contradiction",
          blockId: "s2",
          conflictingBlockId: "s5",
          text: "Q2 vs Q3 ship dates",
        }),
        obs({
          type: "contradiction",
          blockId: "s8",
          conflictingBlockId: "s2",
          text: "invented pricing conflict",
        }),
      ],
    };
    const labels = [
      label({ docId: "P01", bucket: 1, spanA: "ships in Q2", spanB: "slated for Q3" }),
    ];
    const bogus = unlabeledContradictions(run, labels);
    expect(bogus).toHaveLength(1);
    expect(bogus[0].text).toContain("invented");
  });
});

describe("stratifyRecall", () => {
  const specTexts = new Map([
    ["s2", "The feature ships in Q2."],
    ["s5", "Launch is slated for Q3."],
  ]);
  const perDoc: PerDocRun[] = [
    {
      docId: "P01",
      docType: "spec",
      sectionTexts: specTexts,
      produced: [
        obs({ type: "contradiction", blockId: "s2", conflictingBlockId: "s5", text: "Q2 vs Q3" }),
      ],
    },
    { docId: "P02", docType: "spec", sectionTexts: new Map(), produced: [] },
    { docId: "P03", docType: "comms", sectionTexts: new Map(), produced: [] },
  ];

  it("slices recall + base rate per doc type without cross-type bleed", () => {
    const labels = [
      label({ docId: "P01", bucket: 1, spanA: "ships in Q2", spanB: "slated for Q3" }),
      label({ docId: "P02", bucket: 1, spanA: "x", spanB: "y" }),
    ];
    const s = stratifyRecall(perDoc, labels);

    // Overall: 3 docs, 2 B1 labels → base rate 0.67/doc, 1 caught → 50% recall.
    expect(s.all.docCount).toBe(3);
    expect(s.all.strictContradiction.baseRatePerDoc).toBeCloseTo(2 / 3);
    expect(s.all.strictContradiction.recall).toBe(0.5);

    // spec slice: 2 docs, both labels (they belong to spec docs) → base rate 1.0/doc.
    expect(s.byType.spec!.docCount).toBe(2);
    expect(s.byType.spec!.strictContradiction.totalLabels).toBe(2);
    expect(s.byType.spec!.strictContradiction.baseRatePerDoc).toBe(1);
    expect(s.byType.spec!.strictContradiction.recall).toBe(0.5);

    // comms slice: 1 doc, 0 labels → base rate 0, recall NaN (no bleed from spec).
    expect(s.byType.comms!.docCount).toBe(1);
    expect(s.byType.comms!.strictContradiction.totalLabels).toBe(0);
    expect(Number.isNaN(s.byType.comms!.strictContradiction.recall)).toBe(true);

    // No prd/decision docs → those slices absent.
    expect(s.byType.prd).toBeUndefined();
    expect(s.byType.decision).toBeUndefined();
  });
});

describe("stratifyWildPrecision", () => {
  it("slices per-type precision by the emission's doc type", () => {
    const emissions: EmissionRow[] = [
      {
        docId: "P01",
        docType: "spec",
        type: "audience_mismatch",
        anchoredSpan: "",
        message: "",
        verdict: "fp",
        verified: true,
      },
      {
        docId: "P03",
        docType: "comms",
        type: "audience_mismatch",
        anchoredSpan: "",
        message: "",
        verdict: "tp",
        verified: true,
      },
      {
        docId: "P03",
        docType: "comms",
        type: "audience_mismatch",
        anchoredSpan: "",
        message: "",
        verdict: "tp",
        verified: true,
      },
    ];
    const s = stratifyWildPrecision(emissions);

    // Overall audience_mismatch: 2 tp / 3 → 67% (the aggregate hides the split).
    const allAM = s.all.perType.find((t) => t.type === "audience_mismatch")!;
    expect(allAM.n).toBe(3);
    expect(allAM.precision).toBeCloseTo(2 / 3);

    // comms: precise (2/2); spec: noisy (0/1) — the register split the aggregate hides.
    expect(s.byType.comms!.perType.find((t) => t.type === "audience_mismatch")!.precision).toBe(1);
    expect(s.byType.spec!.perType.find((t) => t.type === "audience_mismatch")!.precision).toBe(0);
    expect(s.byType.prd).toBeUndefined();
  });
});
