import { describe, it, expect } from "vitest";
import { agentStatusView } from "./agentStatusView";
import type { AgentSourceStatus } from "../model/agentSourceSignal";

const base: AgentSourceStatus = { state: "idle" };

describe("agentStatusView", () => {
  it("renders no row when no pairing exists", () => {
    // Most users never connect an agent; a permanent "idle" row would be the
    // only dead value in a readout of otherwise-live ones.
    expect(agentStatusView(base)).toBeNull();
  });

  it("shows a waiting state before the agent answers", () => {
    const view = agentStatusView({ ...base, state: "waiting" });
    expect(view).toMatchObject({ state: "waiting", text: "waiting…" });
    expect(view?.label).toContain("Waiting");
  });

  it("names the agent once connected", () => {
    const view = agentStatusView({ ...base, state: "connected", name: "Claude Code" });
    expect(view).toMatchObject({ state: "connected", text: "Claude Code" });
    expect(view?.label).toContain("connected");
  });

  it("keeps naming the agent when disconnected, and says its cards remain", () => {
    const view = agentStatusView({ ...base, state: "disconnected", name: "Codex" });
    expect(view).toMatchObject({ state: "disconnected", text: "Codex" });
    expect(view?.label).toContain("remain in the feed");
  });

  it("falls back to a generic name when the agent never reported one", () => {
    expect(agentStatusView({ ...base, state: "connected" })?.text).toBe("agent");
  });

  it("drops the row once a pairing is revoked", () => {
    // The connection is gone deliberately; only the kept cards still refer to
    // it, and they carry their own chip.
    expect(agentStatusView({ ...base, state: "revoked", name: "Claude Code" })).toBeNull();
  });
});
