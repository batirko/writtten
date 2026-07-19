import { describe, it, expect } from "vitest";
import { sourceChipView } from "./sourceChipView";
import type { ObservationSource } from "../store/db";

const source: ObservationSource = {
  kind: "agent",
  name: "Claude Code",
  sessionId: "sess-1",
};

describe("sourceChipView", () => {
  it("renders no chip for a built-in observation", () => {
    // The unmarked case is "writtten said this" — chipping it would turn
    // attribution into noise.
    expect(sourceChipView(undefined, { state: "connected", sessionId: "sess-1" })).toBeNull();
  });

  it("is live only while the submitting session is the connected one", () => {
    const view = sourceChipView(source, {
      state: "connected",
      name: "Claude Code",
      sessionId: "sess-1",
    });
    expect(view).toMatchObject({ label: "Claude Code", state: "live" });
  });

  it("reads disconnected once the bridge is gone, and says the card stays", () => {
    const view = sourceChipView(source, { state: "disconnected", sessionId: "sess-1" });
    expect(view?.state).toBe("disconnected");
    expect(view?.title).toContain("stays until you dismiss it");
  });

  it("reads disconnected for cards from a previous session even while another agent is connected", () => {
    // Re-pairing mints a new sessionId. The old cards are not this agent's, so
    // showing them as live would attribute them to a session that never wrote
    // them.
    const view = sourceChipView(source, {
      state: "connected",
      name: "Claude Code",
      sessionId: "sess-2",
    });
    expect(view?.state).toBe("disconnected");
  });

  it("marks revoked-but-kept cards distinctly from merely disconnected ones", () => {
    const view = sourceChipView(source, { state: "revoked", sessionId: "sess-1" });
    expect(view?.state).toBe("revoked");
    expect(view?.title).toContain("revoked");
  });

  it("falls back to disconnected when nothing has ever connected", () => {
    expect(sourceChipView(source, { state: "idle" })?.state).toBe("disconnected");
  });

  it("labels the chip with the agent's own name", () => {
    const codex = { ...source, name: "Codex", sessionId: "sess-9" };
    expect(sourceChipView(codex, { state: "connected", sessionId: "sess-9" })?.label).toBe("Codex");
  });
});
