import { describe, it, expect } from "vitest";
import { processStatusView, type ProcessStatusInput } from "./processStatusView";

function view(over: Partial<ProcessStatusInput> = {}) {
  return processStatusView({
    pending: 0,
    stalled: false,
    agentPhrase: null,
    displayTier: null,
    ...over,
  });
}

describe("processStatusView — one verb, both engines", () => {
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
    expect(view({ agentPhrase: "reading · 0:20" })).toMatchObject({
      anchorState: "working",
      statusText: "reading · 0:20",
    });
  });

  it("takes the agent's phrase verbatim — never rewritten into `evaluating`", () => {
    expect(view({ agentPhrase: "reading · 0:20" }).statusText).not.toMatch(/evaluating/);
  });

  it("prefers our own count when both engines are live", () => {
    expect(view({ pending: 1, agentPhrase: "reading · 0:20" })).toMatchObject({
      anchorState: "working",
      statusText: "evaluating · 1",
    });
  });

  it("says the verb once — the agent row carries only the name", () => {
    // Regression guard for the duplication this merge removed: the status row
    // said "agent reading" while the agent row said "reading · 0:20".
    expect(view({ agentPhrase: "reading · 0:20" }).statusText).toBe("reading · 0:20");
  });
});

// `watching` and `idle` are both "nothing is computing" — but one means a critic
// is attached and will react when you type, and the other means nothing will
// happen. Distinct words, neither of them a pulse.
describe("processStatusView — the two kinds of idle", () => {
  it("names watch mode without pulsing the dot", () => {
    expect(view({ agentPhrase: "watching" })).toEqual({
      anchorState: "idle",
      statusText: "watching",
      dotTier: null,
    });
  });

  it("names awaiting pickup without pulsing the dot", () => {
    expect(view({ agentPhrase: "awaiting pickup" })).toEqual({
      anchorState: "idle",
      statusText: "awaiting pickup",
      dotTier: null,
    });
  });

  it("distinguishes watching from plain idle in the status text", () => {
    expect(view({ agentPhrase: "watching" }).statusText).not.toBe(view().statusText);
  });

  // A watch loop can idle for hours. Pulsing on it would be the unresolvable
  // spinner back in a new costume.
  it("only `reading` counts as activity", () => {
    expect(view({ agentPhrase: "watching" }).anchorState).toBe("idle");
    expect(view({ agentPhrase: "awaiting pickup" }).anchorState).toBe("idle");
    expect(view({ agentPhrase: "reading · 0:01" }).anchorState).toBe("working");
  });
});

describe("processStatusView — what stays writtten's alone", () => {
  // Tier names WHICH MODEL we called. An agent pass has none, so it must never
  // paint the strong-adjudication hue.
  it("never renders a tier hue for an agent-only pass", () => {
    expect(view({ agentPhrase: "reading · 0:20", displayTier: "strong" }).dotTier).toBeNull();
    expect(view({ agentPhrase: "reading · 0:20", displayTier: "fast" }).dotTier).toBeNull();
  });

  it("still renders the tier hue for our own in-flight call", () => {
    expect(view({ pending: 1, displayTier: "strong" }).dotTier).toBe("strong");
    expect(view({ pending: 1, displayTier: "fast" }).dotTier).toBe("fast");
  });

  it("keeps the tier when both are live — the hue describes the call we made", () => {
    expect(view({ pending: 1, agentPhrase: "reading · 0:20", displayTier: "strong" }).dotTier).toBe(
      "strong"
    );
  });

  // The stall detector watches OUR outstanding calls. An agent that simply
  // stopped is absent, never a fault.
  it("does not let an agent pass raise the stalled state", () => {
    expect(view({ agentPhrase: "reading · 0:20" }).anchorState).toBe("working");
  });

  it("stalled outranks everything and carries no tier", () => {
    expect(
      view({ stalled: true, pending: 1, agentPhrase: "reading · 0:20", displayTier: "fast" })
    ).toEqual({
      anchorState: "stalled",
      statusText: "still working…",
      dotTier: null,
    });
  });
});
