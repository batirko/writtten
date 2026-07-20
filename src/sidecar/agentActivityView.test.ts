import { describe, it, expect } from "vitest";
import {
  agentPassPhase,
  agentPassDetail,
  formatElapsed,
  AGENT_PASS_IDLE_MS,
  EMPTY_PASS,
  type AgentPass,
} from "./agentActivityView";

/** Fixed formatter so the decayed-state assertions don't depend on the runner's
 *  locale (the real one deliberately follows the user's). */
const clock = () => "14:05";

const T = 1_000_000;

function pass(over: Partial<AgentPass> = {}): AgentPass {
  return { ...EMPTY_PASS, ...over };
}

describe("agentPassPhase", () => {
  it("is `none` before anything has travelled", () => {
    expect(agentPassPhase(EMPTY_PASS, T)).toBe("none");
  });

  it("is `sent` once a snapshot is pushed but the agent hasn't pulled it", () => {
    expect(agentPassPhase(pass({ lastPushAt: T }), T + 5_000)).toBe("sent");
  });

  it("is `reading` from the pull onward", () => {
    expect(agentPassPhase(pass({ lastPushAt: T, lastPullAt: T + 100 }), T + 5_000)).toBe(
      "reading"
    );
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

describe("agentPassDetail", () => {
  it("says nothing when there is nothing factual to report", () => {
    expect(agentPassDetail(EMPTY_PASS, T, clock)).toBeNull();
  });

  it("reports awaiting pickup rather than implying work is underway", () => {
    expect(agentPassDetail(pass({ lastPushAt: T }), T + 1_000, clock)).toBe(
      "sent · not picked up"
    );
  });

  it("carries a live elapsed counter while reading", () => {
    const p = pass({ lastPushAt: T, lastPullAt: T });
    expect(agentPassDetail(p, T + 47_000, clock)).toBe("reading · 0:47");
  });

  it("counts submissions alongside the elapsed time", () => {
    const p = pass({ lastPushAt: T, lastPullAt: T, lastSubmissionAt: T + 60_000, submitted: 3 });
    expect(agentPassDetail(p, T + 107_000, clock)).toBe("reading · 1:47 · 3 submitted");
  });

  // Past tense + absolute time. It must not claim the pass ended — we cannot
  // know that — only when we last heard anything.
  it("reports the decayed pass as a last-heard fact, never as completion", () => {
    const p = pass({ lastPushAt: T, lastPullAt: T, submitted: 3 });
    const out = agentPassDetail(p, T + AGENT_PASS_IDLE_MS + 1, clock);
    expect(out).toBe("quiet since 14:05 · 3 submitted");
    expect(out).not.toMatch(/done|finish|complete/i);
  });

  // The vocabulary separation the readout depends on: the `status` row owns
  // idle/working and means "writtten is computing".
  it("never borrows the computation vocabulary of the status row", () => {
    const cases: AgentPass[] = [
      pass({ lastPushAt: T }),
      pass({ lastPushAt: T, lastPullAt: T }),
      pass({ lastPushAt: T, lastPullAt: T, submitted: 2 }),
      pass({ lastPushAt: T, lastPullAt: T - AGENT_PASS_IDLE_MS * 2 }),
    ];
    for (const p of cases) {
      expect(agentPassDetail(p, T + 1_000, clock)).not.toMatch(/\b(idle|working|thinking)\b/i);
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
