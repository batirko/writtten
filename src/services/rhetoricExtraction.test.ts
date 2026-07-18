/**
 * OBS-037 Lever 1 — claim-level assertion for the rhetoric-extraction fixture.
 *
 * The Tier-1 ratchet (evalRatchet.test.ts) only scores OBSERVATIONS, so it can't
 * see the core of Lever 1: that rhetorical/hyperbolic emphasis is never written to
 * the ledger as a claim. This replays the fixture's recorded responses in mock mode
 * and asserts the ledger directly — the "hype" section extracts zero claims, while
 * the "research" section still extracts the genuine statistic.
 *
 * See docs/projects/document_type_calibration.md § Extraction & tension calibration
 * for rhetoric, and docs/logs/prompt_quality_observations.md (OBS-037).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateSection } from "./evaluator";
import * as db from "../store/db";
import type { ClaimLedgerEntry } from "../store/db";
import { setLlmMode, loadRecordings, clearRecordings } from "../model/mock";
import { clearAllSnapshots } from "./evalSnapshot";
import fixture from "./eval-fixtures/rhetoric-extraction";

vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(),
  loadBlockSummariesForDocument: vi.fn(async () => []),
  loadDocument: vi.fn(async () => undefined),
  saveObservation: vi.fn(),
  loadObservation: vi.fn(async () => undefined),
  reactivateObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(async () => []),
  updateObservationStatus: vi.fn(),
  loadSuppressionsForDocument: vi.fn(async () => []),
  saveDocEvalState: vi.fn(),
  loadDocEvalState: vi.fn(async () => undefined),
}));
vi.mock("nanoid", () => ({ nanoid: () => `obs-${Math.random().toString(36).slice(2, 7)}` }));

describe("OBS-037 Lever 1 — rhetoric not extracted as a claim", () => {
  const claimsByBlock = new Map<string, ClaimLedgerEntry[]>();
  const store: ClaimLedgerEntry[] = [];
  let id = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSnapshots();
    claimsByBlock.clear();
    store.length = 0;
    id = 1;
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    vi.mocked(db.loadActiveClaimsForDocument).mockImplementation(async () => [...store]);
    vi.mocked(db.saveClaimsForBlock).mockImplementation(async (_docId, blockId, claims) => {
      claimsByBlock.set(blockId, claims as ClaimLedgerEntry[]);
      for (let i = store.length - 1; i >= 0; i--) {
        if (store[i].sourceBlockId === blockId) store.splice(i, 1);
      }
      for (const c of claims) {
        store.push({
          ...(c as Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">),
          id: id++,
          docId: "d",
          sourceBlockId: blockId,
          status: "active",
        });
      }
    });
    clearRecordings();
    loadRecordings(fixture.recordings);
    setLlmMode("mock");
  });

  it("extracts zero claims from the hyperbole section and the statistic from the research section", async () => {
    for (const section of fixture.sections) {
      await evaluateSection(
        "d",
        section.id,
        section.text,
        [{ blockId: section.id, text: section.text }],
        fixture.stage,
        "mock-key"
      );
    }
    setLlmMode("live");

    // Hyperbole ("a HUGE thing", "the tipping point") → nothing enters the ledger.
    expect(claimsByBlock.get("hype")).toEqual([]);

    // The genuine "40%" statistic is still extracted.
    const research = claimsByBlock.get("research") ?? [];
    expect(research.length).toBeGreaterThan(0);
    expect(research.some((c) => c.text.includes("40%"))).toBe(true);
  });
});
