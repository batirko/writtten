import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduleEval } from "./orchestrator";
import { evaluateSection, evaluateDocument, evaluateLedgerContradictions } from "./evaluator";
import { orphanClaimsForBlock, updateObservationStatus } from "../store/db";
import { harness } from "../debug/harness";
import { subscribeDocSettled } from "../model/docSettleSignal";
import type { EvalContext, SectionMember } from "./types";

/**
 * Engine exclusivity, at the arming layer.
 *
 * A key and a connected agent are two ways to get model access, not two sources
 * (owner, 2026-07-20 — `docs/projects/agent_connected_eval.md` § Engine exclusivity).
 * When the agent holds the slot the built-in evaluator must make no calls at all;
 * running both bills the user twice for observations competing over one feed budget.
 *
 * The load-bearing case is the *exception*: `block-removed` must keep working, since
 * it fires no LLM call and a card anchored to a deleted block is dead whoever wrote
 * it. Gate it by accident and every agent-era card on a deleted block is stranded in
 * the feed forever.
 */

let builtinActive = true;
vi.mock("./evalEngine", () => ({
  isBuiltinEngineActive: () => builtinActive,
}));

vi.mock("./evaluator", () => ({
  evaluateSection: vi.fn(async () => {}),
  evaluateDocument: vi.fn(async () => {}),
  evaluateLedgerContradictions: vi.fn(async () => {}),
}));

const activeObservations = [
  { id: "ext-1", blockId: "secA", type: "clarity", kind: "x", severity: 1, scope: "block", text: "" },
];
vi.mock("../store/db", () => ({
  loadActiveObservationsForDocument: vi.fn(async () => activeObservations),
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
const TEXT = "Some text long enough to evaluate.";

function memberFor(id: string): SectionMember[] {
  return [{ blockId: id, text: TEXT }];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  builtinActive = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("orchestrator — the agent holds the slot", () => {
  it("arms no section eval on settle", async () => {
    builtinActive = false;
    scheduleEval({ kind: "block-settle-pause", sectionId: "secA", members: memberFor("secA") }, TEXT, ctx);
    await vi.runAllTimersAsync();
    expect(evaluateSection).not.toHaveBeenCalled();
  });

  it("fires no doc-level, stage-change, or bulk-paste call", async () => {
    builtinActive = false;
    scheduleEval({ kind: "doc-idle" }, null, ctx);
    scheduleEval({ kind: "stage-changed", previousStage: "drafting" }, null, ctx);
    scheduleEval({ kind: "block-paste", blockIds: ["secA"] }, null, ctx);
    await vi.runAllTimersAsync();
    expect(evaluateDocument).not.toHaveBeenCalled();
    expect(evaluateLedgerContradictions).not.toHaveBeenCalled();
  });

  /**
   * UX-033, at the layer that caused it. The gate above stops *evaluations*; it must
   * not stop the *fact that the document settled*, which is what wakes a connected
   * agent. This regression shipped because the agent's wake was derived from the
   * activity count the test below asserts stays at zero — so the two properties are
   * in direct tension and are deliberately pinned side by side. A future change that
   * satisfies one by breaking the other fails here.
   */
  it("still announces the settle, so a connected agent gets woken", async () => {
    builtinActive = false;
    const woken = vi.fn();
    const off = subscribeDocSettled(woken);
    scheduleEval(
      { kind: "block-settle-pause", sectionId: "secA", members: memberFor("secA") },
      TEXT,
      ctx
    );
    await vi.runAllTimersAsync();
    expect(woken).toHaveBeenCalledTimes(1);
    off();
  });

  it("collapses a burst across sections into one settle announcement", async () => {
    builtinActive = false;
    const woken = vi.fn();
    const off = subscribeDocSettled(woken);
    scheduleEval(
      { kind: "block-settle-pause", sectionId: "secA", members: memberFor("secA") },
      TEXT,
      ctx
    );
    scheduleEval(
      { kind: "block-settle-completion", sectionId: "secB", members: memberFor("secB") },
      TEXT,
      ctx
    );
    await vi.runAllTimersAsync();
    // One push per burst, not one per section — the agent re-reads the whole
    // document anyway, so N pushes would cost it N passes for one edit.
    expect(woken).toHaveBeenCalledTimes(1);
    off();
  });

  /**
   * The readout must not lie about work that will never run. Gating at the arming
   * layer means no coalesce timer is ever created, so `recomputePending()` stays at
   * zero and the activity dot rests — rather than pulsing "evaluating · 1" forever.
   */
  it("never raises the pending count, so the activity dot stays at rest", async () => {
    builtinActive = false;
    scheduleEval({ kind: "block-settle-pause", sectionId: "secA", members: memberFor("secA") }, TEXT, ctx);
    await vi.runAllTimersAsync();
    const raised = vi.mocked(harness.setPending).mock.calls.filter(([n]) => (n as number) > 0);
    expect(raised).toEqual([]);
  });

  /**
   * Callers treat `onComplete` as "the scheduled work finished" — App's handler
   * retires the first-run welcome modal off it. Swallowing it on the gated path
   * would leave a BYOA user stuck behind the modal forever.
   */
  it("still reports completion to the caller", async () => {
    builtinActive = false;
    const onComplete = vi.fn();
    scheduleEval({ kind: "doc-idle" }, null, ctx, onComplete);
    await vi.runAllTimersAsync();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  /**
   * THE exemption. `block-removed` makes no LLM call, and the anchored block is
   * gone — so the card is dead whoever wrote it. This is the one auto-close that is
   * not an evaluator judgement (`isEvaluatorOwned`, evaluatorReconcile.ts).
   */
  it("still orphans claims and closes cards when a block is deleted", async () => {
    builtinActive = false;
    const onComplete = vi.fn();
    scheduleEval({ kind: "block-removed", blockId: "secA" }, null, ctx, onComplete);
    await vi.runAllTimersAsync();

    expect(orphanClaimsForBlock).toHaveBeenCalledWith("secA");
    expect(updateObservationStatus).toHaveBeenCalledWith("ext-1", "auto_closed", "text_removed");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("orchestrator — switching engines mid-flight", () => {
  /**
   * The leak the arming gate alone does not close. A doc-idle deferred for RPM
   * re-enters via `setTimeout` 30 s later — plenty of time for the user to have
   * switched to their agent. Firing then burns exactly the strong call they opted
   * out of, which is the double-billing this milestone is named after.
   */
  it("does not fire a coalescing section eval armed before the switch", async () => {
    scheduleEval({ kind: "block-settle-pause", sectionId: "secA", members: memberFor("secA") }, TEXT, ctx);
    // Still inside the coalesce window — the user switches engines now.
    builtinActive = false;
    await vi.runAllTimersAsync();
    expect(evaluateSection).not.toHaveBeenCalled();
  });

  it("runs normally when the built-in engine keeps the slot", async () => {
    scheduleEval({ kind: "block-settle-pause", sectionId: "secA", members: memberFor("secA") }, TEXT, ctx);
    await vi.runAllTimersAsync();
    expect(evaluateSection).toHaveBeenCalledTimes(1);
  });
});
