import { describe, it, expect } from "vitest";
import { processStatusView, type ProcessStatusInput } from "./processStatusView";

/** Defaults to a **ready** engine — the cases below are about what a working
 *  configuration says, so readiness is the uninteresting variable there. The cases
 *  that turn it off are grouped at the bottom of the file. */
function view(over: Partial<ProcessStatusInput> = {}) {
  return processStatusView({
    engine: "builtin",
    engineReady: true,
    pending: 0,
    stalled: false,
    agentPhrase: null,
    displayTier: null,
    // Past the threshold by default: the cases below are about what a developed
    // document says. The band-specific ones are grouped at the bottom of the file.
    maturity: "forming",
    ...over,
  });
}

/** The agent engine holds the slot. Its phrase is only ever consulted here. */
function agentView(over: Partial<ProcessStatusInput> = {}) {
  return view({ engine: "agent", ...over });
}

describe("processStatusView — one verb, whichever engine holds the slot", () => {
  it("rests when the selected engine is doing nothing", () => {
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
  it("works while an agent is reading, even though writtten makes no call", () => {
    expect(agentView({ agentPhrase: "reading · 0:20" })).toMatchObject({
      anchorState: "working",
      statusText: "reading · 0:20",
    });
  });

  it("takes the agent's phrase verbatim — never rewritten into `evaluating`", () => {
    expect(agentView({ agentPhrase: "reading · 0:20" }).statusText).not.toMatch(/evaluating/);
  });

  /**
   * Not "both engines are live" any more — only one holds the slot. This is the
   * residue window: a call armed just before the user switched to the agent, which
   * is deliberately never cancelled. Our own count still wins, because it describes
   * work that is genuinely still outstanding.
   */
  it("prefers our own count over an agent phrase while an armed call drains", () => {
    expect(agentView({ pending: 1, agentPhrase: "reading · 0:20" })).toMatchObject({
      anchorState: "working",
      statusText: "evaluating · 1",
    });
  });

  it("says the verb once — the identity row carries only the name", () => {
    // Regression guard for the duplication this merge removed: the status row said
    // "agent reading" while a separate agent row said "reading · 0:20". The split is
    // now identity row (noun) vs status row (verb).
    expect(agentView({ agentPhrase: "reading · 0:20" }).statusText).toBe("reading · 0:20");
  });

  /**
   * Engine exclusivity, enforced. `agentStatusPhrase` derives from `agentSource.pass`,
   * which lingers after a revoke — so without this gate a torn-down source would keep
   * painting "reading · 0:20" while the built-in evaluator sat idle.
   */
  it("ignores a stale agent phrase when the built-in engine holds the slot", () => {
    expect(view({ agentPhrase: "reading · 0:20" })).toEqual({
      anchorState: "idle",
      statusText: "idle",
      dotTier: null,
    });
  });
});

// `watching` and `idle` are both "nothing is computing" — but one means a critic
// is attached and will react when you type, and the other means nothing will
// happen. Distinct words, neither of them a pulse.
describe("processStatusView — the two kinds of idle", () => {
  it("names watch mode without pulsing the dot", () => {
    expect(agentView({ agentPhrase: "watching" })).toEqual({
      anchorState: "idle",
      statusText: "watching",
      dotTier: null,
    });
  });

  it("names awaiting pickup without pulsing the dot", () => {
    expect(agentView({ agentPhrase: "awaiting pickup" })).toEqual({
      anchorState: "idle",
      statusText: "awaiting pickup",
      dotTier: null,
    });
  });

  it("distinguishes watching from plain idle in the status text", () => {
    expect(agentView({ agentPhrase: "watching" }).statusText).not.toBe(view().statusText);
  });

  // A watch loop can idle for hours. Pulsing on it would be the unresolvable
  // spinner back in a new costume.
  it("only `reading` counts as activity", () => {
    expect(agentView({ agentPhrase: "watching" }).anchorState).toBe("idle");
    expect(agentView({ agentPhrase: "awaiting pickup" }).anchorState).toBe("idle");
    expect(agentView({ agentPhrase: "reading · 0:01" }).anchorState).toBe("working");
  });
});

describe("processStatusView — what stays writtten's alone", () => {
  // Tier names WHICH MODEL we called. An agent pass has none, so it must never
  // paint the strong-tier hue.
  it("never renders a tier hue for an agent-only pass", () => {
    expect(agentView({ agentPhrase: "reading · 0:20", displayTier: "strong" }).dotTier).toBeNull();
    expect(agentView({ agentPhrase: "reading · 0:20", displayTier: "fast" }).dotTier).toBeNull();
  });

  it("still renders the tier hue for our own in-flight call", () => {
    expect(view({ pending: 1, displayTier: "strong" }).dotTier).toBe("strong");
    expect(view({ pending: 1, displayTier: "fast" }).dotTier).toBe("fast");
  });

  it("keeps the tier while an armed call drains under the agent engine", () => {
    expect(
      agentView({ pending: 1, agentPhrase: "reading · 0:20", displayTier: "strong" }).dotTier
    ).toBe("strong");
  });

  // The stall detector watches OUR outstanding calls. An agent that simply
  // stopped is absent, never a fault.
  it("does not let an agent pass raise the stalled state", () => {
    expect(agentView({ agentPhrase: "reading · 0:20" }).anchorState).toBe("working");
  });

  it("stalled outranks everything and carries no tier", () => {
    expect(
      agentView({ stalled: true, pending: 1, agentPhrase: "reading · 0:20", displayTier: "fast" })
    ).toEqual({
      anchorState: "stalled",
      statusText: "still working…",
      dotTier: null,
    });
  });
});

/**
 * The third kind of idle, and the one that used to be invisible: an engine is
 * selected but nothing is attached to it.
 *
 * This became an ordinary resting state on 2026-07-21, when disconnecting an agent
 * stopped releasing the eval slot. Before that it was mostly unreachable — anything
 * that stopped an engine working also moved the selection — which is why `idle` was
 * allowed to mean both "configured and waiting" and "cannot run at all".
 */
describe("processStatusView — an engine that cannot run", () => {
  it("says nothing is reading rather than resting on `idle`", () => {
    expect(view({ engineReady: false })).toMatchObject({
      anchorState: "idle",
      statusText: "nothing reading",
    });
  });

  it("does not pulse the dot for an engine that cannot run", () => {
    expect(view({ engineReady: false }).anchorState).toBe("idle");
  });

  /**
   * The agent case is the sharp one. `pass` facts outlive the connection, so a
   * dropped agent kept resting on `watching` — which promises a critic will react
   * the moment you type, when in fact nothing will. Readiness outranks the phrase.
   */
  it("overrides a stale agent phrase left behind by a dropped connection", () => {
    expect(
      agentView({ engineReady: false, agentPhrase: "watching" }).statusText
    ).toBe("nothing reading");
  });

  /**
   * …but only for the resting claim. Work genuinely in flight outranks a claim about
   * configuration: a call armed before the engine changed is never cancelled, and
   * printing "nothing reading" over it would lie while writtten is demonstrably
   * computing — in exactly the window a user is most likely to be confused.
   */
  it("still reports work in flight, which outranks the configuration claim", () => {
    expect(view({ engineReady: false, pending: 2 })).toMatchObject({
      anchorState: "working",
      statusText: "evaluating · 2",
    });
  });

  it("still reports a stall, which outranks the configuration claim", () => {
    expect(view({ engineReady: false, stalled: true })).toMatchObject({
      anchorState: "stalled",
      statusText: "still working…",
    });
  });
});

// UX-053: `watching` meant two opposite things — *a critic is attached and
// reacting*, and *a critic is holding the whole-document read back because there
// isn't enough draft yet*. An author who hit the second read it as the first and
// waited. The band splits them; these cases pin how narrowly.
describe("below the maturity threshold — the one phrase the row gains", () => {
  it("says a parked agent is holding off, not merely watching", () => {
    expect(agentView({ maturity: "unformed", agentPhrase: "watching" })).toMatchObject({
      anchorState: "idle",
      statusText: "holding off",
    });
  });

  it("says the same for a resting built-in engine, so one document gets one word", () => {
    // Without this the identical draft reads `holding off` with an agent and
    // `idle` with a key — the split the both-engines decision exists to avoid.
    expect(view({ maturity: "unformed" })).toMatchObject({ statusText: "holding off" });
  });

  it("returns to the ordinary vocabulary once the band moves", () => {
    // The phrase is temporary by design: past the threshold nothing lingers.
    expect(agentView({ maturity: "forming", agentPhrase: "watching" })).toMatchObject({
      statusText: "watching",
    });
    expect(view({ maturity: "mature" })).toMatchObject({ statusText: "idle" });
  });

  it("never overwrites a phrase that reports actual work", () => {
    // The band now splits the agent's pass rather than suspending it, so an agent
    // CAN be reading below the threshold. Claiming it is holding off would trade
    // one lie for another.
    expect(agentView({ maturity: "unformed", agentPhrase: "reading · 0:12" })).toMatchObject({
      anchorState: "working",
      statusText: "reading · 0:12",
    });
    expect(agentView({ maturity: "unformed", agentPhrase: "awaiting pickup" })).toMatchObject({
      statusText: "awaiting pickup",
    });
  });

  it("does not call an absent agent a deliberate hold", () => {
    // `quiet` and `none` both render as the null phrase. Neither earns the word:
    // an agent that has not been heard from may simply have wandered off, and
    // promising a critic that isn't there is the overclaim engineReady exists to stop.
    expect(agentView({ maturity: "unformed", agentPhrase: null })).toMatchObject({
      statusText: "idle",
    });
  });

  describe("stays ranked below every claim about work actually in flight", () => {
    it("loses to a stall", () => {
      expect(
        agentView({ maturity: "unformed", agentPhrase: "watching", stalled: true })
      ).toMatchObject({ statusText: "still working…" });
    });

    it("loses to our own outstanding call", () => {
      // A call armed before an engine switch is deliberately never cancelled, so
      // a non-zero count under the agent engine is real work, not staleness.
      expect(
        agentView({ maturity: "unformed", agentPhrase: "watching", pending: 3 })
      ).toMatchObject({ statusText: "evaluating · 3" });
    });

    it("loses to a missing engine", () => {
      // "cannot run at all" outranks "deliberately resting" — otherwise a user
      // with no key reads a considered pause into a broken configuration.
      expect(
        agentView({ maturity: "unformed", agentPhrase: "watching", engineReady: false })
      ).toMatchObject({ statusText: "nothing reading" });
    });
  });
});
