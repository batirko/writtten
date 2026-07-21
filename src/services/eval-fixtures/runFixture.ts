/**
 * Reusable headless mock-mode fixture runner.
 *
 * Extracted from the pattern in acceptance.phase1.test.ts so every
 * ratchet fixture runs with the same in-memory DB harness instead of
 * copy-pasting the boilerplate.
 *
 * Usage (inside a Vitest test):
 *
 *   import { createFixtureRunner } from "./eval-fixtures/runFixture";
 *   const { run, setup, teardown } = createFixtureRunner();
 *   beforeEach(setup);
 *   afterEach(teardown);
 *   it("...", async () => {
 *     const observations = await run(fixture);
 *     // assert on observations
 *   });
 *
 * Design: docs/projects/evaluator_quality_ratchet.md §Harness: runFixture.ts
 */

import { vi } from "vitest";
import { evaluateSection, evaluateLedgerContradictions } from "../evaluator";
import * as db from "../../store/db";
import { clearAllSnapshots } from "../evalSnapshot";
import {
  loadRecordings,
  setLlmMode,
  clearRecordings,
  dumpRecordings,
  setRecordFillGaps,
} from "../../model/mock";
import type { ClaimLedgerEntry, Observation } from "../../store/db";
import type { ModelCapability } from "../../model/capability";
import type { EvalFixture } from "./types";

/**
 * Capability the fixture corpus runs under.
 *
 * Deliberately *not* `capabilityForTier(...)`: the two flags are pulled apart on
 * purpose.
 *
 *  - `adjudicateConfidently: false` keeps the hedged system prompts, which is what
 *    every recording in the corpus was captured against. Flipping it would change
 *    the prompt text, hence the request hash, hence invalidate all ~29 fixtures.
 *  - `emitContradictions: true` keeps the parsed contradictions bucket flowing, so
 *    the ~20 `contradiction` expectations across the corpus still exercise
 *    anchoring, reconciliation, dedup, priority and routing.
 *
 * The corpus's job is guarding the *deterministic pipeline*; letting the weak-tier
 * product gate silence it here would blind that guard entirely while proving
 * nothing about the gate. The gate is asserted directly instead — see
 * `evaluator.contradictionGate.test.ts`.
 */
const HARNESS_CAPABILITY: ModelCapability = {
  tier: "weak",
  adjudicateConfidently: false,
  driveResolution: false,
  emitContradictions: true,
};

// ---------------------------------------------------------------------------
// Module-level mocks (must be declared at module scope for vi.mock hoisting)
// ---------------------------------------------------------------------------

// These are set up in the TEST FILES that import runFixture — the mocks must
// be declared there. This module provides the RUNTIME implementation logic
// only (the mock implementations that close over the in-memory store).

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/**
 * Per-run knobs shared by `run` / `runLive` / `runRecord`. Additive: every field
 * is optional and defaults to today's behaviour, so existing callers are
 * unaffected. `contradictionCandidates` toggles the evaluator's cross-document
 * candidate-selection bypass (field_validation V3's prefilter A/B) — `"prefilter"`
 * (default) keeps the Jaccard top-10, `"all-pairs"` hands over every candidate.
 */
export interface RunOpts {
  contradictionCandidates?: "prefilter" | "all-pairs";
  /**
   * Override the capability the run executes under. Defaults to
   * `HARNESS_CAPABILITY`. Exists so the weak-tier contradiction gate can be
   * asserted directly (flip `emitContradictions` while holding
   * `adjudicateConfidently: false`, so the hedged prompts — and therefore the
   * recording hashes — are identical across both arms and the *only* variable is
   * the gate). See `evaluator.contradictionGate.test.ts`.
   */
  capability?: ModelCapability;
}

export interface FixtureRunner {
  /** Call in beforeEach to reset state and install recordings. */
  setup(fixture?: EvalFixture): void;
  /** Call in afterEach to reset LLM mode. */
  teardown(): void;
  /**
   * Run a fixture's sections through the evaluator in mock mode (Tier 1).
   * Uses pre-recorded responses — no network calls.
   * Returns the active observations produced (auto_closed/superseded excluded).
   */
  run(fixture: EvalFixture, opts?: RunOpts): Promise<Observation[]>;
  /**
   * Run a `sweep` fixture (Tier 1): seed `seedClaims` straight into the ledger,
   * then run the ledger-internal contradiction sweep in mock mode. Exercises the
   * all-pairs `CONTRADICTION_SWEEP_SYSTEM_PROMPT[_HEDGED]` path that per-section
   * `run` never touches. Returns the active observations produced.
   */
  runSweep(fixture: EvalFixture, opts?: RunOpts): Promise<Observation[]>;
  /**
   * Run a fixture's sections through the evaluator in live mode (Tier 2).
   * Makes real API calls using the provided key.
   * Returns the active observations produced.
   */
  runLive(
    fixture: EvalFixture,
    apiKey: string,
    paidKey?: string,
    opts?: RunOpts
  ): Promise<Observation[]>;
  /**
   * Like `runLive`, but in RECORD mode: makes real API calls AND captures every
   * response into a recordings map, so a real run can be frozen into a fixture
   * and re-scored offline in `mock` mode later (the record/replay batching the
   * V1 corpus study relies on to spend RPD once). Returns both the produced
   * observations and the recordings to persist locally.
   *
   * `opts.seedRecordings` pre-loads a recordings map before the run so cached
   * request hashes are served without a network call (record fills gaps only) —
   * V3's all-pairs arm reuses the prefilter arm's fast-tier recordings and pays
   * RPD only for the differing contradiction calls. Requires the mock layer's
   * fill-gaps record mode (`setRecordFillGaps`).
   */
  runRecord(
    fixture: EvalFixture,
    apiKey: string,
    paidKey?: string,
    opts?: RunOpts & { seedRecordings?: Record<string, string> }
  ): Promise<{ observations: Observation[]; recordings: Record<string, string> }>;
}

/**
 * Create a stateful fixture runner.
 *
 * The caller's test file MUST mock `../../store/db` and `nanoid` at module
 * level (vi.mock) — those hoisted mocks are what this runner's setup/run
 * methods wire up at runtime. See evalRatchet.test.ts for the full pattern.
 */
export function createFixtureRunner(): FixtureRunner {
  const claimsStore: ClaimLedgerEntry[] = [];
  let claimIdCounter = 1;
  const savedObservations: Observation[] = [];
  const supersededIds = new Set<string>();

  function setup(fixture?: EvalFixture): void {
    // Reset state
    claimsStore.length = 0;
    claimIdCounter = 1;
    savedObservations.length = 0;
    supersededIds.clear();
    // The revert-aware snapshot store is module-level (it must survive across
    // evaluateSection calls within a real session), so it does NOT reset with the
    // runner's closure state. Clear it here or a later run that reuses a docId +
    // (membership, text) would "restore" the earlier run's snapshot (whose
    // observation ids no longer exist) and emit nothing. See evalSnapshot.ts.
    clearAllSnapshots();

    clearRecordings();
    if (fixture) loadRecordings(fixture.recordings);
    setLlmMode("mock");

    // Wire DB mock implementations (the vi.mock declarations in the caller's
    // file provide the spy shells; here we fill in the logic).
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    vi.mocked(db.updateObservationStatus).mockImplementation(async (id, status) => {
      if (status === "superseded" || status === "auto_closed") {
        supersededIds.add(id);
      }
    });
    vi.mocked(db.saveBlockSummary).mockResolvedValue(undefined as never);
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
    vi.mocked(db.saveDocEvalState).mockResolvedValue(undefined as never);
    vi.mocked(db.loadDocEvalState).mockResolvedValue(undefined);

    vi.mocked(db.saveClaimsForBlock).mockImplementation(
      async (docId: string, blockId: string, claims, memberBlockIds?: string[]) => {
        // Replace all claims for this block (mirrors real saveClaimsForBlock).
        const without = claimsStore.filter((c) => c.sourceBlockId !== blockId);
        claimsStore.length = 0;
        claimsStore.push(...without);
        for (const c of claims) {
          claimsStore.push({
            ...(c as Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">),
            id: claimIdCounter++,
            docId,
            sourceBlockId: blockId,
            status: "active",
          });
        }
        // Retire stale former-representative claims (mirrors real behavior): any
        // active claim under a current non-representative member is orphaned.
        if (memberBlockIds) {
          const stale = new Set(memberBlockIds.filter((id) => id !== blockId));
          for (const c of claimsStore) {
            if (c.status === "active" && stale.has(c.sourceBlockId)) c.status = "orphaned";
          }
        }
      }
    );

    vi.mocked(db.loadActiveClaimsForDocument).mockImplementation(async () =>
      claimsStore.filter((c) => c.status === "active")
    );

    vi.mocked(db.saveObservation).mockImplementation(async (obsArg) => {
      savedObservations.push(obsArg as Observation);
    });

    // Revert-aware evaluation (Mechanism 2): loadObservation/reactivateObservation
    // back the same in-memory savedObservations array saveObservation writes to,
    // so a restore-from-snapshot path (if a fixture's sections revisit an
    // earlier (membership, text) state) behaves like the real DB would.
    vi.mocked(db.loadObservation).mockImplementation(async (id: string) =>
      savedObservations.find((o) => o.id === id)
    );
    vi.mocked(db.reactivateObservation).mockImplementation(async (id: string) => {
      const obs = savedObservations.find((o) => o.id === id);
      if (obs) {
        obs.status = "active";
        delete obs.closureReason;
        supersededIds.delete(id);
      }
    });
  }

  function teardown(): void {
    setLlmMode("live");
    clearRecordings();
  }

  async function run(fixture: EvalFixture, opts: RunOpts = {}): Promise<Observation[]> {
    // Reset per-run (setup may have been called without a fixture).
    if (fixture.recordings && Object.keys(fixture.recordings).length > 0) {
      loadRecordings(fixture.recordings);
    }

    const docId = `fixture-${fixture.id}`;

    for (const section of fixture.sections) {
      await evaluateSection(
        docId,
        section.id,
        section.text,
        [{ blockId: section.id, text: section.text }],
        fixture.stage,
        "mock-key", // not used in mock mode
        undefined, // no paid key
        fixture.jargonAllowlist,
        false, // skipContradiction
        undefined, // evalId
        opts.capability ?? HARNESS_CAPABILITY, // weak prompts, contradictions still emit
        undefined, // isLive → always-live default
        undefined, // onStageSuggestion
        opts.contradictionCandidates ?? "prefilter"
      );
    }

    // Return only active observations (reconciliation may have superseded some).
    return savedObservations.filter((o) => o.status === "active" && !supersededIds.has(o.id));
  }

  async function runSweep(fixture: EvalFixture, opts: RunOpts = {}): Promise<Observation[]> {
    if (fixture.recordings && Object.keys(fixture.recordings).length > 0) {
      loadRecordings(fixture.recordings);
    }

    const docId = `fixture-${fixture.id}`;

    // Seed claims straight into the ledger (no extraction round-trip). The sweep
    // sorts by text then sourceBlockId, so [Claim #N] indices follow that order.
    claimsStore.length = 0;
    for (const c of fixture.seedClaims ?? []) {
      claimsStore.push({
        id: claimIdCounter++,
        docId,
        sourceBlockId: c.sourceBlockId,
        text: c.text,
        kind: c.kind,
        status: "active",
      });
    }

    await evaluateLedgerContradictions(
      docId,
      fixture.stage,
      "mock-key",
      undefined, // no paid key
      undefined, // evalId
      opts.capability ?? HARNESS_CAPABILITY // weak prompts, contradictions still emit
    );

    return savedObservations.filter((o) => o.status === "active" && !supersededIds.has(o.id));
  }

  async function runLive(
    fixture: EvalFixture,
    apiKey: string,
    paidKey?: string,
    opts: RunOpts = {}
  ): Promise<Observation[]> {
    // Reset per-run
    claimsStore.length = 0;
    claimIdCounter = 1;
    savedObservations.length = 0;
    supersededIds.clear();

    clearRecordings();
    setLlmMode("live");

    const docId = `live-${fixture.id}`;

    for (const section of fixture.sections) {
      await evaluateSection(
        docId,
        section.id,
        section.text,
        [{ blockId: section.id, text: section.text }],
        fixture.stage,
        apiKey,
        paidKey,
        fixture.jargonAllowlist,
        false, // skipContradiction
        undefined, // evalId
        opts.capability ?? HARNESS_CAPABILITY, // weak prompts, contradictions still emit
        undefined, // isLive → always-live default
        undefined, // onStageSuggestion
        opts.contradictionCandidates ?? "prefilter"
      );
    }

    return savedObservations.filter((o) => o.status === "active" && !supersededIds.has(o.id));
  }

  async function runRecord(
    fixture: EvalFixture,
    apiKey: string,
    paidKey?: string,
    opts: RunOpts & { seedRecordings?: Record<string, string> } = {}
  ): Promise<{ observations: Observation[]; recordings: Record<string, string> }> {
    // Reset per-run
    claimsStore.length = 0;
    claimIdCounter = 1;
    savedObservations.length = 0;
    supersededIds.clear();

    clearRecordings();
    // Fill-gaps record: pre-load prior recordings so cached request hashes are
    // served without a network call — only genuinely-new requests hit the model.
    // V3's all-pairs arm seeds the prefilter arm's fast-tier recordings here and
    // pays RPD only for the differing contradiction calls. `setRecordFillGaps`
    // enables cache-first in the router's record branch; it is reset in finally.
    if (opts.seedRecordings) {
      loadRecordings(opts.seedRecordings);
      setRecordFillGaps(true);
    }
    setLlmMode("record"); // real calls AND capture

    const docId = `record-${fixture.id}`;

    try {
      for (const section of fixture.sections) {
        await evaluateSection(
          docId,
          section.id,
          section.text,
          [{ blockId: section.id, text: section.text }],
          fixture.stage,
          apiKey,
          paidKey,
          fixture.jargonAllowlist,
          false, // skipContradiction
          undefined, // evalId
          opts.capability ?? HARNESS_CAPABILITY, // weak prompts, contradictions still emit
          undefined, // isLive → always-live default
          undefined, // onStageSuggestion
          opts.contradictionCandidates ?? "prefilter"
        );
      }
    } finally {
      setRecordFillGaps(false);
    }

    const recordings = dumpRecordings();
    setLlmMode("live"); // leave the shared mode as it was for other callers
    const observations = savedObservations.filter(
      (o) => o.status === "active" && !supersededIds.has(o.id)
    );
    return { observations, recordings };
  }

  return { setup, teardown, run, runSweep, runLive, runRecord };
}
