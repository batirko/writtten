/**
 * V3 — prefilter A/B drop-count scorer (docs/projects/field_validation.md § V3).
 *
 * Pure/offline: `scorePrefilterDrop` diffs the prefilter arm against the all-pairs
 * arm over the same corpus + labels and splits each bucket's miss into
 *   - dropCount            (labels ONLY the all-pairs arm caught → SELECTION cost)
 *   - adjudicationMissCount (labels NEITHER arm caught → adjudication residual)
 * This asserts that split is exhaustive and bucket-scoped. No network, no mocks.
 */

import { describe, it, expect } from "vitest";
import { scorePrefilterDrop, type PerDocRun } from "./evalScorer";
import type { LabelRow } from "./eval-fixtures/corpus/labeling/loadLabels";
import type { Observation } from "../store/db";

/** Minimal conflict observation whose footprint contains both spans. The scorer
 *  reads only type + the textual footprint (message + anchor snapshots), so a
 *  partial cast is enough. */
function conflict(
  type: "contradiction" | "strategic_tension",
  spanA: string,
  spanB: string
): Observation {
  return {
    type,
    text: `Conflict between "${spanA}" and "${spanB}"`,
    anchorText: spanA,
    conflictingAnchorText: spanB,
  } as unknown as Observation;
}

function label(docId: string, bucket: 1 | 2, spanA: string, spanB: string): LabelRow {
  return { docId, bucket, spanA, spanB, rationale: "", verified: true };
}

function run(docId: string, produced: Observation[]): PerDocRun {
  return { docId, produced, sectionTexts: new Map() };
}

describe("scorePrefilterDrop", () => {
  // A canonical corpus:
  //   d1 (B1) — dropped by the prefilter, recovered by all-pairs  → drop
  //   d2 (B1) — caught by BOTH arms                                → neither
  //   d3 (B1) — caught by NEITHER arm                              → adjudication miss
  //   d4 (B2) — dropped by the prefilter, recovered by all-pairs  → drop (tension bucket)
  const labels: LabelRow[] = [
    label("d1", 1, "ships in Q2", "the second quarter launch"),
    label("d2", 1, "20% lift", "twenty percent improvement"),
    label("d3", 1, "opacity 0 to 1", "keyframe fades it out"),
    label("d4", 2, "MPA support matters more", "we focused on SPAs"),
  ];

  const prefilter: PerDocRun[] = [
    run("d1", []), // prefilter crowded the counterpart out
    run("d2", [conflict("contradiction", "20% lift", "twenty percent improvement")]),
    run("d3", []),
    run("d4", []),
  ];
  const allPairs: PerDocRun[] = [
    run("d1", [conflict("contradiction", "ships in Q2", "the second quarter launch")]),
    run("d2", [conflict("contradiction", "20% lift", "twenty percent improvement")]),
    run("d3", []), // even with full context the adjudicator misses it
    run("d4", [conflict("strategic_tension", "MPA support matters more", "we focused on SPAs")]),
  ];

  const result = scorePrefilterDrop(prefilter, allPairs, labels, { verifiedOnly: true });

  it("counts a pair only the all-pairs arm catches as a prefilter drop (B1)", () => {
    const b1 = result.strictContradiction;
    expect(b1.totalLabels).toBe(3);
    expect(b1.prefilterMatched).toBe(1); // only d2
    expect(b1.allPairsMatched).toBe(2); // d1 + d2
    expect(b1.dropCount).toBe(1); // d1
    expect(b1.droppedLabels.map((l) => l.docId)).toEqual(["d1"]);
  });

  it("counts a pair neither arm catches as an adjudication miss, not a drop (B1)", () => {
    const b1 = result.strictContradiction;
    expect(b1.adjudicationMissCount).toBe(1); // d3
    // The split is exhaustive: matched + dropped + adjudication-miss = total.
    expect(b1.prefilterMatched + b1.dropCount + b1.adjudicationMissCount).toBe(b1.totalLabels);
  });

  it("scores the tension bucket separately (B2 drop does not leak into B1)", () => {
    const b2 = result.tension;
    expect(b2.totalLabels).toBe(1);
    expect(b2.prefilterMatched).toBe(0);
    expect(b2.allPairsMatched).toBe(1);
    expect(b2.dropCount).toBe(1); // d4
    expect(result.strictContradiction.dropCount).toBe(1); // unchanged by d4
  });

  it("reports zero drop when both arms catch the same labels", () => {
    const same: PerDocRun[] = [
      run("d1", [conflict("contradiction", "ships in Q2", "the second quarter launch")]),
    ];
    const r = scorePrefilterDrop(same, same, [labels[0]], { verifiedOnly: true });
    expect(r.strictContradiction.prefilterMatched).toBe(1);
    expect(r.strictContradiction.dropCount).toBe(0);
    expect(r.strictContradiction.adjudicationMissCount).toBe(0);
  });

  it("honours the greedy one-observation-per-label rule (no double credit)", () => {
    // Two labels in one doc, but the all-pairs arm produced only ONE matching obs.
    const twoLabels: LabelRow[] = [
      label("d5", 1, "alpha", "beta"),
      label("d5", 1, "alpha", "gamma"),
    ];
    // The single obs matches label #1 (alpha/beta). Label #2 (alpha/gamma) needs
    // "gamma" in the footprint, which this obs lacks → only one label caught.
    const ap: PerDocRun[] = [run("d5", [conflict("contradiction", "alpha", "beta")])];
    const pf: PerDocRun[] = [run("d5", [])];
    const r = scorePrefilterDrop(pf, ap, twoLabels, { verifiedOnly: true });
    expect(r.strictContradiction.allPairsMatched).toBe(1);
    expect(r.strictContradiction.dropCount).toBe(1);
    expect(r.strictContradiction.adjudicationMissCount).toBe(1);
  });

  it("verifiedOnly excludes unverified labels from the denominator", () => {
    const withDraft: LabelRow[] = [
      { ...label("d6", 1, "one", "uno"), verified: false },
    ];
    const r = scorePrefilterDrop([run("d6", [])], [run("d6", [])], withDraft, {
      verifiedOnly: true,
    });
    expect(r.strictContradiction.totalLabels).toBe(0);
  });
});
