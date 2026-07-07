import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseJSONResponse,
  evaluateBlock,
  evaluateSection,
  evaluateLedgerContradictions,
  reconcileDocumentObservations,
  evaluateDocument,
} from "./evaluator";
import * as db from "../store/db";
import type { Observation } from "../store/db";
import { capabilityForTier } from "../model/capability";
import { clearAllSnapshots } from "./evalSnapshot";

const STRONG = capabilityForTier("strong");

// Mock the DB module
vi.mock("../store/db", () => {
  return {
    saveBlockSummary: vi.fn(),
    loadBlockSummary: vi.fn(),
    saveClaimsForBlock: vi.fn(),
    loadActiveClaimsForDocument: vi.fn(async () => []),
    loadBlockSummariesForDocument: vi.fn(async () => []),
    saveObservation: vi.fn(),
    loadObservation: vi.fn(async () => undefined),
    reactivateObservation: vi.fn(),
    loadActiveObservationsForDocument: vi.fn(async () => []),
    updateObservationStatus: vi.fn(),
    loadSuppressionsForDocument: vi.fn(async () => []),
    loadDocEvalState: vi.fn(async () => undefined),
    saveDocEvalState: vi.fn(),
  };
});

// The revert-aware snapshot store (evalSnapshot.ts) is module-level so it
// survives across evaluateSection calls within a real session — but this file
// reuses docId/blockId/text combinations across unrelated describe blocks, so
// without a reset a later fixture could spuriously "restore" from an earlier,
// unrelated one. Clear before every test regardless of which describe it's in.
beforeEach(() => {
  clearAllSnapshots();
});

// Mock the Gemini model module
const mockFast = vi.fn();
const mockStrong = vi.fn();
vi.mock("../model/gemini", async (importOriginal) => {
  return {
    ...(await importOriginal<typeof import("../model/gemini")>()),
    createGeminiRouter: vi.fn(() => ({
      fast: mockFast,
      strong: mockStrong,
    })),
  };
});

// Mock nanoid
vi.mock("nanoid", () => {
  return {
    nanoid: () => "mock-id",
  };
});

describe("evaluator - parseJSONResponse", () => {
  it("should parse clean JSON correctly", () => {
    const json = '{"key": "value"}';
    expect(parseJSONResponse(json)).toEqual({ key: "value" });
  });

  it("should extract and parse JSON from markdown code block", () => {
    const markdown = '```json\n{\n  "claims": ["claim1"]\n}\n```';
    expect(parseJSONResponse(markdown)).toEqual({ claims: ["claim1"] });

    const markdownNoLang = '```\n{\n  "claims": ["claim2"]\n}\n```';
    expect(parseJSONResponse(markdownNoLang)).toEqual({ claims: ["claim2"] });
  });

  it("should extract JSON wrapped in text", () => {
    const wrappedText = 'Sure, here is the result: {"ok": true} Hope this helps!';
    expect(parseJSONResponse(wrappedText)).toEqual({ ok: true });
  });

  it("should throw an error on invalid JSON", () => {
    expect(() => parseJSONResponse("not a json")).toThrow("Failed to parse JSON response");
  });
});

describe("evaluator - evaluateBlock", () => {
  const docId = "doc1";
  const blockId = "block1";
  const apiKey = "mock-key";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should do nothing if API key is missing", async () => {
    await evaluateBlock(docId, blockId, "Some document text content here.");
    expect(db.loadBlockSummary).not.toHaveBeenCalled();
  });

  it("should skip evaluation if the block content has not changed", async () => {
    const text = "Some stable text.";
    vi.mocked(db.loadBlockSummary).mockImplementationOnce(async (id) => {
      if (id === blockId) {
        return {
          blockId,
          docId,
          summary: "Old summary",
          hash: "mrxv60", // Hash of "Some stable text."
        };
      }
      return undefined;
    });

    await evaluateBlock(docId, blockId, text, undefined, apiKey);

    // Should only load block summary, not load observations or call LLM
    expect(db.loadBlockSummary).toHaveBeenCalledWith(blockId);
    expect(db.loadActiveObservationsForDocument).not.toHaveBeenCalled();
    expect(mockFast).not.toHaveBeenCalled();
  });

  it("should clean up and save empty claims/summary if text is too short", async () => {
    await evaluateBlock(docId, blockId, "short", undefined, apiKey);

    expect(db.saveBlockSummary).toHaveBeenCalledWith({
      blockId,
      docId,
      summary: "",
      hash: expect.any(String),
    });
    expect(db.saveClaimsForBlock).toHaveBeenCalledWith(docId, blockId, []);
    expect(mockFast).not.toHaveBeenCalled();
  });

  it("should run full pipeline when block is changed", async () => {
    // Mock database loads
    vi.mocked(db.loadBlockSummary).mockResolvedValueOnce(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValueOnce([]);
    // loadActiveClaimsForDocument is called twice: once for glossary, once for
    // contradiction check. Both return [] → no contradiction check runs.
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([]);

    // Mock Gemini router responses
    // Merged Fast Call: summary, claims, clarity
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "This is a summary.",
        claims: [{ text: "We plan to launch in Q3.", kind: "commitment" }],
        clarity_observations: [{ text: "Vague launch date", substring: "in Q3" }],
      }),
    });

    const text = "We plan to launch the product in Q3.";
    await evaluateBlock(docId, blockId, text, "Test Stage", apiKey);

    // Verify DB operations
    expect(db.loadBlockSummary).toHaveBeenCalledWith(blockId);
    expect(db.updateObservationStatus).not.toHaveBeenCalled(); // No existing active observations to close

    expect(db.saveBlockSummary).toHaveBeenCalledWith({
      blockId,
      docId,
      summary: "This is a summary.",
      hash: expect.any(String),
    });

    expect(db.saveClaimsForBlock).toHaveBeenCalledWith(docId, blockId, [
      { text: "We plan to launch in Q3.", kind: "commitment" },
    ]);

    // Clarity observation saved.
    // severity:"low" confidence:"medium" priority:0.75 — clarity base prior.
    // overlapsCommitment has no effect on clarity (only unsupported_claim escalates).
    expect(db.saveObservation).toHaveBeenCalledWith({
      id: "mock-id",
      docId,
      blockId: "block1",
      anchorText: "in Q3",
      type: "clarity",
      scope: "span",
      kind: "problem",
      severity: "low",
      confidence: "medium",
      priority: 0.75,
      text: "Vague launch date",
      status: "active",
      startOffset: 30, // "in Q3" start in text
      endOffset: 35,
    });
  });

  it("should run contradiction checks against other claims", async () => {
    vi.mocked(db.loadBlockSummary).mockResolvedValueOnce(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValueOnce([]);

    // loadActiveClaimsForDocument is called twice per evaluateBlock:
    //   1st: glossary build (before fast call) — kind "commitment" filtered out, no glossary effect
    //   2nd: contradiction check — needs the Q4 claim to detect the contradiction
    const existingClaim = {
      id: 42,
      docId,
      sourceBlockId: "block2",
      text: "Launch is delayed to Q4.",
      kind: "commitment" as const,
      status: "active" as const,
    };
    vi.mocked(db.loadActiveClaimsForDocument)
      .mockResolvedValueOnce([existingClaim]) // glossary call
      .mockResolvedValueOnce([existingClaim]); // contradiction call

    // Mock Gemini router responses
    // Merged Fast Call
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "Launch in Q3.",
        claims: [{ text: "Launch in Q3.", kind: "commitment" }],
        clarity_observations: [],
      }),
    });

    // Contradiction check — existingClaimId is now the index into the sorted
    // existing-claims list (not the DB id), so the single claim is index 0.
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [
          {
            newClaimText: "Launch in Q3.",
            existingClaimId: 0,
            message: "Contradicts delayed launch to Q4.",
          },
        ],
      }),
    });

    const text = "We plan to launch in Q3.";
    await evaluateBlock(docId, blockId, text, "Test Stage", apiKey);

    // Contradiction observation saved.
    // Both new claim ("Launch in Q3." kind:commitment) and existing claim
    // (kind:commitment) are commitments → escalated to severity:"high".
    // paidKey is undefined in this test → contradictionTier:"hedged" → confidence:"low".
    // priority = 3 (high) × 0.5 (low confidence factor) = 1.5
    expect(db.saveObservation).toHaveBeenCalledWith({
      id: "mock-id",
      docId,
      anchorText: "Launch in Q3.",
      conflictingAnchorText: "Launch is delayed to Q4.",
      type: "contradiction",
      scope: "span",
      kind: "problem",
      severity: "high",
      confidence: "low",
      priority: 1.5,
      text: "Contradicts delayed launch to Q4.",
      status: "active",
      blockId,
      startOffset: 0,
      endOffset: text.length,
      conflictingBlockId: "block2",
      conflictingStartOffset: 0,
      conflictingEndOffset: 9999,
    });
  });

  it("should enforce G1 flattery-resistant dismissal logic (span-only for high severity)", async () => {
    vi.mocked(db.loadBlockSummary).mockResolvedValueOnce(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValueOnce([]);

    // Seed a DismissalSuppression that represents a dismissed contradiction on block1
    // and a dismissed clarity nit on block1.
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValueOnce([
      {
        id: "sup-1",
        docId,
        type: "contradiction",
        kind: "problem",
        severity: "high",
        spanSignature: "block1:0:10",
      },
      {
        id: "sup-2",
        docId,
        type: "clarity",
        kind: "problem",
        severity: "low",
        spanSignature: "block1:10:20",
      },
    ]);

    const existingClaim = {
      id: 42,
      docId,
      sourceBlockId: "block2",
      text: "Launch is delayed to Q4.",
      kind: "commitment" as const,
      status: "active" as const,
    };
    vi.mocked(db.loadActiveClaimsForDocument)
      .mockResolvedValueOnce([existingClaim])
      .mockResolvedValueOnce([existingClaim]);

    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "Launch in Q3.",
        claims: [{ text: "Launch in Q3.", kind: "commitment" }],
        clarity_observations: [
          // A new clarity nit on block3
          { text: "Vague launch date", substring: "in Q3" },
        ],
      }),
    });

    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [
          {
            newClaimText: "Launch in Q3.",
            existingClaimId: 0,
            message: "Contradicts delayed launch to Q4.",
          },
        ],
      }),
    });

    // Evaluate block3!
    const text = "We plan to launch in Q3.";
    await evaluateBlock(docId, "block3", text, "Test Stage", apiKey);

    // The high-severity contradiction suppression was on block1, so the new contradiction on block3 SHOULD fire (span-only suppression).
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "contradiction",
        blockId: "block3",
      })
    );

    // The low-severity clarity suppression was on block1, so the new clarity nit on block3 should NOT fire (category-wide suppression).
    expect(db.saveObservation).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "clarity",
      })
    );
  });
});

describe("evaluator - evaluateSection skipContradiction (bulk paste)", () => {
  const docId = "doc1";
  const sectionId = "sec1";
  const apiKey = "mock-key";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the fast call but skips the strong contradiction call", async () => {
    vi.mocked(db.loadBlockSummary).mockResolvedValueOnce(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValueOnce([]);
    // A conflicting existing claim is present — contradiction WOULD fire if not skipped.
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([
      {
        id: 7,
        docId,
        sourceBlockId: "other",
        text: "Launch is delayed to Q4.",
        kind: "commitment" as const,
        status: "active" as const,
      },
    ]);
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "Launch in Q3.",
        claims: [{ text: "Launch in Q3.", kind: "commitment" }],
        clarity_observations: [],
      }),
    });

    await evaluateSection(
      docId,
      sectionId,
      "We plan to launch in Q3.",
      [{ blockId: sectionId, text: "We plan to launch in Q3." }],
      "Stage",
      apiKey,
      undefined,
      undefined,
      true // skipContradiction
    );

    expect(mockFast).toHaveBeenCalledTimes(1);
    expect(mockStrong).not.toHaveBeenCalled();
  });
});

describe("evaluator - evaluateSection cross-section context (OBS-027)", () => {
  const docId = "doc1";
  const sectionId = "sec1";
  const apiKey = "mock-key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    mockFast.mockResolvedValue({
      text: JSON.stringify({
        summary: "s",
        claims: [],
        clarity_observations: [],
        unsupported_claim_observations: [],
        undefined_jargon_observations: [],
      }),
    });
  });

  const runSection = () =>
    evaluateSection(
      docId,
      sectionId,
      "This notification pattern retries three times.",
      [{ blockId: sectionId, text: "This notification pattern retries three times." }],
      "Stage",
      apiKey,
      undefined,
      undefined,
      true // skipContradiction — keep to a single fast call
    );

  it("injects sibling summaries and sibling claims as established context", async () => {
    vi.mocked(db.loadBlockSummariesForDocument).mockResolvedValue([
      { blockId: "secSolution", docId, summary: "The notification pattern is defined here.", hash: "h" },
      { blockId: sectionId, docId, summary: "own section summary", hash: "h" }, // own → excluded
    ]);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([
      { id: 1, docId, sourceBlockId: "secSolution", text: "Retries are capped at three.", kind: "constraint", status: "active" },
      { id: 2, docId, sourceBlockId: sectionId, text: "own-section claim", kind: "fact_claim", status: "active" }, // own → excluded
    ]);

    await runSection();

    const user = mockFast.mock.calls[0][0].user as string;
    expect(user).toContain("Established elsewhere in this document");
    expect(user).toContain("The notification pattern is defined here.");
    expect(user).toContain("Retries are capped at three.");
    // The section's own summary/claim must not leak into its own context block.
    expect(user).not.toContain("own section summary");
    expect(user).not.toContain("own-section claim");
  });

  it("omits the context block when there is no sibling content (fixture-hash stability)", async () => {
    vi.mocked(db.loadBlockSummariesForDocument).mockResolvedValue([
      { blockId: sectionId, docId, summary: "own section summary", hash: "h" },
    ]);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([
      { id: 2, docId, sourceBlockId: sectionId, text: "own-section claim", kind: "fact_claim", status: "active" },
    ]);

    await runSection();

    const user = mockFast.mock.calls[0][0].user as string;
    expect(user).not.toContain("Established elsewhere in this document");
  });
});

describe("evaluator - evaluateLedgerContradictions (bootstrap sweep)", () => {
  const docId = "doc1";
  const apiKey = "mock-key";

  const claimA = {
    id: 1,
    docId,
    sourceBlockId: "blockA",
    text: "Launch in Q3.",
    kind: "commitment" as const,
    status: "active" as const,
  };
  const claimB = {
    id: 2,
    docId,
    sourceBlockId: "blockB",
    text: "Launch is delayed to Q4.",
    kind: "commitment" as const,
    status: "active" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits one contradiction anchored to both source blocks", async () => {
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([claimA, claimB]);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValueOnce([]);
    // Sorted by text: "Launch in Q3." (blockA) = index 0; "Launch is delayed…" (blockB) = index 1.
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [{ claimAId: 0, claimBId: 1, message: "Q3 contradicts the Q4 launch." }],
        tensions: [],
      }),
    });

    await evaluateLedgerContradictions(docId, "Stage", apiKey);

    expect(mockStrong).toHaveBeenCalledTimes(1);
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "contradiction",
        scope: "span",
        kind: "problem",
        text: "Q3 contradicts the Q4 launch.",
        blockId: "blockA",
        conflictingBlockId: "blockB",
        startOffset: 0,
        endOffset: 9999,
        status: "active",
      })
    );
    expect(db.saveDocEvalState).toHaveBeenCalledWith(`${docId}::sweep`, expect.any(String));
  });

  it("emits nothing for a clean ledger", async () => {
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([claimA, claimB]);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValueOnce([]);
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({ contradictions: [], tensions: [] }),
    });

    await evaluateLedgerContradictions(docId, "Stage", apiKey);

    expect(db.saveObservation).not.toHaveBeenCalled();
  });

  it("emits one contradiction for a same-block conflict (OBS-026)", async () => {
    const claimC = { ...claimA, id: 3, sourceBlockId: "blockC", text: "Win." };
    const claimD = { ...claimB, id: 4, sourceBlockId: "blockC", text: "Lose." };
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([claimC, claimD]);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValueOnce([]);
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [{ claimAId: 1, claimBId: 0, message: "Same block conflict." }],
        tensions: [],
      }),
    });

    await evaluateLedgerContradictions(docId, "Stage", apiKey);

    expect(mockStrong).toHaveBeenCalledTimes(1);
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "contradiction",
        blockId: "blockC",
        conflictingBlockId: "blockC",
        status: "active",
      })
    );
  });

  it("drops a self-pair (a claim cannot contradict itself) (OBS-026)", async () => {
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([claimA, claimB]);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValueOnce([]);
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        // Same claim index on both sides — a degenerate self-conflict.
        contradictions: [{ claimAId: 0, claimBId: 0, message: "Self conflict." }],
        tensions: [],
      }),
    });

    await evaluateLedgerContradictions(docId, "Stage", apiKey);

    expect(mockStrong).toHaveBeenCalledTimes(1);
    expect(db.saveObservation).not.toHaveBeenCalled();
  });

  it("is a no-op when the ledger is unchanged since the last sweep (dirty-check)", async () => {
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([claimA, claimB]);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    mockStrong.mockResolvedValue({
      text: JSON.stringify({ contradictions: [], tensions: [] }),
    });

    // First sweep runs and stores the ledger hash.
    await evaluateLedgerContradictions(docId, "Stage", apiKey);
    expect(mockStrong).toHaveBeenCalledTimes(1);
    const storedHash = vi.mocked(db.saveDocEvalState).mock.calls[0][1];

    // Replay that hash; the unchanged ledger should short-circuit before the call.
    vi.mocked(db.loadDocEvalState).mockResolvedValueOnce(storedHash);
    await evaluateLedgerContradictions(docId, "Stage", apiKey);
    expect(mockStrong).toHaveBeenCalledTimes(1); // still 1 — no second call
  });

  it("does nothing with fewer than two claims", async () => {
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([claimA]);

    await evaluateLedgerContradictions(docId, "Stage", apiKey);

    expect(mockStrong).not.toHaveBeenCalled();
  });
});

describe("evaluator - reconcileDocumentObservations (doc-scope grace period)", () => {
  const docId = "doc1";

  function docObs(overrides: Partial<Observation> = {}): Observation {
    return {
      id: "e1",
      docId,
      type: "missing_topic",
      scope: "document",
      kind: "problem",
      severity: "medium",
      confidence: "medium",
      priority: 0,
      text: "No rollout plan.",
      status: "active",
      missCount: 0,
      ...overrides,
    };
  }

  // A freshly-regenerated doc-scope observation (no id/docId/status).
  function incoming(text: string, type: Observation["type"] = "missing_topic") {
    return {
      type,
      scope: "document" as const,
      kind: "problem" as const,
      severity: "medium" as const,
      confidence: "medium" as const,
      priority: 0,
      text,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
  });

  it("keeps an absent note active on its first miss, bumping missCount", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([docObs({ missCount: 0 })]);

    await reconcileDocumentObservations(docId, []); // nothing regenerated → orphan

    // Not closed — survives the first absence.
    expect(db.updateObservationStatus).not.toHaveBeenCalled();
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1", status: "active", missCount: 1 })
    );
  });

  it("auto-closes a note once it reaches the grace threshold", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([docObs({ missCount: 1 })]);

    await reconcileDocumentObservations(docId, []); // absent a 2nd consecutive run

    expect(db.updateObservationStatus).toHaveBeenCalledWith(
      "e1",
      "auto_closed",
      "resolved_by_edit"
    );
  });

  it("resets missCount when an absent note reappears (re-matched)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      docObs({ missCount: 1, text: "No rollout plan." }),
    ]);

    await reconcileDocumentObservations(docId, [incoming("No rollout plan.")]);

    // Deduped against the existing record: same id, counter reset, not closed.
    expect(db.updateObservationStatus).not.toHaveBeenCalled();
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1", missCount: 0 })
    );
  });

  it("never emits a positional `superseded` for doc-scope — orphan + insert instead", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      docObs({ id: "e1", text: "No rollout plan." }),
    ]);

    // Same type, unrelated text (below the 0.6 floor) → not the same note.
    await reconcileDocumentObservations(docId, [incoming("No risks section.")]);

    // The honesty invariant: the existing note is never superseded.
    expect(db.updateObservationStatus).not.toHaveBeenCalledWith("e1", "superseded");
    // The new note is inserted active with a fresh id.
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "mock-id", status: "active", text: "No risks section." })
    );
    // The orphan is preserved (first miss), not closed.
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1", missCount: 1 })
    );
  });
});

describe("evaluator - reconcileDocumentObservations (Tier 2 opts — A3)", () => {
  const docId = "doc1";

  function docObs(id: string, text: string, missCount = 0): Observation {
    return {
      id,
      docId,
      type: "missing_topic",
      scope: "document",
      kind: "problem",
      severity: "medium",
      confidence: "medium",
      priority: 0,
      text,
      status: "active",
      missCount,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
  });

  it("force-closes model-resolved priors via resolved_prior (auto_closed + resolved_prior reason)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      docObs("p0", "No rollout plan."),
    ]);

    await reconcileDocumentObservations(docId, [], undefined, {
      resolvedPriorIds: new Set(["p0"]),
    });

    expect(db.updateObservationStatus).toHaveBeenCalledWith("p0", "auto_closed", "resolved_prior");
    // Grace pass must NOT re-close or bump an already-resolved note.
    expect(db.saveObservation).not.toHaveBeenCalledWith(expect.objectContaining({ id: "p0" }));
  });

  it("persist: keeps existing card, resets missCount, does NOT insert a new record", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      docObs("p0", "No rollout plan.", 1),
    ]);

    // No incoming (items with priorId are stripped before reaching reconciler).
    await reconcileDocumentObservations(docId, [], undefined, {
      persistIds: new Set(["p0"]),
    });

    expect(db.updateObservationStatus).not.toHaveBeenCalled();
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p0", missCount: 0 })
    );
    // Only one saveObservation call — the persist; no extra insert.
    const insertCalls = vi
      .mocked(db.saveObservation)
      .mock.calls.filter(([o]) => o.id === "mock-id");
    expect(insertCalls).toHaveLength(0);
  });

  it("unmapped items fall through to lexical best-match (free-tier path, no opts)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      docObs("e1", "No rollout plan.", 0),
    ]);

    // Identical text matches lexically → dedupe (missCount reset, no new insert).
    await reconcileDocumentObservations(docId, [
      {
        type: "missing_topic",
        scope: "document",
        kind: "problem",
        severity: "medium",
        confidence: "medium",
        priority: 0,
        text: "No rollout plan.",
      },
    ]);

    expect(db.updateObservationStatus).not.toHaveBeenCalled();
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1", missCount: 0 })
    );
  });

  it("resolved priors are excluded from the lexical pass (no double-processing)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      docObs("p0", "No rollout plan."),
      docObs("p1", "Missing risks section."),
    ]);

    // p0 resolved, p1 persisted — nothing left for lexical fallback.
    await reconcileDocumentObservations(docId, [], undefined, {
      resolvedPriorIds: new Set(["p0"]),
      persistIds: new Set(["p1"]),
    });

    // Only p0 gets status update; p1 gets a save (reset); no inserts, no grace bumps.
    expect(db.updateObservationStatus).toHaveBeenCalledTimes(1);
    expect(db.updateObservationStatus).toHaveBeenCalledWith("p0", "auto_closed", "resolved_prior");
    const saveIds = vi.mocked(db.saveObservation).mock.calls.map(([o]) => o.id);
    expect(saveIds).toContain("p1");
    expect(saveIds).not.toContain("p0");
  });
});

describe("evaluator - reconcileDocumentObservations (R2 in-place maturity promotion)", () => {
  const docId = "doc1";

  // A forming-stage topic gap: kind=opportunity, severity=medium (base).
  function formingGap(id: string, missCount = 0): Observation {
    return {
      id,
      docId,
      type: "missing_topic",
      scope: "document",
      kind: "opportunity",
      severity: "medium",
      confidence: "medium",
      priority: 1.5,
      text: "No rollout plan.",
      status: "active",
      missCount,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
  });

  it("promotes a persisting gap in place when the doc has matured (paid persist path)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([formingGap("p0", 1)]);

    await reconcileDocumentObservations(docId, [], undefined, {
      persistIds: new Set(["p0"]),
      maturity: "mature",
    });

    // Same id, wording + anchor frozen — but kind/severity/priority restamped.
    expect(db.updateObservationStatus).not.toHaveBeenCalled();
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "p0",
        text: "No rollout plan.",
        kind: "problem",
        severity: "high",
        priority: 2.25,
        missCount: 0,
      })
    );
    // No fresh insert — this is an update, not a supersede+regenerate (UX-012).
    const inserts = vi.mocked(db.saveObservation).mock.calls.filter(([o]) => o.id === "mock-id");
    expect(inserts).toHaveLength(0);
  });

  it("promotes in place via the lexical dedupe path too (free tier, no priorId)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([formingGap("e1", 0)]);

    await reconcileDocumentObservations(
      docId,
      [
        {
          type: "missing_topic",
          scope: "document",
          kind: "problem",
          severity: "high",
          confidence: "medium",
          priority: 2.25,
          text: "No rollout plan.",
        },
      ],
      undefined,
      { maturity: "mature" }
    );

    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1", kind: "problem", severity: "high", priority: 2.25 })
    );
  });

  it("leaves fields frozen when maturity is undefined (legacy path unchanged)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([formingGap("p0", 1)]);

    await reconcileDocumentObservations(docId, [], undefined, { persistIds: new Set(["p0"]) });

    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p0", kind: "opportunity", severity: "medium", priority: 1.5 })
    );
  });
});

describe("evaluator - evaluateDocument (Tier 2 A1/A2 routing)", () => {
  const docId = "doc2";

  const priorObs = (id: string, text: string): Observation => ({
    id,
    docId,
    type: "missing_topic",
    scope: "document",
    kind: "problem",
    severity: "medium",
    confidence: "medium",
    priority: 0,
    text,
    status: "active",
    missCount: 0,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
    vi.mocked(db.loadDocEvalState).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([]);
    // Two meaningful block summaries so evaluateDocument doesn't bail early.
    vi.mocked(db.loadBlockSummariesForDocument).mockResolvedValue([
      { blockId: "b1", docId, summary: "Summary A", hash: "h1" },
      { blockId: "b2", docId, summary: "Summary B", hash: "h2" },
    ]);
    // Two prior doc-scope obs: index 0 = "p0", index 1 = "p1".
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      priorObs("p0", "No rollout plan."),
      priorObs("p1", "Missing risks section."),
    ]);
  });

  it("routes priorId→persist and resolved_prior→close when capability is strong", async () => {
    // Model says: index-0 note persists (priorId:0), index-1 note is resolved.
    mockStrong.mockResolvedValue({
      callId: "c1",
      text: JSON.stringify({
        missing_topic_observations: [{ text: "No rollout plan.", priorId: 0 }],
        underexposed_topic_observations: [],
        audience_mismatch_observations: [],
        structure_flow_observations: [],
        resolved_prior: [1],
      }),
    });

    await evaluateDocument(docId, undefined, "key", undefined, "paid-key", undefined, STRONG);

    // p1 should be force-closed as resolved.
    expect(db.updateObservationStatus).toHaveBeenCalledWith("p1", "auto_closed", "resolved_prior");

    // p0 should be persisted (missCount reset), NOT inserted as a new record.
    const saveCalls = vi.mocked(db.saveObservation).mock.calls.map(([o]) => o);
    const p0Save = saveCalls.find((o) => o.id === "p0");
    expect(p0Save).toBeDefined();
    expect(p0Save?.missCount).toBe(0);

    // No new observation with id="mock-id" should be inserted for the persisted note.
    const newInsert = saveCalls.find((o) => o.id === "mock-id" && o.text === "No rollout plan.");
    expect(newInsert).toBeUndefined();
  });

  it("weak capability: no priorId routing — behaves identically to Tier 1", async () => {
    // Weak capability (default) → priorDocObs stays empty → priorId contract not injected.
    mockStrong.mockResolvedValue({
      callId: "c2",
      text: JSON.stringify({
        missing_topic_observations: [{ text: "No rollout plan." }],
        underexposed_topic_observations: [],
        audience_mismatch_observations: [],
        structure_flow_observations: [],
      }),
    });

    // Pass apiKey but no paidKey → free tier.
    await evaluateDocument(docId, undefined, "key", undefined, undefined);

    // No force-closes from resolved_prior.
    expect(db.updateObservationStatus).not.toHaveBeenCalledWith("p0", "auto_closed");
    expect(db.updateObservationStatus).not.toHaveBeenCalledWith("p1", "auto_closed");

    // The incoming note should go through lexical fallback (matched → dedupe or insert).
    // Either way, no updateObservationStatus("p0"/"p1", "auto_closed") call.
    expect(db.updateObservationStatus).not.toHaveBeenCalled();
  });
});

describe("evaluator - evaluateLedgerContradictions (Workstream B — authoritative-with-grace)", () => {
  const docId = "doc-b";
  const apiKey = "mock-key";
  const paidKey = "paid-key";

  // Two claims that sort deterministically by text.
  const claimA = {
    id: 1,
    docId,
    sourceBlockId: "b1",
    text: "A: ships Q3.",
    kind: "commitment" as const,
    status: "active" as const,
  };
  const claimB = {
    id: 2,
    docId,
    sourceBlockId: "b2",
    text: "B: ships Q2.",
    kind: "commitment" as const,
    status: "active" as const,
  };
  // sorted[0] = claimA ("A:…"), sorted[1] = claimB ("B:…") → key = "contradiction::b1|b2"

  function existingConflict(missCount = 0): Observation {
    return {
      id: "cx1",
      docId,
      type: "contradiction",
      scope: "span",
      kind: "problem",
      severity: "high",
      confidence: "high",
      priority: 0,
      text: "Q3 contradicts Q2.",
      status: "active",
      blockId: "b1",
      startOffset: 0,
      endOffset: 9999,
      conflictingBlockId: "b2",
      conflictingStartOffset: 0,
      conflictingEndOffset: 9999,
      missCount,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadDocEvalState).mockResolvedValue(undefined);
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([claimA, claimB]);
  });

  it("paid tier: stale pair survives first miss with missCount=1 (not closed)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existingConflict(0)]);
    // Sweep emits nothing → pair is absent.
    mockStrong.mockResolvedValue({
      callId: "c1",
      text: JSON.stringify({ contradictions: [], tensions: [] }),
    });

    await evaluateLedgerContradictions(docId, undefined, apiKey, paidKey, undefined, STRONG);

    expect(db.updateObservationStatus).not.toHaveBeenCalled();
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cx1", missCount: 1 })
    );
  });

  it("paid tier: stale pair is auto_closed once grace threshold reached", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existingConflict(1)]);
    mockStrong.mockResolvedValue({
      callId: "c2",
      text: JSON.stringify({ contradictions: [], tensions: [] }),
    });

    await evaluateLedgerContradictions(docId, undefined, apiKey, paidKey, undefined, STRONG);

    expect(db.updateObservationStatus).toHaveBeenCalledWith(
      "cx1",
      "auto_closed",
      "resolved_by_edit"
    );
    expect(db.saveObservation).not.toHaveBeenCalledWith(expect.objectContaining({ id: "cx1" }));
  });

  it("paid tier: re-emitted pair resets missCount to 0, no new insert", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existingConflict(1)]);
    // Sweep re-emits the same pair (claimA=index 0, claimB=index 1).
    mockStrong.mockResolvedValue({
      callId: "c3",
      text: JSON.stringify({
        contradictions: [{ claimAId: 0, claimBId: 1, message: "Q3 contradicts Q2." }],
        tensions: [],
      }),
    });

    await evaluateLedgerContradictions(docId, undefined, apiKey, paidKey, undefined, STRONG);

    expect(db.updateObservationStatus).not.toHaveBeenCalled();
    // Existing record updated with missCount reset.
    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cx1", missCount: 0 })
    );
    // No second insert with a fresh id.
    const freshInserts = vi
      .mocked(db.saveObservation)
      .mock.calls.filter(([o]) => o.id === "mock-id");
    expect(freshInserts).toHaveLength(0);
  });

  it("weak capability: additive only — stale pair is never closed or bumped", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existingConflict(0)]);
    mockStrong.mockResolvedValue({
      callId: "c4",
      text: JSON.stringify({ contradictions: [], tensions: [] }),
    });

    // Default weak capability (no capability arg) → additive path.
    await evaluateLedgerContradictions(docId, undefined, apiKey, undefined);

    expect(db.updateObservationStatus).not.toHaveBeenCalled();
    // No grace bump either — additive path leaves existing untouched.
    expect(db.saveObservation).not.toHaveBeenCalledWith(expect.objectContaining({ id: "cx1" }));
  });
});

describe("evaluator - eval-wedge under strong-call failure (L3)", () => {
  const docId = "docL3";
  const blockId = "blockL3";
  const apiKey = "mock-key";

  // An existing claim on a *different* block so the contradiction (strong) call
  // is actually reached (needs extractedClaims > 0 AND other claims > 0).
  const otherClaim = {
    id: 1,
    docId,
    sourceBlockId: "otherBlock",
    text: "Launch is delayed to Q4.",
    kind: "commitment" as const,
    status: "active" as const,
  };

  const fastWithClaim = {
    text: JSON.stringify({
      summary: "Launch in Q3.",
      claims: [{ text: "Launch in Q3.", kind: "commitment" }],
      clarity_observations: [],
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([otherClaim]);
  });

  it("does not commit the dirty-check hash when the strong call fails (no wedge)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    mockFast.mockResolvedValueOnce(fastWithClaim);
    mockStrong.mockRejectedValueOnce(new Error("Pool exhausted (free)"));

    await evaluateBlock(docId, blockId, "We plan to launch in Q3.", "Stage", apiKey);

    expect(mockStrong).toHaveBeenCalled(); // the strong call was actually reached
    // The wedge: pre-fix the hash was saved before the strong call, so a failed
    // strong call left a stale-but-matching hash that short-circuited every
    // future eval. Post-fix the hash is committed last, so a failure leaves the
    // section dirty for retry.
    expect(db.saveBlockSummary).not.toHaveBeenCalled();
    // Reconcile is skipped on throw → nothing is written this round.
    expect(db.saveObservation).not.toHaveBeenCalled();
  });

  it("commits the hash only after observations are reconciled (atomic ordering)", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    mockFast.mockResolvedValueOnce(fastWithClaim);
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [
          { newClaimText: "Launch in Q3.", existingClaimId: 0, message: "Contradicts Q4." },
        ],
      }),
    });

    await evaluateBlock(docId, blockId, "We plan to launch in Q3.", "Stage", apiKey);

    expect(db.saveObservation).toHaveBeenCalled();
    expect(db.saveBlockSummary).toHaveBeenCalled();
    // The dirty-check hash must be written AFTER the observation is persisted
    // (i.e. after reconcile completed) — the core of the atomic-eval fix.
    const obsOrder = vi.mocked(db.saveObservation).mock.invocationCallOrder[0];
    const summaryOrder = vi.mocked(db.saveBlockSummary).mock.invocationCallOrder[0];
    expect(summaryOrder).toBeGreaterThan(obsOrder);
  });

  it("does not auto-close an existing contradiction when the strong call fails", async () => {
    const existingContradiction: Observation = {
      id: "cx-old",
      docId,
      type: "contradiction",
      scope: "span",
      kind: "problem",
      severity: "high",
      confidence: "low",
      priority: 1.5,
      text: "Pre-existing contradiction",
      status: "active",
      blockId,
      startOffset: 0,
      endOffset: 5,
      conflictingBlockId: "otherBlock",
    };
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existingContradiction]);
    mockFast.mockResolvedValueOnce(fastWithClaim);
    mockStrong.mockRejectedValueOnce(new Error("Pool exhausted (free)"));

    await evaluateBlock(docId, blockId, "We plan to launch in Q3.", "Stage", apiKey);

    // Reconcile never ran, so the still-valid contradiction must not be touched.
    // (This is the failure mode option (a) would have introduced.)
    expect(db.updateObservationStatus).not.toHaveBeenCalled();
  });
});

describe("evaluator - block-removal race / liveness guard (L4)", () => {
  const docId = "docL4";
  const sectionId = "sectionL4";
  const apiKey = "mock-key";
  const members = [{ blockId: sectionId, text: "Some text long enough to evaluate." }];

  const otherClaim = {
    id: 1,
    docId,
    sourceBlockId: "otherBlock",
    text: "Launch is delayed to Q4.",
    kind: "commitment" as const,
    status: "active" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([]);
  });

  it("aborts all writes when the section is removed during the fast call (no zombie claims)", async () => {
    let removed = false;
    const isLive = () => !removed;
    // The fast response lands *after* the block was removed mid-flight.
    mockFast.mockImplementationOnce(async () => {
      removed = true;
      return {
        text: JSON.stringify({
          summary: "A summary.",
          claims: [{ text: "A claim.", kind: "fact" }],
          clarity_observations: [{ text: "Vague", substring: "Some text" }],
        }),
      };
    });

    await evaluateSection(
      docId,
      sectionId,
      "Some text long enough to evaluate.",
      members,
      undefined,
      apiKey,
      undefined,
      undefined,
      false,
      undefined,
      STRONG,
      isLive
    );

    // The removed section must not be resurrected: no claims, summary, or
    // observations written. handleBlockRemoved already orphaned them.
    expect(db.saveClaimsForBlock).not.toHaveBeenCalled();
    expect(db.saveBlockSummary).not.toHaveBeenCalled();
    expect(db.saveObservation).not.toHaveBeenCalled();
  });

  it("aborts reconcile + summary when removed during the strong call (claims already saved are left to the orphan path)", async () => {
    let removed = false;
    const isLive = () => !removed;
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([otherClaim]);
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "Launch in Q3.",
        claims: [{ text: "Launch in Q3.", kind: "commitment" }],
        clarity_observations: [],
      }),
    });
    // Removal happens while the contradiction (strong) call is in flight.
    mockStrong.mockImplementationOnce(async () => {
      removed = true;
      return {
        text: JSON.stringify({
          contradictions: [
            { newClaimText: "Launch in Q3.", existingClaimId: 0, message: "Contradicts Q4." },
          ],
        }),
      };
    });

    await evaluateSection(
      docId,
      sectionId,
      "We plan to launch in Q3.",
      members,
      undefined,
      apiKey,
      undefined,
      undefined,
      false,
      undefined,
      STRONG,
      isLive
    );

    // Claims were saved before the removal (checkpoint 1 passed) — the orphan
    // path in handleBlockRemoved is responsible for those. But reconcile and the
    // summary/hash write must be skipped so no observation or summary is recreated.
    expect(db.saveObservation).not.toHaveBeenCalled();
    expect(db.saveBlockSummary).not.toHaveBeenCalled();
  });

  it("writes normally when the section stays live (guard is a no-op on the happy path)", async () => {
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "A summary.",
        claims: [{ text: "A claim.", kind: "fact" }],
        clarity_observations: [],
      }),
    });

    // Default isLive (always true) via the back-compat path.
    await evaluateSection(
      docId,
      sectionId,
      "Some text long enough to evaluate.",
      members,
      undefined,
      apiKey,
      undefined,
      undefined,
      true, // skipContradiction — keep it to the fast call
      undefined,
      STRONG
    );

    expect(db.saveClaimsForBlock).toHaveBeenCalled();
    expect(db.saveBlockSummary).toHaveBeenCalled();
  });
});

describe("evaluator - bodyless-heading section is inert (OBS-029)", () => {
  const docId = "docOBS029";
  const sectionId = "hHeading";
  const apiKey = "mock-key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([]);
  });

  it("makes no model call and retires data for a heading with no body (even when the heading clears the 10-char guard)", async () => {
    const headingText = "Writing in the age of AI"; // 24 chars — passes the length guard
    await evaluateSection(
      docId,
      sectionId,
      headingText,
      [{ blockId: sectionId, text: headingText, isHeading: true }],
      undefined,
      apiKey,
      undefined,
      undefined,
      false,
      undefined,
      STRONG
    );

    // No fabrication: the model is never asked to evaluate a title-only section.
    expect(mockFast).not.toHaveBeenCalled();
    expect(mockStrong).not.toHaveBeenCalled();
    // Section is retired to the inert state (same path as the too-short guard).
    expect(db.saveClaimsForBlock).toHaveBeenCalledWith(docId, sectionId, []);
    expect(db.saveBlockSummary).toHaveBeenCalledWith({
      blockId: sectionId,
      docId,
      summary: "",
      hash: expect.any(String),
    });
    expect(db.saveObservation).not.toHaveBeenCalled();
  });

  it("treats a heading + empty-paragraph body as bodyless", async () => {
    const headingText = "Open questions and considerations";
    await evaluateSection(
      docId,
      sectionId,
      headingText,
      [
        { blockId: sectionId, text: headingText, isHeading: true },
        { blockId: "p1", text: "   ", isHeading: false },
      ],
      undefined,
      apiKey,
      undefined,
      undefined,
      false,
      undefined,
      STRONG
    );

    expect(mockFast).not.toHaveBeenCalled();
    expect(db.saveClaimsForBlock).toHaveBeenCalledWith(docId, sectionId, []);
  });

  it("evaluates normally once the heading gains real body text", async () => {
    mockFast.mockResolvedValueOnce({
      text: JSON.stringify({
        summary: "The section argues AI erodes writing skill.",
        claims: [{ text: "AI use erodes writing skill.", kind: "fact" }],
        clarity_observations: [],
      }),
    });

    const headingText = "Writing in the age of AI";
    const bodyText = "Overreliance on generation may let a writer's own skill atrophy.";
    await evaluateSection(
      docId,
      sectionId,
      `${headingText}\n\n${bodyText}`,
      [
        { blockId: sectionId, text: headingText, isHeading: true },
        { blockId: "p1", text: bodyText, isHeading: false },
      ],
      undefined,
      apiKey,
      undefined,
      undefined,
      true, // skipContradiction — keep it to the fast call
      undefined,
      STRONG
    );

    expect(mockFast).toHaveBeenCalledTimes(1);
    expect(db.saveClaimsForBlock).toHaveBeenCalledWith(docId, sectionId, [
      { text: "AI use erodes writing skill.", kind: "fact" },
    ]);
  });
});

describe("evaluator - suppression matching by anchor text (L5a)", () => {
  const docId = "doc1";
  const apiKey = "mock-key";
  // "the moon is made of cheese" starts at offset 15, length 26 → ends at 41.
  const text = "We assert that the moon is made of cheese here.";
  const anchor = "the moon is made of cheese";

  const fastWithUnsupported = {
    text: JSON.stringify({
      summary: "s",
      claims: [],
      unsupported_claim_observations: [{ text: "No evidence given", substring: anchor }],
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([]); // no contradiction call
  });

  it("a span suppression with anchorText holds when offsets have shifted", async () => {
    // Captured at stale offsets 0:5, but carries the anchor text.
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValueOnce([
      {
        id: "s1",
        docId,
        type: "unsupported_claim",
        kind: "problem",
        severity: "medium",
        spanSignature: "block1:0:5",
        anchorText: anchor,
      },
    ]);
    mockFast.mockResolvedValueOnce(fastWithUnsupported);

    await evaluateBlock(docId, "block1", text, undefined, apiKey);

    // Same block + same anchor text → suppressed despite the offset drift.
    expect(db.saveObservation).not.toHaveBeenCalled();
  });

  it("a span suppression does NOT hold in a different block (same anchor text)", async () => {
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValueOnce([
      {
        id: "s1",
        docId,
        type: "unsupported_claim",
        kind: "problem",
        severity: "medium",
        spanSignature: "block1:0:5",
        anchorText: anchor,
      },
    ]);
    mockFast.mockResolvedValueOnce(fastWithUnsupported);

    await evaluateBlock(docId, "block2", text, undefined, apiKey);

    expect(db.saveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "unsupported_claim", blockId: "block2" })
    );
  });

  it("a legacy suppression (no anchorText) still matches by offset signature", async () => {
    // anchorSubstring places the span at block1:15:41 for this text.
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValueOnce([
      {
        id: "s1",
        docId,
        type: "unsupported_claim",
        kind: "problem",
        severity: "medium",
        spanSignature: "block1:15:41",
      },
    ]);
    mockFast.mockResolvedValueOnce(fastWithUnsupported);

    await evaluateBlock(docId, "block1", text, undefined, apiKey);

    expect(db.saveObservation).not.toHaveBeenCalled();
  });

  it("a contradiction suppression keyed on conflictPairKey suppresses the sweep re-emission", async () => {
    const claimA = {
      id: 1,
      docId,
      sourceBlockId: "blockA",
      text: "Launch in Q3.",
      kind: "commitment" as const,
      status: "active" as const,
    };
    const claimB = {
      id: 2,
      docId,
      sourceBlockId: "blockB",
      text: "Launch is delayed to Q4.",
      kind: "commitment" as const,
      status: "active" as const,
    };
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([claimA, claimB]);
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    // Dismissed earlier as a per-section contradiction; suppression carries the
    // offset-free pair key. The sweep anchors the pair whole-block (0:9999).
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([
      {
        id: "s1",
        docId,
        type: "contradiction",
        kind: "problem",
        severity: "high",
        spanSignature: "blockA:5:20|blockB:0:24", // stale per-section span sig
        conflictPairKey: "contradiction::blockA|blockB",
      },
    ]);
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [{ claimAId: 0, claimBId: 1, message: "Q3 vs Q4." }],
        tensions: [],
      }),
    });

    await evaluateLedgerContradictions(docId, "Stage", apiKey);

    expect(mockStrong).toHaveBeenCalledTimes(1); // sweep ran
    expect(db.saveObservation).not.toHaveBeenCalled(); // but the pair is suppressed
  });
});

describe("evaluator - conflict identity unified on conflictPairKey (L5c)", () => {
  const docId = "doc1";
  const apiKey = "mock-key";

  // An existing claim on another block so the per-section contradiction call runs.
  const otherClaim = {
    id: 1,
    docId,
    sourceBlockId: "block2",
    text: "Launch is delayed to Q4.",
    kind: "commitment" as const,
    status: "active" as const,
  };
  const fastWithClaim = {
    text: JSON.stringify({
      summary: "Launch in Q3.",
      claims: [{ text: "Launch in Q3.", kind: "commitment" }],
      clarity_observations: [],
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([otherClaim]);
    vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
    mockFast.mockResolvedValue(fastWithClaim);
  });

  it("dedupes a per-section contradiction against an existing sweep conflict for the same pair (reworded text)", async () => {
    // A sweep-created conflict: whole-block 0:9999, carries grace state.
    const existingConflict: Observation = {
      id: "cx-old",
      docId,
      type: "contradiction",
      scope: "span",
      kind: "problem",
      severity: "high",
      confidence: "low",
      priority: 1.5,
      text: "Original wording: Q3 vs Q4.",
      status: "active",
      blockId: "block1",
      conflictingBlockId: "block2",
      startOffset: 0,
      endOffset: 9999,
      missCount: 1,
    };
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existingConflict]);
    // Per-section re-emits the same pair (block1|block2), precise offsets, REWORDED.
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [
          { newClaimText: "Launch in Q3.", existingClaimId: 0, message: "Reworded: the Q3 date conflicts with Q4." },
        ],
      }),
    });

    await evaluateBlock(docId, "block1", "We plan to launch in Q3.", "Stage", apiKey);

    // Same pair → coalesce: no new card, and the existing one is kept (not
    // superseded/auto-closed), so its grace state survives. Pre-5c this pair
    // mismatched on contentSig and churned (supersede + insert).
    expect(db.saveObservation).not.toHaveBeenCalled();
    expect(db.updateObservationStatus).not.toHaveBeenCalled();
  });

  it("collapses two same-pair conflicts in one batch into a single card", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
    mockStrong.mockResolvedValueOnce({
      text: JSON.stringify({
        contradictions: [
          { newClaimText: "Launch in Q3.", existingClaimId: 0, message: "First phrasing." },
          { newClaimText: "Launch in Q3.", existingClaimId: 0, message: "Second phrasing, same pair." },
        ],
      }),
    });

    await evaluateBlock(docId, "block1", "We plan to launch in Q3.", "Stage", apiKey);

    expect(db.saveObservation).toHaveBeenCalledTimes(1);
    expect(db.saveObservation).toHaveBeenCalledWith(expect.objectContaining({ type: "contradiction" }));
  });

  it("regression-watch: an existing conflict whose pair is not re-emitted still auto-closes", async () => {
    const existingConflict: Observation = {
      id: "cx-old",
      docId,
      type: "contradiction",
      scope: "span",
      kind: "problem",
      severity: "high",
      confidence: "low",
      priority: 1.5,
      text: "Q3 vs Q4.",
      status: "active",
      blockId: "block1",
      conflictingBlockId: "block2",
      startOffset: 0,
      endOffset: 9999,
    };
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existingConflict]);
    mockFast.mockResolvedValueOnce(fastWithClaim);
    mockStrong.mockResolvedValueOnce({ text: JSON.stringify({ contradictions: [] }) });

    await evaluateBlock(docId, "block1", "We plan to launch in Q3.", "Stage", apiKey);

    expect(db.updateObservationStatus).toHaveBeenCalledWith("cx-old", "auto_closed", "resolved_by_edit");
  });
});

describe("evaluator - revert-aware snapshot restore (UX-014 Mechanism 2)", () => {
  const docId = "docRevert";
  const apiKey = "mock-key";

  // A tiny stateful fake DB so the reconciler's auto-close and the restore
  // path's reactivate both observe (and mutate) the same records, mirroring
  // real IndexedDB across the sequence of evaluateSection calls below.
  let stored: Observation[];

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllSnapshots();
    stored = [];
    vi.mocked(db.loadBlockSummary).mockResolvedValue(undefined);
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValue([]);
    vi.mocked(db.loadActiveObservationsForDocument).mockImplementation(async () =>
      stored.filter((o) => o.status === "active")
    );
    vi.mocked(db.loadObservation).mockImplementation(async (id: string) =>
      stored.find((o) => o.id === id)
    );
    vi.mocked(db.saveObservation).mockImplementation(async (o) => {
      stored.push(o as Observation);
    });
    vi.mocked(db.updateObservationStatus).mockImplementation(async (id, status, closureReason) => {
      const o = stored.find((s) => s.id === id);
      if (o) {
        o.status = status;
        if (closureReason !== undefined) o.closureReason = closureReason;
      }
    });
    vi.mocked(db.reactivateObservation).mockImplementation(async (id: string) => {
      const o = stored.find((s) => s.id === id);
      if (o) {
        o.status = "active";
        delete o.closureReason;
      }
    });
  });

  const introMembers = [
    { blockId: "intro", text: "Some intro paragraph." },
    { blockId: "target", text: "Body text worth flagging." },
    { blockId: "trail", text: "Trailing paragraph." },
  ];
  const combinedText = introMembers.map((m) => m.text).join("\n\n");
  const shrunkMembers = [{ blockId: "intro", text: "Some intro paragraph." }];
  const shrunkText = "Some intro paragraph.";

  // Anchored to the "intro" block (not "target"), so it's still a member of
  // the section post-shrink — real anchors don't vanish, they only migrate
  // between which *section* reconciles them, which is Editor.tsx's job, not
  // evaluateSection's; the point under test is evaluateSection's own restore
  // contract, so the anchor stays inside the section given to it in both calls.
  const fastWithClarity = {
    text: JSON.stringify({
      summary: "s",
      claims: [],
      clarity_observations: [{ text: "Vague claim.", substring: "Some intro paragraph." }],
    }),
  };
  const fastEmpty = {
    text: JSON.stringify({ summary: "s2", claims: [], clarity_observations: [] }),
  };

  it("restores the prior observation by id (no model call, no new insert) once membership+text return to a prior state", async () => {
    // 1. Original shape: three-block section, produces one clarity observation.
    mockFast.mockResolvedValueOnce(fastWithClarity);
    await evaluateSection(docId, "intro", combinedText, introMembers, undefined, apiKey);
    expect(db.saveObservation).toHaveBeenCalledTimes(1);
    expect(stored).toHaveLength(1);
    const [obs] = stored;
    expect(obs.status).toBe("active");

    // 2. Transient toggle: the section shrinks to one block with different text
    //    (a real state — new hash) — the fast call runs again and, producing no
    //    observations this time, closes the one anchored to a still-member block.
    mockFast.mockResolvedValueOnce(fastEmpty);
    await evaluateSection(docId, "intro", shrunkText, shrunkMembers, undefined, apiKey);
    expect(mockFast).toHaveBeenCalledTimes(2);
    expect(obs.status).toBe("auto_closed");
    expect(obs.closureReason).toBe("resolved_by_edit");

    // 3. Revert: membership + text return exactly to state 1's shape. This must
    //    restore — not re-call the model, not insert a new observation.
    await evaluateSection(docId, "intro", combinedText, introMembers, undefined, apiKey);
    expect(mockFast).toHaveBeenCalledTimes(2); // no third model call
    expect(db.saveObservation).toHaveBeenCalledTimes(1); // no new insert
    expect(db.reactivateObservation).toHaveBeenCalledWith("mock-id", expect.any(Number));
    expect(stored).toHaveLength(1); // same record, not a duplicate
    expect(obs.status).toBe("active"); // restored, no lingering closure
    expect(obs.closureReason).toBeUndefined();
  });

  it("does not restore when the text differs even if membership matches (a real edit, not a revert)", async () => {
    mockFast.mockResolvedValueOnce(fastWithClarity);
    await evaluateSection(docId, "intro", combinedText, introMembers, undefined, apiKey);
    expect(mockFast).toHaveBeenCalledTimes(1);

    mockFast.mockResolvedValueOnce(fastEmpty);
    const differentText = introMembers
      .map((m) => m.text)
      .join("\n\n")
      .replace("Body text worth flagging.", "Body text now says something else entirely.");
    await evaluateSection(
      docId,
      "intro",
      differentText,
      [
        { blockId: "intro", text: "Some intro paragraph." },
        { blockId: "target", text: "Body text now says something else entirely." },
        { blockId: "trail", text: "Trailing paragraph." },
      ],
      undefined,
      apiKey
    );
    // Different text, same membership → a real change, not a snapshot hit.
    expect(mockFast).toHaveBeenCalledTimes(2);
  });
});
