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
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValueOnce([]);

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

    // Clarity observation saved
    expect(db.saveObservation).toHaveBeenCalledWith({
      id: "mock-id",
      docId,
      type: "clarity",
      scope: "span",
      nature: "defect",
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

    // Existing active claims in DB from another block
    vi.mocked(db.loadActiveClaimsForDocument).mockResolvedValueOnce([
      {
        id: 42,
        docId,
        sourceBlockId: "block2",
        text: "Launch is delayed to Q4.",
        kind: "commitment",
        status: "active",
      },
    ]);

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

    // Contradiction observation saved
    expect(db.saveObservation).toHaveBeenCalledWith({
      id: "mock-id",
      docId,
      type: "contradiction",
      scope: "span",
      nature: "defect",
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
});
