/**
 * External-source exemptions (BYOA / PR3).
 *
 * An observation carrying `source` was submitted by an external agent through
 * the boundary, not produced by our evaluator. The evaluator has no standing to
 * decide such a finding is resolved — and no precision floor covering that
 * judgement — so every system-driven closure arm is guarded by
 * `isEvaluatorOwned`. These tests pin that guard at each arm.
 *
 * The load-bearing subtlety, asserted explicitly below: the guards sit at the
 * *close* sites, NOT as a filter when `existing` is loaded. External cards must
 * still take part in matching/dedup, so an incoming native observation that
 * lands on an external card's span is absorbed by it rather than rendered
 * twice. A load-time filter would exempt them and double the feed at once.
 *
 * See docs/mechanics/agent-bridge.md.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isEvaluatorOwned,
  reconcileObservations,
  reconcileDocumentObservations,
  reconcileSweepContradictions,
  reconcileConflictCardsOnEdit,
} from "./evaluatorReconcile";
import type { Observation, ObservationSource } from "../store/db";
import { capabilityForTier } from "../model/capability";
import type { NewObservation } from "./evaluatorAnchoring";

const STRONG = capabilityForTier("strong");

vi.mock("../store/db", () => ({
  saveObservation: vi.fn(),
  updateObservationStatus: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(async () => []),
  loadSuppressionsForDocument: vi.fn(async () => []),
}));

vi.mock("nanoid", () => ({ nanoid: () => "mock-id" }));

import * as db from "../store/db";

const AGENT: ObservationSource = {
  kind: "agent",
  name: "Claude Code",
  sessionId: "sess-1",
};

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
    startOffset: 0,
    endOffset: 20,
    anchorText: "rollout criteria",
    ...over,
  };
}

/** An external card and a native card sitting on the identical span, so every
 *  test can assert the native one closes while its external twin survives —
 *  which rules out "nothing closed because the arm never ran". */
function twins(over: Partial<Observation> = {}) {
  return [
    obs({ id: "native-1", ...over }),
    obs({ id: "ext-1", source: AGENT, ...over }),
  ];
}

/** The corpus-wide invariant: no arm ever closes an external card. */
function expectExternalUntouched(id = "ext-1") {
  const calls = vi.mocked(db.updateObservationStatus).mock.calls;
  expect(calls.filter(([target]) => target === id)).toEqual([]);
}

beforeEach(() => {
  vi.mocked(db.saveObservation).mockReset();
  vi.mocked(db.updateObservationStatus).mockReset();
  vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
  vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
});

describe("isEvaluatorOwned", () => {
  it("owns observations with no source, disowns agent-sourced ones", () => {
    expect(isEvaluatorOwned(obs({ id: "a" }))).toBe(true);
    expect(isEvaluatorOwned(obs({ id: "b", source: AGENT }))).toBe(false);
  });
});

describe("reconcileObservations — section arms", () => {
  it("the blanket orphan close skips external cards but still closes their native twin", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue(twins());

    // Empty new set — the bodyless-section path, which routes every member-
    // anchored card into step 4's blanket close.
    await reconcileObservations("doc1", ["b1"], []);

    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "native-1",
      "auto_closed",
      "resolved_by_edit"
    );
    expectExternalUntouched();
  });

  it("resolved_prior force-close skips external cards", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue(twins());

    await reconcileObservations("doc1", ["b1"], [], new Set(["native-1", "ext-1"]));

    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "native-1",
      "auto_closed",
      "resolved_prior"
    );
    expectExternalUntouched();
  });

  it("an external card is never chosen as supersedable — the native card inserts alongside", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      obs({ id: "ext-1", source: AGENT, text: "Older phrasing of the same point." }),
    ]);

    const incoming: NewObservation = {
      type: "clarity",
      scope: "span",
      kind: "problem",
      severity: "medium",
      confidence: "medium",
      priority: 1.2,
      text: "A different sentence about the same passage.",
      blockId: "b1",
      startOffset: 0,
      endOffset: 20,
      anchorText: "rollout criteria",
    };

    await reconcileObservations("doc1", ["b1"], [incoming]);

    // Not superseded…
    expectExternalUntouched();
    // …and the fresh native card is inserted rather than swallowed.
    const inserted = vi
      .mocked(db.saveObservation)
      .mock.calls.map(([o]) => o as Observation)
      .filter((o) => o.status === "active" && o.source == null);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].text).toBe("A different sentence about the same passage.");
  });

  it("dedup still works across the boundary: an identical incoming card matches the external one and does not double-insert", async () => {
    // This is the test that distinguishes per-close-site guards from a
    // filter-at-load. Under a load-time filter the external card would be
    // invisible here and the incoming twin would insert a second card.
    const external = obs({ id: "ext-1", source: AGENT });
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([external]);

    const incoming: NewObservation = {
      type: external.type,
      scope: "span",
      kind: external.kind,
      severity: external.severity,
      confidence: external.confidence,
      priority: external.priority,
      text: external.text,
      blockId: external.blockId,
      startOffset: external.startOffset,
      endOffset: external.endOffset,
      anchorText: external.anchorText,
    };

    await reconcileObservations("doc1", ["b1"], [incoming]);

    const inserts = vi
      .mocked(db.saveObservation)
      .mock.calls.map(([o]) => o as Observation)
      .filter((o) => o.id === "mock-id");
    expect(inserts).toHaveLength(0);
    expectExternalUntouched();
  });
});

describe("reconcileDocumentObservations — doc-scope arms", () => {
  const docCard = (id: string, text: string, over: Partial<Observation> = {}) =>
    obs({
      id,
      scope: "document",
      type: "missing_topic",
      text,
      blockId: undefined,
      startOffset: undefined,
      endOffset: undefined,
      anchorText: undefined,
      ...over,
    });

  it("the orphan grace arm neither closes nor bumps missCount on an external card", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      docCard("native-1", "No rollback plan is described."),
      docCard("ext-1", "Nothing covers the support handoff.", {
        source: AGENT,
        missCount: 1, // already at the edge of the grace threshold (2)
      }),
    ]);

    // Empty regenerated set → both are orphans.
    await reconcileDocumentObservations("doc1", []);

    expectExternalUntouched();
    // A stale counter on an exempt card is a trap for any close site that later
    // forgets the guard, so the bump is skipped too.
    const bumped = vi
      .mocked(db.saveObservation)
      .mock.calls.map(([o]) => o as Observation)
      .filter((o) => o.id === "ext-1");
    expect(bumped).toHaveLength(0);
  });

  it("doc-scope resolved_prior skips external cards", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      docCard("native-1", "No rollback plan is described."),
      docCard("ext-1", "Nothing covers the support handoff.", { source: AGENT }),
    ]);

    await reconcileDocumentObservations("doc1", [], undefined, {
      resolvedPriorIds: new Set(["native-1", "ext-1"]),
    });

    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "native-1",
      "auto_closed",
      "resolved_prior"
    );
    expectExternalUntouched();
  });
});

describe("reconcileSweepContradictions — conflict arms", () => {
  const conflict = (id: string, over: Partial<Observation> = {}) =>
    obs({
      id,
      type: "strategic_tension",
      kind: "opportunity",
      priority: 1.5,
      text: "Fast iteration conflicts with the stated quality bar.",
      blockId: "b1",
      conflictingBlockId: "b2",
      conflictingAnchorText: "quality bar",
      missCount: 0,
      ...over,
    });

  it("an external tension is not superseded when a contradiction covers the same pair", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      conflict("native-1"),
      conflict("ext-1", { source: AGENT }),
    ]);

    const incomingContradiction: NewObservation = {
      type: "contradiction",
      scope: "span",
      kind: "problem",
      severity: "high",
      confidence: "high",
      priority: 2.5,
      text: "Section 2 commits to Q3; section 5 commits to Q2.",
      blockId: "b1",
      startOffset: 0,
      endOffset: 10,
      anchorText: "Fast iteration",
      conflictingBlockId: "b2",
      conflictingStartOffset: 0,
      conflictingEndOffset: 10,
      conflictingAnchorText: "quality bar",
    };

    await reconcileSweepContradictions("doc1", [incomingContradiction], STRONG);

    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "native-1",
      "superseded",
      "superseded"
    );
    expectExternalUntouched();
  });

  it("the absence-grace arm neither closes nor ages an external conflict card", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      conflict("native-1", { missCount: 1 }),
      conflict("ext-1", { source: AGENT, missCount: 1 }),
    ]);

    // Empty sweep output → both are absent; native crosses the grace threshold.
    await reconcileSweepContradictions("doc1", [], STRONG);

    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "native-1",
      "auto_closed",
      "resolved_by_edit"
    );
    expectExternalUntouched();
    const aged = vi
      .mocked(db.saveObservation)
      .mock.calls.map(([o]) => o as Observation)
      .filter((o) => o.id === "ext-1");
    expect(aged).toHaveLength(0);
  });
});

describe("reconcileConflictCardsOnEdit — edit-time conflict arms", () => {
  it("does not close an external conflict card whose claim has vanished from the document", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([
      obs({
        id: "native-1",
        type: "contradiction",
        severity: "high",
        text: "Section 2 commits to Q3; section 5 commits to Q2.",
        blockId: "b1",
        anchorText: "ships in Q3",
        conflictingBlockId: "b2",
        conflictingAnchorText: "ships in Q2",
      }),
      obs({
        id: "ext-1",
        source: AGENT,
        type: "contradiction",
        severity: "high",
        text: "The launch date is stated two ways.",
        blockId: "b1",
        anchorText: "ships in Q3",
        conflictingBlockId: "b2",
        conflictingAnchorText: "ships in Q2",
      }),
    ]);

    // The edited block no longer contains either claim → the native card closes
    // immediately (no grace wait).
    await reconcileConflictCardsOnEdit(
      "doc1",
      [{ blockId: "b1", text: "The timeline section was rewritten entirely." }],
      [],
      new Set(),
      STRONG,
      undefined
    );

    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "native-1",
      "auto_closed",
      "resolved_by_edit"
    );
    expectExternalUntouched();
  });
});
