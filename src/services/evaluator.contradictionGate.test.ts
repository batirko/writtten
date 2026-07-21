/**
 * Weak-tier contradiction gate (`capability.emitContradictions`).
 *
 * The decision rule pre-registered 2026-07-16 (`docs/projects/field_validation.md`
 * § Free-tier signal-quality expectations): if the free tier's contradiction
 * precision stays under the Tier-A floor, the free tier stops presenting
 * contradiction cards. V1 Run 1 measured 2 free-tier contradictions across 9 real
 * documents, both false, against the paid tier's 13.
 *
 * These are the gate's own guards, and they have to exist *here* rather than in
 * the ratchet corpus: the corpus deliberately runs with `emitContradictions: true`
 * (see `runFixture.HARNESS_CAPABILITY`) so its ~20 contradiction expectations keep
 * exercising anchoring/reconciliation/routing. Nothing in that corpus would notice
 * if this gate broke in either direction.
 *
 * Both arms hold `adjudicateConfidently: false`, so the hedged system prompts —
 * and therefore every recorded request hash — are identical across arms. The only
 * variable is the gate. Mock mode: zero network, quota-free.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFixtureRunner } from "./eval-fixtures/runFixture";
import contradictionTimeline from "./eval-fixtures/contradiction-timeline";
import contradictionSweepFidelity from "./eval-fixtures/contradiction-sweep-fidelity";
import { capabilityForTier } from "../model/capability";
import type { ModelCapability } from "../model/capability";
import type { Observation } from "../store/db";

vi.mock("../model/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../model/gemini")>()),
  createGeminiRouter: vi.fn(() => ({
    fast: () => {
      throw new Error("[gate-test] Gemini fast reached — mock mode should intercept");
    },
    strong: () => {
      throw new Error("[gate-test] Gemini strong reached — mock mode should intercept");
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

/** Weak tier as a real keyless user gets it: hedged prompts, gate closed. */
const WEAK_GATED: ModelCapability = {
  tier: "weak",
  adjudicateConfidently: false,
  driveResolution: false,
  emitContradictions: false,
};

/** Same prompts, gate open — isolates the gate as the only variable. */
const WEAK_UNGATED: ModelCapability = { ...WEAK_GATED, emitContradictions: true };

const typesOf = (obs: Observation[]) => obs.map((o) => o.type);

describe("weak-tier contradiction gate", () => {
  beforeEach(() => {
    obsIdCounter = 0;
    runner.setup();
  });
  afterEach(() => runner.teardown());

  async function isolatedRun(capability: ModelCapability): Promise<Observation[]> {
    obsIdCounter = 0;
    vi.clearAllMocks();
    runner.setup();
    return runner.run(contradictionTimeline, { capability });
  }

  async function isolatedSweep(capability: ModelCapability): Promise<Observation[]> {
    obsIdCounter = 0;
    vi.clearAllMocks();
    runner.setup();
    return runner.runSweep(contradictionSweepFidelity, { capability });
  }

  // --- per-section path (evaluator.ts, emitConflict loop) -------------------

  it("drops contradictions on the per-section path when the gate is closed", async () => {
    const ungated = await isolatedRun(WEAK_UNGATED);
    const gated = await isolatedRun(WEAK_GATED);

    // Guard the guard: if the fixture stopped producing a contradiction at all,
    // the gated arm would trivially "pass" while proving nothing.
    expect(typesOf(ungated)).toContain("contradiction");
    expect(typesOf(gated)).not.toContain("contradiction");
  });

  it("leaves every non-contradiction observation untouched", async () => {
    const ungated = await isolatedRun(WEAK_UNGATED);
    const gated = await isolatedRun(WEAK_GATED);

    const others = (obs: Observation[]) =>
      typesOf(obs)
        .filter((t) => t !== "contradiction")
        .sort();

    // The gate must remove contradictions and *only* contradictions — tensions
    // and all span checks are a separate trust class and a separate code path.
    expect(others(gated)).toEqual(others(ungated));
  });

  // --- sweep path (evaluateLedgerContradictions) ----------------------------

  it("drops contradictions on the bulk-paste sweep path when the gate is closed", async () => {
    const ungated = await isolatedSweep(WEAK_UNGATED);
    const gated = await isolatedSweep(WEAK_GATED);

    expect(typesOf(ungated)).toContain("contradiction");
    expect(typesOf(gated)).not.toContain("contradiction");
  });

  it("leaves the sweep's tensions untouched", async () => {
    const ungated = await isolatedSweep(WEAK_UNGATED);
    const gated = await isolatedSweep(WEAK_GATED);

    const tensions = (obs: Observation[]) => typesOf(obs).filter((t) => t === "strategic_tension");
    expect(tensions(gated)).toEqual(tensions(ungated));
  });

  // --- tier policy ----------------------------------------------------------

  it("ties the gate to capability tier: strong emits, weak does not", () => {
    expect(capabilityForTier("strong").emitContradictions).toBe(true);
    expect(capabilityForTier("weak").emitContradictions).toBe(false);
  });

  it("keeps the gate independent of prompt selection", () => {
    // The whole point of the separate field: the eval harness needs hedged
    // prompts (hash stability) *with* contradictions flowing. If these two ever
    // collapse into one flag, the fixture corpus goes dark and nothing notices.
    expect(WEAK_UNGATED.adjudicateConfidently).toBe(false);
    expect(WEAK_UNGATED.emitContradictions).toBe(true);
  });
});
