/**
 * V3 — contradiction candidate-selection bypass seam (field_validation.md § V3).
 *
 * The evaluator gained an additive `contradictionCandidates: "prefilter" |
 * "all-pairs"` parameter (evaluator.ts) so the prefilter A/B can bypass the
 * Jaccard top-10 candidate selection. This guards two invariants:
 *
 *   1. DEFAULT-PATH IDENTITY — omitting the flag and passing "prefilter"
 *      explicitly produce byte-identical observations for EVERY seed fixture, so
 *      no recorded contradiction-prompt hash shifts (the whole-suite `npm test`
 *      replay is the belt; this is the braces, and it localises a regression to
 *      this seam).
 *   2. ALL-PAIRS IS A NO-OP WHEN THE PREFILTER ISN'T TRUNCATING — on the small
 *      seed fixtures (≤10 candidate claims) the bypass sees the same candidate
 *      set, so it must reproduce the prefilter arm exactly AND flow through
 *      without a mock-miss (proving the seam is wired, not silently swallowed).
 *
 * Runs in mock mode against the recorded fixtures — zero network, quota-free.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFixtureRunner } from "./eval-fixtures/runFixture";
import { corpus } from "./eval-fixtures/index";
import type { Observation } from "../store/db";

vi.mock("../model/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../model/gemini")>()),
  createGeminiRouter: vi.fn(() => ({
    fast: () => {
      throw new Error("[bypass-test] Gemini fast reached — mock mode should intercept");
    },
    strong: () => {
      throw new Error("[bypass-test] Gemini strong reached — mock mode should intercept");
    },
  })),
}));

vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
  loadBlockSummariesForDocument: vi.fn(async () => []),
  saveObservation: vi.fn(),
  loadObservation: vi.fn(),
  reactivateObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(),
  updateObservationStatus: vi.fn(),
  loadSuppressionsForDocument: vi.fn(async () => []),
  saveDocEvalState: vi.fn(),
  loadDocEvalState: vi.fn(async () => undefined),
}));

let obsIdCounter = 0;
vi.mock("nanoid", () => ({ nanoid: () => `obs-${++obsIdCounter}` }));

const runner = createFixtureRunner();

/** A stable, id-free signature of an observation (nanoid ids differ per run). */
function sig(obs: Observation[]): string {
  return obs
    .map((o) =>
      [
        o.type,
        o.blockId ?? "",
        o.conflictingBlockId ?? "",
        o.startOffset ?? "",
        o.endOffset ?? "",
        o.anchorText ?? "",
        o.text,
      ].join("|")
    )
    .sort()
    .join("\n");
}

describe("contradiction candidate-selection bypass", () => {
  beforeEach(() => {
    obsIdCounter = 0;
    runner.setup();
  });
  afterEach(() => runner.teardown());

  // `run` accumulates into the shared in-memory store, so reset before each run
  // to get an isolated slate (mirrors the ratchet's beforeEach: clear mock call
  // history, then re-wire the runner — the one-run-per-setup contract).
  async function isolatedRun(
    fixture: (typeof corpus)[number],
    opts?: { contradictionCandidates: "prefilter" | "all-pairs" }
  ): Promise<Observation[]> {
    obsIdCounter = 0;
    vi.clearAllMocks();
    runner.setup();
    return runner.run(fixture, opts);
  }

  it("default path is byte-identical to explicit 'prefilter' for every fixture", async () => {
    for (const fixture of corpus) {
      const def = sig(await isolatedRun(fixture));
      const explicit = sig(await isolatedRun(fixture, { contradictionCandidates: "prefilter" }));
      expect(explicit, `fixture ${fixture.id} shifted under explicit prefilter`).toBe(def);
    }
  });

  it("all-pairs bypass reproduces the prefilter arm on the contradiction fixtures", async () => {
    // These seed fixtures carry far fewer than 10 candidate claims, so the
    // Jaccard prefilter is already a no-op — the bypass must land on the same
    // recorded contradiction call (same hash) and emit the same observations.
    // Per-section contradiction fixtures only (the sweep fixture has empty
    // `sections` and runs a different path — `runSweep`, not `run`).
    const contradictionFixtures = corpus.filter(
      (f) => f.id.startsWith("contradiction") && f.sections.length > 0
    );
    expect(contradictionFixtures.length).toBeGreaterThan(0);
    for (const fixture of contradictionFixtures) {
      const prefilter = sig(await isolatedRun(fixture, { contradictionCandidates: "prefilter" }));
      const allPairs = sig(await isolatedRun(fixture, { contradictionCandidates: "all-pairs" }));
      expect(allPairs, `fixture ${fixture.id} diverged under all-pairs`).toBe(prefilter);
      // And the fixture actually produces a contradiction (guards against a
      // vacuous "both empty" pass hiding a swallowed mock-miss).
      expect(prefilter).toContain("contradiction");
    }
  });
});
