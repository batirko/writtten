/**
 * Phase 1 acceptance test — hermetic, offline, quota-free.
 *
 * Verifies the core Phase 1 "wow": two blocks with conflicting timeline claims
 * produce a `contradiction` observation. Replays captured Gemini responses from
 * the `contradiction-timeline` ratchet fixture. No network calls are made.
 *
 * This test is also the regression lock for the contradiction mock-mode
 * determinism fix: any reversion to embedding `c.id` (IDB auto-increment) in
 * the prompt breaks the replay hash and this test fails.
 *
 * Fixture: src/services/eval-fixtures/contradiction-timeline.ts
 * (Migrated from docs/acceptance-testing/fixtures/phase1-contradiction.json
 * to the eval-fixtures corpus so it's maintained alongside the ratchet.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFixtureRunner } from "./eval-fixtures/runFixture";
import contradictionTimeline from "./eval-fixtures/contradiction-timeline";

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

vi.mock("../model/gemini", () => ({
  createGeminiRouter: vi.fn(() => ({
    fast: () => {
      throw new Error("[test] Gemini fast reached — mock mode should have intercepted this call");
    },
    strong: () => {
      throw new Error("[test] Gemini strong reached — mock mode should have intercepted this call");
    },
  })),
}));

vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
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

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const runner = createFixtureRunner();

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("Phase 1 acceptance — contradiction, hermetic mock replay", () => {
  beforeEach(() => {
    obsIdCounter = 0;
    vi.clearAllMocks();
    runner.setup(contradictionTimeline);
  });

  afterEach(() => {
    runner.teardown();
  });

  it("produces a contradiction observation when two blocks have conflicting timeline claims", async () => {
    const produced = await runner.run(contradictionTimeline);

    const contradictions = produced.filter((o) => o.type === "contradiction");
    expect(contradictions).toHaveLength(1);

    const con = contradictions[0];
    expect(con.blockId).toBe("block-q3");
    expect(con.conflictingBlockId).toBe("block-q2");
    expect(con.status).toBe("active");
    expect(con.text.toLowerCase()).toContain("q2");

    // Proof that no network calls were made: if gemini had been reached
    // it would have thrown; reaching here proves mock mode served every call.
  });
});
