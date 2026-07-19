/** @vitest-environment node */
import { describe, it, expect, afterEach } from "vitest";
import { toAgentObservation, AGENT_OBSERVATION_FIELDS } from "./agentSnapshot";
import { registerDocSnapshotReader, readLiveDoc } from "../model/docSnapshotSource";
import type { Observation } from "../store/db";

const fullObservation: Observation = {
  id: "obs-1",
  docId: "default",
  type: "contradiction",
  scope: "span",
  kind: "problem",
  severity: "high",
  confidence: "high",
  priority: 2.4,
  text: "This section commits to Q3; the Timeline section commits the same work to Q2.",
  status: "active",
  blockId: "blk-secret",
  startOffset: 12,
  endOffset: 44,
  anchorText: "ship by the end of Q3",
  anchorQuote: "…ship by the end of Q3",
  conflictingBlockId: "blk-other",
  conflictingStartOffset: 3,
  conflictingEndOffset: 9,
};

describe("agent observation projection", () => {
  it("exposes exactly the allowlisted fields", () => {
    // The invariant this guards: the agent must never learn block identity. A spread
    // (`{...o, source}`) would leak blockId/offsets the moment anyone adds a field to
    // Observation, with every existing test still green.
    const projected = toAgentObservation(fullObservation);
    expect(Object.keys(projected).sort()).toEqual([...AGENT_OBSERVATION_FIELDS].sort());
  });

  it("attributes each active observation to the critic that produced it", () => {
    // The snapshot exists so the agent doesn't re-file what the feed already
    // shows; that only works if it can tell its own prior cards from ours.
    expect(toAgentObservation(fullObservation).source).toBe("writtten");
    expect(
      toAgentObservation({
        ...fullObservation,
        source: { kind: "agent", name: "Claude Code", sessionId: "sess-1" },
      }).source
    ).toBe("Claude Code");
  });

  it("gives the agent a source name but never a sessionId", () => {
    // sessionId is internal identity — it is what revoke and retract scope on,
    // and the agent has no use for another session's.
    const serialized = JSON.stringify(
      toAgentObservation({
        ...fullObservation,
        source: { kind: "agent", name: "Codex", sessionId: "sess-secret" },
      })
    );
    expect(serialized).toContain("Codex");
    expect(serialized).not.toContain("sess-secret");
  });

  it("leaks no internal identifier or offset", () => {
    const serialized = JSON.stringify(toAgentObservation(fullObservation));
    for (const leak of [
      "blk-secret",
      "blk-other",
      "blockId",
      "startOffset",
      "endOffset",
      "conflictingBlockId",
      "priority",
      "obs-1",
    ]) {
      expect(serialized, `${leak} must not reach the agent`).not.toContain(leak);
    }
  });

  it("omits anchorText entirely for a doc-scope observation", () => {
    const docScope = { ...fullObservation, scope: "document" as const, anchorText: undefined };
    expect(toAgentObservation(docScope)).not.toHaveProperty("anchorText");
  });
});

describe("docSnapshotSource", () => {
  afterEach(() => registerDocSnapshotReader(() => ({ title: "", stage: "", sections: [], members: [] }))());

  it("returns null when no editor is mounted", () => {
    expect(readLiveDoc()).toBeNull();
  });

  it("reads through the registered reader and unregisters cleanly", () => {
    const unregister = registerDocSnapshotReader(() => ({
      title: "Fraud PRD",
      stage: "internal PRD",
      sections: [{ heading: "Goals", text: "Cut chargebacks." }],
      members: [{ blockId: "b1", text: "Cut chargebacks." }],
    }));
    expect(readLiveDoc()?.title).toBe("Fraud PRD");
    unregister();
    expect(readLiveDoc()).toBeNull();
  });

  it("a stale cleanup does not clobber a newer registration", () => {
    const stale = registerDocSnapshotReader(() => ({ title: "old", stage: "", sections: [], members: [] }));
    registerDocSnapshotReader(() => ({ title: "new", stage: "", sections: [], members: [] }));
    stale();
    expect(readLiveDoc()?.title).toBe("new");
  });
});
