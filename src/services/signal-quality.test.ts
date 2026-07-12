import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateSection,
  evaluateDocument,
  isDocumentMetaClaim,
  CONTRADICTION_SYSTEM_PROMPT,
  CONTRADICTION_SYSTEM_PROMPT_HEDGED,
} from "./evaluator";
import * as db from "../store/db";
import type { ClaimLedgerEntry } from "../store/db";
import { capabilityForTier } from "../model/capability";
import { clearSnapshotsForDocument } from "./evalSnapshot";

const STRONG = capabilityForTier("strong");

vi.mock("../store/db", () => ({
  saveBlockSummary: vi.fn(),
  loadBlockSummary: vi.fn(async () => undefined),
  saveClaimsForBlock: vi.fn(),
  loadActiveClaimsForDocument: vi.fn(async () => []),
  saveObservation: vi.fn(),
  loadObservation: vi.fn(async () => undefined),
  reactivateObservation: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(async () => []),
  updateObservationStatus: vi.fn(),
  loadSuppressionsForDocument: vi.fn(async () => []),
  loadBlockSummariesForDocument: vi.fn(async () => []),
  loadDocument: vi.fn(async () => undefined),
  saveDocEvalState: vi.fn(),
  loadDocEvalState: vi.fn(async () => undefined),
}));

const mockFast = vi.fn();
const mockStrong = vi.fn();
vi.mock("../model/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../model/gemini")>()),
  createGeminiRouter: vi.fn(() => ({ fast: mockFast, strong: mockStrong })),
}));

vi.mock("nanoid", () => ({ nanoid: () => "mock-id" }));

const docId = "doc";
const apiKey = "key";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
  vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
  vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([]);
  // The revert-aware snapshot store is a module-level cache keyed on
  // (docId, membership, text hash); clear it so an eval in one test can't be
  // served as a cache hit by a same-shaped fixture in another. See evalSnapshot.ts.
  clearSnapshotsForDocument(docId);
});

describe("isDocumentMetaClaim", () => {
  it("flags statements about the artifact, not the content", () => {
    expect(isDocumentMetaClaim("This document is a PRD")).toBe(true);
    expect(isDocumentMetaClaim("This PRD describes the rollout")).toBe(true);
    expect(isDocumentMetaClaim("The spec covers the API")).toBe(true);
    // Real claims must NOT be flagged
    expect(isDocumentMetaClaim("We will launch in Q3.")).toBe(false);
    expect(isDocumentMetaClaim("False positives drop by 30%.")).toBe(false);
    expect(isDocumentMetaClaim("This feature ships next week.")).toBe(false);
  });
});

describe("Tier A — meta-claim guard", () => {
  it("keeps document meta-claims out of the ledger", async () => {
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "s",
        claims: [
          { text: "This document is a PRD.", kind: "fact_claim" },
          { text: "We will launch in Q3.", kind: "commitment" },
        ],
        clarity_observations: [],
        unsupported_claim_observations: [],
        undefined_jargon_observations: [],
      }),
    });

    await evaluateSection(
      docId,
      "sec1",
      "We will launch the fraud alerts in Q3.",
      [{ blockId: "sec1", text: "We will launch the fraud alerts in Q3." }],
      undefined,
      apiKey
    );

    expect(db.saveClaimsForBlock).toHaveBeenCalledWith(
      docId,
      "sec1",
      [
        // Anchor fields (OBS-032 body-block fallback) are asserted in
        // evaluatorAnchoring.test.ts; here only the meta-claim filtering matters.
        expect.objectContaining({ text: "We will launch in Q3.", kind: "commitment" }),
      ],
      ["sec1"] // section members threaded for former-representative eviction
    );
  });
});

describe("Tier A — defined-terms dedup", () => {
  it("does not repeat the same definition in the glossary", async () => {
    const dup: ClaimLedgerEntry = {
      id: 1,
      docId,
      sourceBlockId: "other",
      text: "SLA: service level agreement",
      kind: "definition",
      status: "active",
    };
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([dup, { ...dup, id: 2 }]);
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({ summary: "", claims: [], clarity_observations: [] }),
    });

    await evaluateSection(
      docId,
      "sec1",
      "We promise a strong SLA for every customer tier here.",
      [{ blockId: "sec1", text: "We promise a strong SLA for every customer tier here." }],
      undefined,
      apiKey
    );

    const userPayload = mockFast.mock.calls[0][0].user as string;
    const occurrences = userPayload.split("SLA: service level agreement").length - 1;
    expect(occurrences).toBe(1);
  });
});

describe("Tier B — contradiction prompt calibrated by tier", () => {
  const setup = () => {
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([
      {
        id: 9,
        docId,
        sourceBlockId: "other",
        text: "Launch is delayed to Q4.",
        kind: "commitment",
        status: "active",
      },
    ]);
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "",
        claims: [{ text: "Launch in Q3.", kind: "commitment" }],
        clarity_observations: [],
      }),
    });
    mockStrong.mockResolvedValueOnce({ text: JSON.stringify({ contradictions: [] }) });
  };

  it("uses the hedged prompt on the free tier (no paid key)", async () => {
    setup();
    await evaluateSection(
      docId,
      "sec1",
      "We will launch in Q3.",
      [{ blockId: "sec1", text: "We will launch in Q3." }],
      undefined,
      apiKey,
      undefined // no paid key
    );
    expect(mockStrong.mock.calls[0][0].system).toBe(CONTRADICTION_SYSTEM_PROMPT_HEDGED);
  });

  it("uses the confident prompt when capability is strong", async () => {
    setup();
    await evaluateSection(
      docId,
      "sec1",
      "We will launch in Q3.",
      [{ blockId: "sec1", text: "We will launch in Q3." }],
      undefined,
      apiKey,
      "paid-key",
      undefined, // jargonAllowlist
      false, // skipContradiction
      undefined, // evalId
      STRONG
    );
    expect(mockStrong.mock.calls[0][0].system).toBe(CONTRADICTION_SYSTEM_PROMPT);
  });
});

describe("strategic_tension — tradeoffs route to the softer type", () => {
  it("a tensions entry produces a strategic_tension observation (kind opportunity, priority 1.5)", async () => {
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([
      {
        id: 9,
        docId,
        sourceBlockId: "other",
        text: "Minimize friction for legitimate users.",
        kind: "commitment",
        status: "active",
      },
    ]);
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "",
        claims: [{ text: "Notify users on every fraud block.", kind: "commitment" }],
        clarity_observations: [],
      }),
    });
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [],
        tensions: [
          {
            newClaimText: "Notify users on every fraud block.",
            existingClaimId: 0,
            message: "This goal is in tension with the friction-minimization objective.",
          },
        ],
      }),
    });

    await evaluateSection(
      docId,
      "sec1",
      "Notify users on every fraud block.",
      [{ blockId: "sec1", text: "Notify users on every fraud block." }],
      undefined,
      apiKey
    );

    const saved = vi.mocked(db.saveObservation).mock.calls.map((c) => c[0]);
    const tension = saved.find((o) => o.type === "strategic_tension");
    expect(tension).toBeDefined();
    expect(tension!.kind).toBe("opportunity");
    expect(tension!.scope).toBe("span");
    expect(tension!.priority).toBe(1.5);
    expect(tension!.conflictingBlockId).toBe("other");
    // No hard contradiction was reported → none saved.
    expect(saved.some((o) => o.type === "contradiction")).toBe(false);
  });
});

describe("Tier B — observation content dedup", () => {
  it("collapses duplicate observations to a single card", async () => {
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "",
        claims: [],
        clarity_observations: [
          { text: "Vague quarter", substring: "Q3" },
          { text: "Vague quarter", substring: "Q3" },
        ],
        unsupported_claim_observations: [],
        undefined_jargon_observations: [],
      }),
    });

    await evaluateSection(
      docId,
      "sec1",
      "We will ship in Q3 for sure.",
      [{ blockId: "sec1", text: "We will ship in Q3 for sure." }],
      undefined,
      apiKey
    );

    expect(db.saveObservation).toHaveBeenCalledTimes(1);
  });
});

describe("Tier C — doc-level dirty-check", () => {
  it("skips the strong-tier doc-level call when inputs are unchanged", async () => {
    vi.mocked(db.loadBlockSummariesForDocument).mockResolvedValue([
      { blockId: "a", docId, summary: "Summary A", hash: "ha" },
      { blockId: "b", docId, summary: "Summary B", hash: "hb" },
    ]);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([]);
    let savedHash: string | undefined;
    vi.mocked(db.saveDocEvalState).mockImplementation(async (_d, h) => {
      savedHash = h;
    });
    vi.mocked(db.loadDocEvalState).mockResolvedValue(undefined);
    mockStrong.mockResolvedValue({
      text: JSON.stringify({ missing_topic_observations: [] }),
    });

    await evaluateDocument(docId, "PRD", apiKey);
    expect(mockStrong).toHaveBeenCalledTimes(1);
    expect(savedHash).toBeTruthy();

    // Re-run with the same inputs → the dirty-check short-circuits.
    vi.mocked(db.loadDocEvalState).mockResolvedValue(savedHash);
    await evaluateDocument(docId, "PRD", apiKey);
    expect(mockStrong).toHaveBeenCalledTimes(1);
  });
});

describe("Tier B — span re-anchoring across members", () => {
  it("anchors a clarity span to the body block, not the heading", async () => {
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "",
        claims: [],
        clarity_observations: [{ text: "Vague", substring: "varies significantly" }],
        unsupported_claim_observations: [],
        undefined_jargon_observations: [],
      }),
    });

    await evaluateSection(
      docId,
      "h1",
      "Risks\n\nThe impact varies significantly across cohorts.",
      [
        { blockId: "h1", text: "Risks" },
        { blockId: "b1", text: "The impact varies significantly across cohorts." },
      ],
      undefined,
      apiKey
    );

    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "clarity",
        blockId: "b1",
        startOffset: "The impact ".length,
      })
    );
  });
});
