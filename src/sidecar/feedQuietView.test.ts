import { describe, it, expect } from "vitest";
import { feedQuietView, type FeedQuietInput } from "./feedQuietView";

/**
 * The empty feed used to say one sentence for three different facts. These cases
 * pin which fact each state answers, per engine — the point of the module is that
 * the two engines reach the same words from different evidence, so most cases
 * appear twice on purpose.
 */

const AGENT: FeedQuietInput = {
  engine: "agent",
  maturity: "forming",
  agentPhase: "watching",
  agentHasPulled: true,
  pending: 0,
  lastCompletedAt: null,
};

const BUILTIN: FeedQuietInput = {
  engine: "builtin",
  maturity: "forming",
  agentPhase: null,
  agentHasPulled: false,
  pending: 0,
  lastCompletedAt: 1_000,
};

describe("feedQuietView", () => {
  describe("below the maturity threshold", () => {
    it("names the hold for the agent engine", () => {
      const v = feedQuietView({ ...AGENT, maturity: "unformed" });
      expect(v.state).toBe("below-threshold");
      expect(v.headline).toMatch(/nothing to react to yet/i);
    });

    it("names the same hold for the built-in engine", () => {
      // The owner's call: both engines, one vocabulary. A keyed user below the
      // band is in the identical situation and used to be told "quiet while you
      // draft" — which at least described drafting, but never said anything was
      // being withheld.
      const v = feedQuietView({ ...BUILTIN, maturity: "unformed" });
      expect(v.state).toBe("below-threshold");
      expect(v.headline).toMatch(/nothing to react to yet/i);
    });

    it("says the defect half still runs, because it does", () => {
      // Load-bearing since UX-053: the band holds the four whole-document types
      // and nothing else. Copy that implied total silence would now be false.
      const v = feedQuietView({ ...AGENT, maturity: "unformed" });
      expect(v.subtext).toMatch(/contradictions and unsupported claims still surface/i);
    });

    it("outranks a finished pass — a clean bill on a thin draft would mislead", () => {
      // The agent has pulled and parked, which on a fuller draft reads
      // "nothing to raise". Below the band that invites exactly the wrong
      // conclusion, since most of the critic has not weighed in.
      const v = feedQuietView({
        ...AGENT,
        maturity: "unformed",
        agentPhase: "watching",
        agentHasPulled: true,
      });
      expect(v.state).toBe("below-threshold");
    });

    it("outranks the built-in engine's finished pass too", () => {
      const v = feedQuietView({ ...BUILTIN, maturity: "unformed", lastCompletedAt: 1_000 });
      expect(v.state).toBe("below-threshold");
    });
  });

  describe("a pass finished and found nothing", () => {
    it("says so for an agent parked after pulling this version", () => {
      const v = feedQuietView({ ...AGENT, agentPhase: "watching", agentHasPulled: true });
      expect(v.state).toBe("read-nothing-found");
      expect(v.headline).toMatch(/nothing to raise/i);
    });

    it("counts an agent that has since gone quiet — it still read the draft", () => {
      // `quiet` is about the agent's presence, which the agent row reports. It
      // does not un-read the pass that already happened.
      const v = feedQuietView({ ...AGENT, agentPhase: "quiet", agentHasPulled: true });
      expect(v.state).toBe("read-nothing-found");
    });

    it("says so for the built-in engine once an evaluation has completed", () => {
      const v = feedQuietView({ ...BUILTIN, pending: 0, lastCompletedAt: 1_000 });
      expect(v.state).toBe("read-nothing-found");
    });
  });

  describe("the author has edited since the last pass", () => {
    it("is an agent-only state", () => {
      const v = feedQuietView({ ...AGENT, agentPhase: "awaiting", agentHasPulled: false });
      expect(v.state).toBe("awaiting-pickup");
      expect(v.headline).toMatch(/haven't been read yet/i);
    });

    it("has no built-in analogue, and manufacturing one would flicker per keystroke", () => {
      // Our own queue always picks the work up within the debounce, so the only
      // gap is the settle window. An agent is a peer that might never come back;
      // that asymmetry is the whole reason this state exists for one engine only.
      const states = new Set(
        [0, 1, 5].map((pending) => feedQuietView({ ...BUILTIN, pending }).state)
      );
      expect(states.has("awaiting-pickup")).toBe(false);
    });
  });

  describe("falls back rather than guessing", () => {
    it("keeps the original copy before an agent has done anything", () => {
      const v = feedQuietView({ ...AGENT, agentPhase: "none", agentHasPulled: false });
      expect(v.state).toBe("default");
      expect(v.headline).toMatch(/quiet while you draft/i);
    });

    it("keeps the original copy while an agent is mid-pass", () => {
      const v = feedQuietView({ ...AGENT, agentPhase: "reading", agentHasPulled: true });
      expect(v.state).toBe("default");
    });

    it("does not claim a built-in pass finished when none ever ran", () => {
      // `lastCompletedAt === null` is the difference between "nothing has read this"
      // and "something read it and had nothing to say". Treating null as a
      // timestamp would print the confident message in the one state it is false.
      const v = feedQuietView({ ...BUILTIN, pending: 0, lastCompletedAt: null });
      expect(v.state).toBe("default");
    });

    it("does not claim a built-in pass finished while one is in flight", () => {
      const v = feedQuietView({ ...BUILTIN, pending: 2, lastCompletedAt: 1_000 });
      expect(v.state).toBe("default");
    });

    it("ignores agent facts entirely while the built-in engine holds the slot", () => {
      // Pass facts outlive a revoke, so a stale phase must not speak for an
      // engine that isn't selected — the same rule processStatusView enforces.
      const v = feedQuietView({
        ...BUILTIN,
        agentPhase: "awaiting",
        agentHasPulled: true,
        lastCompletedAt: null,
      });
      expect(v.state).toBe("default");
    });
  });

  it("gives every state distinct copy", () => {
    // A state that renders identically to another is a state the author cannot
    // actually tell apart, which is the bug this module exists to fix.
    const seen = [
      feedQuietView({ ...AGENT, maturity: "unformed" }),
      feedQuietView({ ...AGENT, agentPhase: "awaiting", agentHasPulled: false }),
      feedQuietView({ ...AGENT, agentPhase: "watching", agentHasPulled: true }),
      feedQuietView({ ...AGENT, agentPhase: "none", agentHasPulled: false }),
    ];
    expect(new Set(seen.map((v) => v.state)).size).toBe(4);
    expect(new Set(seen.map((v) => v.headline)).size).toBe(4);
  });
});
