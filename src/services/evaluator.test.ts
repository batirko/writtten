import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseJSONResponse, evaluateBlock } from "./evaluator";
import * as db from "../store/db";

// Mock the DB module
vi.mock("../store/db", () => {
  return {
    saveBlockSummary: vi.fn(),
    loadBlockSummary: vi.fn(),
    saveClaimsForBlock: vi.fn(),
    loadActiveClaimsForDocument: vi.fn(async () => []),
    saveObservation: vi.fn(),
    loadActiveObservationsForDocument: vi.fn(async () => []),
    updateObservationStatus: vi.fn(),
    loadSuppressionsForDocument: vi.fn(async () => []),
  };
});

// Mock the Gemini model module
const mockFast = vi.fn();
const mockStrong = vi.fn();
vi.mock("../model/gemini", () => {
  return {
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
      type: "clarity",
      scope: "span",
      kind: "problem",
      severity: "low",
      confidence: "medium",
      priority: 0.75,
      text: "Vague launch date",
      status: "active",
      blockId,
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
      .mockResolvedValueOnce([existingClaim])  // glossary call
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
      }
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
          { text: "Vague launch date", substring: "in Q3" }
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
    expect(db.saveObservation).toHaveBeenCalledWith(expect.objectContaining({
      type: "contradiction",
      blockId: "block3",
    }));

    // The low-severity clarity suppression was on block1, so the new clarity nit on block3 should NOT fire (category-wide suppression).
    expect(db.saveObservation).not.toHaveBeenCalledWith(expect.objectContaining({
      type: "clarity",
    }));
  });
});
