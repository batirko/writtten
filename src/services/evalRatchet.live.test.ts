/**
 * Tier 2 — Opt-in live prompt-quality scorer.
 *
 * Runs the real LLM prompts against the seed corpus and computes per-type
 * precision/recall. This is the actual "is the prompt better/worse?" check
 * and doubles as the SkillOpt data exporter.
 *
 * Skipped by default (no network calls, no quota burn in CI).
 * Activate with: EVAL_LIVE=1 npm run eval:live
 *
 * Requires: VITE_GEMINI_API_KEY in .env.local
 *
 * Output: per-fixture and aggregate scorecard printed via console.table.
 * Asserts **per-type precision floors** keyed to trust cost (Tier A contradiction
 * ≥ 0.95 … Tier D soft opportunities ≥ 0.70 — see evalScorer.PRECISION_FLOORS) so
 * a false contradiction fails the run even when cheap nits keep the aggregate high.
 * A type with no predictions in the corpus is logged and skipped (never silently
 * passed). Recall stays a single aggregate soft-floor (AGGREGATE_RECALL_FLOOR).
 *
 * `knownGaps` are reported as documented misses/FPs but do NOT count against
 * the score until the prompt fix lands and they move to `expected`.
 *
 * Design: docs/projects/evaluator_quality_ratchet.md § Phase 6 (per-type floors)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scoreObservations,
  precisionFloorForType,
  PRECISION_FLOORS,
  AGGREGATE_RECALL_FLOOR,
  type ScoreResult,
} from "./evalScorer";
import { createFixtureRunner } from "./eval-fixtures/runFixture";
import { corpus } from "./eval-fixtures/index";
import type { EvalFixture } from "./eval-fixtures/types";
import type { Observation } from "../store/db";

// ---------------------------------------------------------------------------
// Skip entirely if EVAL_LIVE is not set
// ---------------------------------------------------------------------------
const LIVE = !!process.env.EVAL_LIVE;

// ---------------------------------------------------------------------------
// Module-level mocks
// NOTE: In live mode we do NOT mock gemini — real calls go through.
// We still mock the DB (IndexedDB not available in Node/Vitest).
// ---------------------------------------------------------------------------
vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
  saveObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(),
  updateObservationStatus: vi.fn(),
  loadSuppressionsForDocument: vi.fn(async () => []),
  saveDocEvalState: vi.fn(),
  loadDocEvalState: vi.fn(async () => undefined),
}));

vi.mock("nanoid", () => ({ nanoid: () => `obs-${Math.random().toString(36).slice(2, 7)}` }));

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
const runner = createFixtureRunner();

// ---------------------------------------------------------------------------
// Per-type aggregation
// ---------------------------------------------------------------------------
interface TypeScore {
  tp: number;
  fp: number;
  fn: number;
}

function mergeTypeScores(
  acc: Map<string, TypeScore>,
  result: ScoreResult,
  fixture: EvalFixture
): void {
  // True positives
  for (const { produced } of result.truePositives) {
    const k = produced.type;
    const s = acc.get(k) ?? { tp: 0, fp: 0, fn: 0 };
    s.tp++;
    acc.set(k, s);
  }
  // False positives — exclude if this obs type+section+substring matches a knownGap
  for (const fp of result.falsePositives) {
    const isKnownGap = (fixture.knownGaps ?? []).some(
      (g) => g.type === fp.type && (g.sectionId === undefined || g.sectionId === fp.blockId)
    );
    if (!isKnownGap) {
      const k = fp.type;
      const s = acc.get(k) ?? { tp: 0, fp: 0, fn: 0 };
      s.fp++;
      acc.set(k, s);
    }
  }
  // False negatives — exclude if this expected obs is a knownGap
  for (const fn_ of result.falseNegatives) {
    const isKnownGap = (fixture.knownGaps ?? []).some(
      (g) => g.type === fn_.type && (g.sectionId === undefined || g.sectionId === fn_.sectionId)
    );
    if (!isKnownGap) {
      const k = fn_.type;
      const s = acc.get(k) ?? { tp: 0, fp: 0, fn: 0 };
      s.fn++;
      acc.set(k, s);
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe.skipIf(!LIVE)("Evaluator quality ratchet — Tier 2 (live prompt scorer)", () => {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  const allResults: { fixture: EvalFixture; result: ScoreResult; produced: Observation[] }[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    runner.setup(); // no recordings — live mode
  });

  afterEach(() => {
    runner.teardown();
  });

  for (const fixture of corpus) {
    it(`live: ${fixture.id} — ${fixture.description}`, async () => {
      if (!apiKey) throw new Error("VITE_GEMINI_API_KEY not set");

      // Run in live mode (no recordings installed → real API calls)
      const produced = await runner.runLive(fixture, apiKey);

      const sectionTexts = new Map(fixture.sections.map((s) => [s.id, s.text]));

      const result = scoreObservations(fixture.id, produced, fixture.expected, sectionTexts);

      allResults.push({ fixture, result, produced });

      // Log known gaps
      const gaps = fixture.knownGaps ?? [];
      if (gaps.length > 0) {
        console.log(`\n[${fixture.id}] Known gaps (tracked, not asserted):`);
        for (const g of gaps) {
          const misses = result.falseNegatives.filter(
            (fn_) =>
              fn_.type === g.type && (g.sectionId === undefined || g.sectionId === fn_.sectionId)
          );
          const fires = result.falsePositives.filter(
            (fp) => fp.type === g.type && (g.sectionId === undefined || g.sectionId === fp.blockId)
          );
          const status =
            misses.length > 0
              ? "❌ still misses"
              : fires.length > 0
                ? "⚠️  still FPs"
                : "✅ resolved";
          console.log(
            `  ${status}: ${g.type}${g.sectionId ? `@${g.sectionId}` : ""} — ${g.note ?? ""}`
          );
        }
      }
    }, 90_000); // 90s timeout for live API
  }

  // Print aggregate scorecard after all tests run
  it("scorecard summary", async () => {
    if (allResults.length === 0) return; // no fixtures ran

    const typeScores = new Map<string, TypeScore>();
    for (const { fixture, result } of allResults) {
      mergeTypeScores(typeScores, result, fixture);
    }

    // Build scorecard table
    const rows = [...typeScores.entries()].map(([type, s]) => ({
      type,
      tp: s.tp,
      fp: s.fp,
      fn: s.fn,
      precision: s.tp + s.fp === 0 ? "-" : ((s.tp / (s.tp + s.fp)) * 100).toFixed(0) + "%",
      recall: s.tp + s.fn === 0 ? "-" : ((s.tp / (s.tp + s.fn)) * 100).toFixed(0) + "%",
    }));

    console.log("\n=== Evaluator quality ratchet — Tier 2 scorecard ===");
    console.table(rows);

    // Per-fixture precision/recall
    const fixtureRows = allResults.map(({ result }) => ({
      fixture: result.fixture,
      tp: result.truePositives.length,
      fp: result.falsePositives.length,
      fn: result.falseNegatives.length,
      precision: Number.isNaN(result.precision) ? "N/A" : (result.precision * 100).toFixed(0) + "%",
      recall: Number.isNaN(result.recall) ? "N/A" : (result.recall * 100).toFixed(0) + "%",
    }));
    console.log("\nPer-fixture:");
    console.table(fixtureRows);

    // --- Per-type precision floors (trust-cost tiered) ----------------------
    // Replaces the old single aggregate-precision assert. Each type is checked
    // against its tier floor ONLY when it has predictions (tp+fp>0) in the
    // current corpus; a type with no coverage is logged and skipped so the gate
    // never silently "passes" a type it never exercised. Iterate over ALL floor
    // types (not just those that appeared) so coverage gaps are visible.
    const allTypes = Object.keys(PRECISION_FLOORS) as Observation["type"][];
    const floorChecks = allTypes.map((type) => {
      const s = typeScores.get(type) ?? { tp: 0, fp: 0, fn: 0 };
      const predictions = s.tp + s.fp;
      const precision = predictions === 0 ? NaN : s.tp / predictions;
      const floor = precisionFloorForType(type);
      return { type, predictions, precision, floor };
    });

    console.log("\n=== Per-type precision floors (Tier-2 gate) ===");
    console.table(
      floorChecks.map((r) => ({
        type: r.type,
        n: r.predictions,
        precision: Number.isNaN(r.precision) ? "-" : (r.precision * 100).toFixed(0) + "%",
        floor: (r.floor * 100).toFixed(0) + "%",
        status: Number.isNaN(r.precision)
          ? "— skipped (n=0)"
          : r.precision >= r.floor
            ? "✅ pass"
            : "❌ FAIL",
      }))
    );

    const uncovered = floorChecks.filter((r) => r.predictions === 0).map((r) => r.type);
    if (uncovered.length > 0) {
      console.log(
        `\n⚠️  No corpus coverage (floor not asserted) for: ${uncovered.join(", ")}. ` +
          `Grow the corpus (npm run eval:record) so these tiers gain teeth.`
      );
    }

    // Aggregate recall stays a soft-floor (recall is aggregate, not per-type).
    const totalTp = [...typeScores.values()].reduce((s, v) => s + v.tp, 0);
    const totalFn = [...typeScores.values()].reduce((s, v) => s + v.fn, 0);
    const aggRecall = totalTp + totalFn === 0 ? 1 : totalTp / (totalTp + totalFn);
    console.log(`\nAggregate recall: ${(aggRecall * 100).toFixed(1)}%`);

    // Assert each covered type against its tier floor.
    for (const r of floorChecks) {
      if (r.predictions === 0) continue; // no predictions → precision undefined → can't assert
      expect(
        r.precision,
        `${r.type} precision (${(r.precision * 100).toFixed(1)}%, n=${r.predictions}) below tier floor ${(r.floor * 100).toFixed(0)}%`
      ).toBeGreaterThanOrEqual(r.floor);
    }

    // Soft aggregate-recall floor — fail if the feed starts missing real issues.
    expect(
      aggRecall,
      `aggregate recall (${(aggRecall * 100).toFixed(1)}%) below floor ${(AGGREGATE_RECALL_FLOOR * 100).toFixed(0)}%`
    ).toBeGreaterThanOrEqual(AGGREGATE_RECALL_FLOOR);
  }, 5_000);
});
