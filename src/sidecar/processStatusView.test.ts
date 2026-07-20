import { describe, it, expect } from "vitest";
import { processStatusView, type ProcessStatusInput } from "./processStatusView";

function view(over: Partial<ProcessStatusInput> = {}) {
  return processStatusView({
    pending: 0,
    stalled: false,
    agentReading: false,
    displayTier: null,
    ...over,
  });
}

describe("processStatusView — one activity signal for both engines", () => {
  it("rests when neither engine is doing anything", () => {
    expect(view()).toEqual({ anchorState: "idle", statusText: "idle", dotTier: null });
  });

  it("works while writtten is evaluating, naming the outstanding count", () => {
    expect(view({ pending: 2 })).toMatchObject({
      anchorState: "working",
      statusText: "evaluating · 2",
    });
  });

  // The defect this closes: BYOA makes zero model calls, so `pending` never moves
  // and the always-visible dot stayed grey for the whole time an agent was reading.
  it("works while an agent is reading, even though writtten is idle", () => {
    expect(view({ agentReading: true })).toMatchObject({
      anchorState: "working",
      statusText: "agent reading",
    });
  });

  it("does not say `evaluating` for an agent pass — no model call happened", () => {
    expect(view({ agentReading: true }).statusText).not.toMatch(/evaluating/);
  });

  it("prefers our own count when both engines are live; the agent row carries the rest", () => {
    expect(view({ pending: 1, agentReading: true })).toMatchObject({
      anchorState: "working",
      statusText: "evaluating · 1",
    });
  });
});

describe("processStatusView — what stays writtten's alone", () => {
  // Tier names WHICH MODEL we called. An agent pass has none, so it must never
  // paint the strong-adjudication hue.
  it("never renders a tier hue for an agent-only pass", () => {
    expect(view({ agentReading: true, displayTier: "strong" }).dotTier).toBeNull();
    expect(view({ agentReading: true, displayTier: "fast" }).dotTier).toBeNull();
  });

  it("still renders the tier hue for our own in-flight call", () => {
    expect(view({ pending: 1, displayTier: "strong" }).dotTier).toBe("strong");
    expect(view({ pending: 1, displayTier: "fast" }).dotTier).toBe("fast");
  });

  it("keeps the tier when both are live — the hue describes the call we made", () => {
    expect(view({ pending: 1, agentReading: true, displayTier: "strong" }).dotTier).toBe("strong");
  });

  // The stall detector watches OUR outstanding calls. An agent that simply
  // stopped is reported as `quiet` by the agent row, never as a fault here.
  it("does not let an agent pass raise the stalled state", () => {
    expect(view({ agentReading: true }).anchorState).toBe("working");
  });

  it("stalled outranks everything and carries no tier", () => {
    expect(view({ stalled: true, pending: 1, agentReading: true, displayTier: "fast" })).toEqual({
      anchorState: "stalled",
      statusText: "still working…",
      dotTier: null,
    });
  });
});
