import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduleEval } from "./orchestrator";
import { evaluateSection } from "./evaluator";
import type { EvalContext, SectionMember } from "./types";

// Mock the evaluator: we only want to drive the orchestrator's lifecycle/
// generation wiring, not run a real eval. evaluateSection is replaced with a
// controllable in-flight promise so we can observe the isLive predicate it was
// handed while a block-removed arrives mid-flight.
vi.mock("./evaluator", () => ({
  evaluateSection: vi.fn(),
  evaluateDocument: vi.fn(async () => {}),
  evaluateLedgerContradictions: vi.fn(async () => {}),
}));

// Quiet the orchestrator's collaborators.
vi.mock("../store/db", () => ({
  loadActiveObservationsForDocument: vi.fn(async () => []),
  orphanClaimsForBlock: vi.fn(async () => {}),
  updateObservationStatus: vi.fn(async () => {}),
  deleteBlockSummary: vi.fn(async () => {}),
}));
vi.mock("../model/logger", () => ({ llmLogger: { log: vi.fn() } }));
vi.mock("../debug/harness", () => ({
  harness: { setPending: vi.fn(), emit: vi.fn(), archive: vi.fn() },
}));
vi.mock("../model/rpmBudget", () => ({ isNearLimit: () => false }));
vi.mock("nanoid", () => ({ nanoid: () => "mock-id" }));

const ctx: EvalContext = { docId: "doc1", apiKey: "key" };

function memberFor(id: string): SectionMember[] {
  return [{ blockId: id, text: "Some text long enough to evaluate." }];
}

describe("orchestrator - block-removal liveness guard (L4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips the in-flight section's isLive to false when its block is removed", async () => {
    const id = "secA";
    let capturedIsLive: (() => boolean) | undefined;
    let resolveEval!: () => void;
    vi.mocked(evaluateSection).mockImplementation((...args) => {
      capturedIsLive = args[11] as () => boolean;
      return new Promise<void>((r) => {
        resolveEval = r;
      });
    });

    // Settle → coalesce window → dispatch fires evaluateSection (stays in-flight).
    scheduleEval(
      { kind: "block-settle-pause", sectionId: id, members: memberFor(id) },
      "Some text long enough to evaluate.",
      ctx
    );
    vi.advanceTimersByTime(300);
    await Promise.resolve(); // let dispatch's async body reach the await

    expect(evaluateSection).toHaveBeenCalledTimes(1);
    expect(capturedIsLive).toBeDefined();
    expect(capturedIsLive!()).toBe(true);

    // Remove the block mid-flight — bumpSectionGeneration runs synchronously.
    scheduleEval({ kind: "block-removed", blockId: id }, null, ctx);
    expect(capturedIsLive!()).toBe(false);

    resolveEval();
    await vi.runAllTimersAsync();
  });

  it("does not invalidate an unrelated in-flight section when a different block is removed", async () => {
    const id = "secB";
    let capturedIsLive: (() => boolean) | undefined;
    let resolveEval!: () => void;
    vi.mocked(evaluateSection).mockImplementation((...args) => {
      capturedIsLive = args[11] as () => boolean;
      return new Promise<void>((r) => {
        resolveEval = r;
      });
    });

    scheduleEval(
      { kind: "block-settle-pause", sectionId: id, members: memberFor(id) },
      "Some text long enough to evaluate.",
      ctx
    );
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(capturedIsLive!()).toBe(true);

    // A *different* block is removed — secB's eval stays live.
    scheduleEval({ kind: "block-removed", blockId: "someOtherBlock" }, null, ctx);
    expect(capturedIsLive!()).toBe(true);

    resolveEval();
    await vi.runAllTimersAsync();
  });
});
