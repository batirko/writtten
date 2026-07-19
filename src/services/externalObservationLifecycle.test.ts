import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  archiveExternalSource,
  retractExternalObservation,
  countActiveFromSource,
} from "./externalObservationLifecycle";
import type { Observation } from "../store/db";

vi.mock("../store/db", () => ({
  loadActiveObservationsForDocument: vi.fn(async () => []),
  loadObservation: vi.fn(async () => undefined),
  updateObservationStatus: vi.fn(),
}));

import * as db from "../store/db";

function obs(over: Partial<Observation> & { id: string }): Observation {
  return {
    docId: "doc1",
    type: "clarity",
    scope: "span",
    kind: "problem",
    severity: "medium",
    confidence: "medium",
    priority: 1.2,
    text: "The rollout criteria are stated two different ways.",
    status: "active",
    blockId: "b1",
    ...over,
  };
}

const sourceA = { kind: "agent" as const, name: "Claude Code", sessionId: "sess-A" };
const sourceB = { kind: "agent" as const, name: "Codex", sessionId: "sess-B" };

beforeEach(() => {
  vi.mocked(db.updateObservationStatus).mockReset();
  vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
  vi.mocked(db.loadObservation).mockResolvedValue(undefined);
});

describe("countActiveFromSource", () => {
  it("counts only active cards from the given session", () => {
    const all = [
      obs({ id: "1", source: sourceA }),
      obs({ id: "2", source: sourceA, status: "dismissed" }),
      obs({ id: "3", source: sourceB }),
      obs({ id: "4" }),
    ];
    expect(countActiveFromSource(all, "sess-A")).toBe(1);
  });
});

describe("archiveExternalSource", () => {
  it("closes only the revoked session's cards, leaving native and other-session cards alone", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      obs({ id: "a1", source: sourceA }),
      obs({ id: "a2", source: sourceA }),
      obs({ id: "b1", source: sourceB }),
      obs({ id: "native" }),
    ]);

    const closed = await archiveExternalSource("doc1", "sess-A");

    expect(closed).toBe(2);
    const targets = vi.mocked(db.updateObservationStatus).mock.calls.map(([id]) => id);
    expect(targets.sort()).toEqual(["a1", "a2"]);
  });

  it("writes the source_revoked closure reason so the archive doesn't read as an evaluator decision", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      obs({ id: "a1", source: sourceA }),
    ]);

    await archiveExternalSource("doc1", "sess-A");

    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "a1",
      "auto_closed",
      "source_revoked"
    );
  });

  it("is a no-op when the source left nothing active", async () => {
    const closed = await archiveExternalSource("doc1", "sess-A");
    expect(closed).toBe(0);
    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
  });
});

describe("retractExternalObservation", () => {
  it("closes the card when the retracting session owns it", async () => {
    vi.mocked(db.loadObservation).mockResolvedValue(obs({ id: "a1", source: sourceA }));

    await expect(retractExternalObservation("a1", "sess-A")).resolves.toBe(true);
    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "a1",
      "auto_closed",
      "retracted"
    );
  });

  it("refuses to retract another session's card", async () => {
    vi.mocked(db.loadObservation).mockResolvedValue(obs({ id: "b1", source: sourceB }));

    await expect(retractExternalObservation("b1", "sess-A")).resolves.toBe(false);
    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
  });

  it("refuses to retract a built-in observation", async () => {
    // The identity check happens to cover native cards too, and must: an agent
    // that guesses an id should not be able to close writtten's own findings.
    vi.mocked(db.loadObservation).mockResolvedValue(obs({ id: "native" }));

    await expect(retractExternalObservation("native", "sess-A")).resolves.toBe(false);
    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
  });

  it("refuses when the observation is missing or already closed", async () => {
    await expect(retractExternalObservation("gone", "sess-A")).resolves.toBe(false);

    vi.mocked(db.loadObservation).mockResolvedValue(
      obs({ id: "a1", source: sourceA, status: "dismissed" })
    );
    await expect(retractExternalObservation("a1", "sess-A")).resolves.toBe(false);

    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
  });
});
