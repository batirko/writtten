/**
 * Phase 1 acceptance test — hermetic, offline, quota-free.
 *
 * Verifies the core Phase 1 "wow": two blocks with conflicting timeline claims
 * produce a `contradiction` observation, replaying captured Gemini responses
 * from a fixture file. No network calls are made — the gemini router is mocked
 * to throw if reached, proving the `factory.ts` mock-mode branch handles every
 * call via `mock.ts` recordings.
 *
 * This test is also the regression lock for the contradiction mock-mode
 * determinism fix (evaluator.ts): any reversion to embedding `c.id` (IDB
 * auto-increment) in the prompt breaks the replay hash → this test fails.
 *
 * Fixture: docs/acceptance-testing/fixtures/phase1-contradiction.json
 * Recorded: 2026-06-01 after the index+sort determinism fix landed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluateBlock } from "./evaluator";
import * as db from "../store/db";
import { loadRecordings, setLlmMode } from "../model/mock";
import type { ClaimLedgerEntry, Observation } from "../store/db";

// ---------------------------------------------------------------------------
// Load the recorded fixture
// ---------------------------------------------------------------------------
import fixture from "../../docs/acceptance-testing/fixtures/phase1-contradiction.json";

// ---------------------------------------------------------------------------
// Mock gemini — throws if reached, proving zero network in mock mode.
// The real factory.ts wrap() + mock.ts replay() handle every call.
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

// ---------------------------------------------------------------------------
// Mock nanoid — stable ids for assertions
// ---------------------------------------------------------------------------
let obsIdCounter = 0;
vi.mock("nanoid", () => ({ nanoid: () => `obs-${++obsIdCounter}` }));

// ---------------------------------------------------------------------------
// In-memory DB stub — stateful enough to model two sequential block evals.
//
// The existing evaluator.test.ts stub returns [] for loadActiveClaimsForDocument,
// which cannot model block-2 seeing block-1's claim.  This stub accumulates
// claims written by saveClaimsForBlock and serves them back, replicating what
// IndexedDB does in the real app.
// ---------------------------------------------------------------------------
const claimsStore: ClaimLedgerEntry[] = [];
let claimIdCounter = 1;
const savedObservations: Observation[] = [];

vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
  saveObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(),
  updateObservationStatus: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("Phase 1 acceptance — contradiction, hermetic mock replay", () => {
  const docId = "test-doc";

  beforeEach(() => {
    vi.clearAllMocks();
    obsIdCounter = 0;
    claimsStore.length = 0;
    claimIdCounter = 1;
    savedObservations.length = 0;

    // Install the Phase 1 fixture recordings
    loadRecordings(fixture.recordings as Record<string, string>);
    setLlmMode("mock");

    // DB stub implementations — wired at runtime so they can close over claimsStore
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    vi.mocked(db.updateObservationStatus).mockResolvedValue(undefined as never);
    vi.mocked(db.saveBlockSummary).mockResolvedValue(undefined as never);

    vi.mocked(db.saveClaimsForBlock).mockImplementation(
      async (dId: string, blockId: string, claims) => {
        // Replace all claims for this block (mirrors real saveClaimsForBlock behaviour)
        const without = claimsStore.filter((c) => c.sourceBlockId !== blockId);
        claimsStore.length = 0;
        claimsStore.push(...without);
        for (const c of claims) {
          claimsStore.push({
            ...(c as Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">),
            id: claimIdCounter++,
            docId: dId,
            sourceBlockId: blockId,
            status: "active",
          });
        }
      },
    );

    vi.mocked(db.loadActiveClaimsForDocument).mockImplementation(async () => [...claimsStore]);

    vi.mocked(db.saveObservation).mockImplementation(async (obs) => {
      savedObservations.push(obs as Observation);
    });
  });

  afterEach(() => {
    setLlmMode("live");
  });

  it("produces a contradiction observation when two blocks have conflicting timeline claims", async () => {
    const [q2Block, q3Block] = fixture.doc.blocks;
    const q2Id = "block-q2";
    const q3Id = "block-q3";
    const apiKey = "mock-key-unused-in-mock-mode";

    // Evaluate Q2 first so its claim is in the ledger when Q3 is checked.
    await evaluateBlock(docId, q2Id, q2Block.text, undefined, apiKey);
    await evaluateBlock(docId, q3Id, q3Block.text, undefined, apiKey);

    // --- Ledger check: both claims persisted ---
    expect(claimsStore).toHaveLength(2);
    expect(claimsStore.map((c) => c.text).sort()).toEqual([
      "This will ship in Q3.",
      "We'll launch this in Q2.",
    ]);

    // --- Observation check: a contradiction fired ---
    const contradictions = savedObservations.filter((o) => o.type === "contradiction");
    expect(contradictions).toHaveLength(1);

    const con = contradictions[0];
    expect(con.type).toBe("contradiction");
    expect(con.blockId).toBe(q3Id);                    // fired on the Q3 block (the new claim)
    expect(con.conflictingBlockId).toBe(q2Id);          // references the Q2 block
    expect(con.status).toBe("active");
    expect(con.text).toContain("Q2");                   // message mentions Q2

    // --- Proof that no network calls were made ---
    // If gemini had been reached it would have thrown; the test reaching here
    // proves the factory served every call from the recordings map.
  });
});
