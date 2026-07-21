import { describe, it, expect } from "vitest";
import {
  agentPassPhase,
  agentStatusPhrase,
  formatElapsed,
  AGENT_PASS_IDLE_MS,
  EMPTY_PASS,
  type AgentPass,
} from "./agentActivityView";

const T = 1_000_000;

function pass(over: Partial<AgentPass> = {}): AgentPass {
  return { ...EMPTY_PASS, ...over };
}

describe("agentPassPhase", () => {
  it("is `none` before anything has travelled", () => {
    expect(agentPassPhase(EMPTY_PASS, T)).toBe("none");
  });

  it("is `awaiting` once a snapshot is pushed but the agent hasn't pulled it", () => {
    expect(agentPassPhase(pass({ lastPushAt: T }), T + 5_000)).toBe("awaiting");
  });

  it("is `reading` from the pull onward", () => {
    expect(agentPassPhase(pass({ lastPushAt: T, lastPullAt: T + 100 }), T + 5_000)).toBe("reading");
  });

  // The load-bearing case: "finished" is not observable, so the working state
  // must resolve on its own or it becomes a spinner that never stops.
  it("decays to `quiet` after the idle window with no further signal", () => {
    const p = pass({ lastPushAt: T, lastPullAt: T + 100 });
    expect(agentPassPhase(p, T + 100 + AGENT_PASS_IDLE_MS - 1)).toBe("reading");
    expect(agentPassPhase(p, T + 100 + AGENT_PASS_IDLE_MS)).toBe("quiet");
  });

  it("a submission re-arms the window — an agent still submitting is still working", () => {
    const late = T + AGENT_PASS_IDLE_MS * 2;
    const p = pass({ lastPushAt: T, lastPullAt: T + 100, lastSubmissionAt: late });
    expect(agentPassPhase(p, late + 1_000)).toBe("reading");
  });

  it("decay is derived, not scheduled — the same pass reads differently as time passes", () => {
    const p = pass({ lastPushAt: T, lastPullAt: T });
    // No timer fired between these two calls; only `now` moved.
    expect(agentPassPhase(p, T)).toBe("reading");
    expect(agentPassPhase(p, T + AGENT_PASS_IDLE_MS * 10)).toBe("quiet");
  });
});

// The distinction the phase set exists for: a parked agent and an absent one are
// both "not computing", but one reacts the moment you type and the other never
// will. Collapsing them into one `idle` is what let a stalled watch-loop hide.
describe("agentPassPhase — watch mode", () => {
  it("is `watching` while parked in /wait", () => {
    expect(agentPassPhase(pass({ lastPushAt: T, lastWaitAt: T + 100 }), T + 5_000)).toBe(
      "watching"
    );
  });

  it("walks the watch cycle without a state machine — park, wake, read, park", () => {
    const p1 = pass({ lastPushAt: T, lastWaitAt: T + 100 });
    expect(agentPassPhase(p1, T + 200)).toBe("watching");
    // Wait resolves and the agent pulls: the newer signal wins.
    const p2 = { ...p1, lastPullAt: T + 300 };
    expect(agentPassPhase(p2, T + 400)).toBe("reading");
    // It submits mid-review — still reading, it hasn't gone back to waiting.
    const p3 = { ...p2, lastSubmissionAt: T + 500 };
    expect(agentPassPhase(p3, T + 600)).toBe("reading");
    // And parks again.
    const p4 = { ...p3, lastWaitAt: T + 700 };
    expect(agentPassPhase(p4, T + 800)).toBe("watching");
  });

  it("a watching agent that stops watching decays like any other", () => {
    const p = pass({ lastPushAt: T, lastWaitAt: T });
    expect(agentPassPhase(p, T + AGENT_PASS_IDLE_MS - 1)).toBe("watching");
    expect(agentPassPhase(p, T + AGENT_PASS_IDLE_MS)).toBe("quiet");
  });

  // /wait times out on its own every ~60s and the agent re-calls, which lands
  // comfortably inside the 90s window — a watching agent must not flicker.
  it("stays watching across the bridge's own /wait timeout cycle", () => {
    let p = pass({ lastPushAt: T, lastWaitAt: T });
    for (let cycle = 1; cycle <= 5; cycle++) {
      const reCall = T + cycle * 60_000;
      expect(agentPassPhase(p, reCall - 1)).toBe("watching");
      p = { ...p, lastWaitAt: reCall };
    }
  });
});

describe("agentStatusPhrase", () => {
  it("says nothing when there is no agent claim on the status row", () => {
    expect(agentStatusPhrase(EMPTY_PASS, T)).toBeNull();
  });

  it("reports awaiting pickup rather than implying work is underway", () => {
    expect(agentStatusPhrase(pass({ lastPushAt: T }), T + 1_000)).toBe("awaiting pickup");
  });

  it("carries a live elapsed counter while reading", () => {
    expect(agentStatusPhrase(pass({ lastPushAt: T, lastPullAt: T }), T + 47_000)).toBe(
      "reading · 0:47"
    );
  });

  it("names watch mode plainly", () => {
    expect(agentStatusPhrase(pass({ lastPushAt: T, lastWaitAt: T }), T + 5_000)).toBe("watching");
  });

  // `quiet` yields the row rather than coining a second word for the same
  // non-event — the hollow dot on the agent row already says "attached, idle".
  it("yields the status row entirely once the pass has decayed", () => {
    const p = pass({ lastPushAt: T, lastPullAt: T });
    expect(agentStatusPhrase(p, T + AGENT_PASS_IDLE_MS + 1)).toBeNull();
  });

  it("never claims completion — no phrase implies the pass ended", () => {
    const cases = [
      pass({ lastPushAt: T }),
      pass({ lastPushAt: T, lastPullAt: T }),
      pass({ lastPushAt: T, lastWaitAt: T }),
    ];
    for (const p of cases) {
      expect(agentStatusPhrase(p, T + 1_000)).not.toMatch(/done|finish|complete/i);
    }
  });
});

describe("formatElapsed", () => {
  it("formats mm:ss with a padded seconds field", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7_000)).toBe("0:07");
    expect(formatElapsed(107_000)).toBe("1:47");
  });

  it("lets minutes run past an hour rather than wrapping to a wrong number", () => {
    expect(formatElapsed(4_400_000)).toBe("73:20");
  });

  it("clamps a negative interval (clock skew) to zero", () => {
    expect(formatElapsed(-5_000)).toBe("0:00");
  });
});

// ---------------------------------------------------------------------------
// The three truthfulness fixes (UX-034 / UX-035 / UX-036)
// ---------------------------------------------------------------------------

describe("reading stretch, not last pull (UX-035)", () => {
  /**
   * The bug in one assertion. The counter read `now - lastPullAt`, so a polling
   * agent re-zeroed it on every `GET /doc` — `reading · 0:00` over a pass that
   * was minutes old, understating how long the author had been waiting.
   */
  it("keeps counting across repeated pulls", () => {
    const p = pass({
      readingSince: T,
      lastPullAt: T + 130_000, // polled again 10s ago
    });
    expect(agentStatusPhrase(p, T + 140_000)).toBe("reading · 2:20");
  });

  it("falls back to the last pull for a pass with no stretch recorded", () => {
    // A live session across a reload: the field is absent, but `now` would
    // print a fresh 0:00 over a review already under way.
    const p = pass({ lastPullAt: T });
    expect(agentStatusPhrase(p, T + 7_000)).toBe("reading · 0:07");
  });
});

describe("landed count (UX-036)", () => {
  it("is omitted until something lands", () => {
    expect(agentStatusPhrase(pass({ readingSince: T, lastPullAt: T }), T + 5_000)).toBe(
      "reading · 0:05"
    );
  });

  it("reports what reached the feed", () => {
    const p = pass({ readingSince: T, lastPullAt: T, accepted: 2 });
    expect(agentStatusPhrase(p, T + 5_000)).toBe("reading · 0:05 · 2 landed");
  });
});

describe("observed departure (UX-034)", () => {
  it("goes quiet immediately, without waiting out the idle window", () => {
    const p = pass({ lastPullAt: T, lastWaitAt: T + 1_000, partedAt: T + 2_000 });
    // Well inside AGENT_PASS_IDLE_MS — previously this read `watching`.
    expect(agentPassPhase(p, T + 3_000)).toBe("quiet");
    expect(agentStatusPhrase(p, T + 3_000)).toBeNull();
  });

  /**
   * A departure is a fact about a moment, not a latch. The bridge reports a
   * dropped `/wait` and the agent may reconnect and pull straight after; a stale
   * `partedAt` must not pin a live pass to `quiet`.
   */
  it("is overridden by a later signal — the agent came back", () => {
    const p = pass({ partedAt: T, lastPullAt: T + 1_000, readingSince: T + 1_000 });
    expect(agentPassPhase(p, T + 4_000)).toBe("reading");
    expect(agentStatusPhrase(p, T + 4_000)).toBe("reading · 0:03");
  });
});
