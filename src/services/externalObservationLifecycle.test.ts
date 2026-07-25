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
/** The same agent, a previous bridge run. Same display name, different identity —
 *  which is the whole point: the name is self-reported and unverified. */
const sourceAEarlier = { kind: "agent" as const, name: "Claude Code", sessionId: "sess-A-old" };

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

  it("refuses when the observation is missing or already closed", async () => {
    await expect(retractExternalObservation("gone", "sess-A")).resolves.toBe(false);

    vi.mocked(db.loadObservation).mockResolvedValue(
      obs({ id: "a1", source: sourceA, status: "dismissed" })
    );
    await expect(retractExternalObservation("a1", "sess-A")).resolves.toBe(false);

    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
  });

  /**
   * "An agent cannot close a card it never wrote" is a product rule that no single
   * line of code states. It falls out of two unrelated facts: the ownership check
   * below, and an allowlist in `agentSnapshot.ts` that ships no observation ids, so
   * an agent holds no id for anything it did not submit. Each half is pinned under
   * this heading in its own module's test, and each names the other, so neither can
   * be dropped without noticing what else goes with it.
   *
   * One population per case, because they fail for reasons that could drift apart.
   */
  describe("the wall — an agent cannot close a card it never wrote", () => {
    it("refuses another agent's card", async () => {
      vi.mocked(db.loadObservation).mockResolvedValue(obs({ id: "b1", source: sourceB }));

      await expect(retractExternalObservation("b1", "sess-A")).resolves.toBe(false);
      expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
    });

    it("refuses a card the same agent left in an earlier session", async () => {
      // Asked and answered 2026-07-25 (owner): the wall is per *session*, not per
      // agent, even though under engine exclusivity "yesterday's pass left junk" is
      // the ordinary case rather than an edge one. Stale cards are the user's to
      // clear — and letting a fresh pairing sweep an older one's would make "this
      // source's cards" mean one thing to revoke and another to retract.
      vi.mocked(db.loadObservation).mockResolvedValue(obs({ id: "old", source: sourceAEarlier }));

      await expect(retractExternalObservation("old", "sess-A")).resolves.toBe(false);
      expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
    });

    it("refuses a built-in observation", async () => {
      // Native cards have no source at all, so the same check covers them, and must:
      // an agent that guesses an id should not be able to close writtten's own
      // findings — the ones actually standing behind a precision floor.
      vi.mocked(db.loadObservation).mockResolvedValue(obs({ id: "native" }));

      await expect(retractExternalObservation("native", "sess-A")).resolves.toBe(false);
      expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
    });
  });
});
