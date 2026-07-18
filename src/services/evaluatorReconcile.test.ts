/**
 * Unit tests for reconcileSweepContradictions — OBS-025 strategic_tension dedup.
 *
 * The strong-tier sweep can emit near-identical strategic_tension observations when
 * the same intent is stated in two document sections. These tests verify that the
 * text-similarity dedup (via planDocReconciliation) collapses them before insert.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reconcileSweepContradictions,
  reconcileObservations,
  reconcileConflictCardsOnEdit,
  type FreshClaim,
} from "./evaluatorReconcile";
import type { Observation } from "../store/db";
import { capabilityForTier } from "../model/capability";
import { conflictPairKey, type NewObservation } from "./evaluatorAnchoring";

const STRONG = capabilityForTier("strong");

vi.mock("../store/db", () => ({
  saveObservation: vi.fn(),
  updateObservationStatus: vi.fn(),
  loadActiveObservationsForDocument: vi.fn(async () => []),
  loadSuppressionsForDocument: vi.fn(async () => []),
}));

vi.mock("nanoid", () => ({ nanoid: () => "mock-id" }));

import * as db from "../store/db";

function tension(overrides: Partial<NewObservation> = {}): NewObservation {
  return {
    type: "strategic_tension",
    scope: "span",
    kind: "opportunity",
    severity: "medium",
    confidence: "medium",
    priority: 1.5,
    text: "Fast iteration conflicts with quality bar",
    blockId: "b1",
    startOffset: 0,
    endOffset: 10,
    anchorText: "Fast iteration",
    conflictingBlockId: "b2",
    conflictingStartOffset: 0,
    conflictingEndOffset: 10,
    conflictingAnchorText: "quality bar",
    ...overrides,
  };
}

function existingTension(id: string, text: string): Observation {
  return {
    id,
    docId: "doc1",
    type: "strategic_tension",
    scope: "span",
    kind: "opportunity",
    severity: "medium",
    confidence: "medium",
    priority: 1.5,
    text,
    status: "active",
    blockId: "b1",
    startOffset: 0,
    endOffset: 10,
    anchorText: "Fast iteration",
    conflictingBlockId: "b2",
    missCount: 0,
  };
}

beforeEach(() => {
  vi.mocked(db.saveObservation).mockReset();
  vi.mocked(db.updateObservationStatus).mockReset();
  vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([]);
  vi.mocked(db.loadSuppressionsForDocument).mockResolvedValue([]);
});

describe("reconcileSweepContradictions — OBS-025 strategic_tension dedup", () => {
  it("(a) two near-identical incoming tensions collapse to one saveObservation call", async () => {
    // Jaccard("fast iteration conflicts with quality bar",
    //         "rapid iteration conflicts with quality bar") ≈ 0.71 ≥ 0.6 floor
    const t1 = tension({ text: "Fast iteration conflicts with quality bar", blockId: "b1" });
    const t2 = tension({ text: "Rapid iteration conflicts with quality bar", blockId: "b3" });

    await reconcileSweepContradictions("doc1", [t1, t2], STRONG);

    // Only one tension should be inserted (the near-duplicate is collapsed).
    const savedTensions = vi
      .mocked(db.saveObservation)
      .mock.calls.filter(([o]) => (o as Observation).type === "strategic_tension");
    expect(savedTensions).toHaveLength(1);
  });

  it("(b) incoming tension near-similar to existing keeps existing alive, no new card", async () => {
    const existing = existingTension("e1", "Fast iteration conflicts with quality bar");
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existing]);

    // Incoming text is a slight paraphrase — Jaccard ≈ 0.71 ≥ 0.6 floor.
    const incoming = tension({ text: "Fast iteration conflicts with quality standards" });

    await reconcileSweepContradictions("doc1", [incoming], STRONG);

    // Existing tension is kept alive (missCount reset), not bumped toward closure.
    const saveCall = vi.mocked(db.saveObservation).mock.calls.find(
      ([o]) => (o as Observation).id === "e1"
    );
    expect(saveCall).toBeDefined();
    expect((saveCall![0] as Observation).missCount).toBe(0);

    // No new card inserted (incoming was deduped against the existing).
    const newCardCall = vi.mocked(db.saveObservation).mock.calls.find(
      ([o]) => (o as Observation).id === "mock-id"
    );
    expect(newCardCall).toBeUndefined();
  });

  it("(c) two distinct tensions both reach saveObservation", async () => {
    // Jaccard("fast iteration conflicts with quality bar",
    //         "broad scope conflicts with launch deadline") ≈ 0.20 < 0.6 floor
    const t1 = tension({ text: "Fast iteration conflicts with quality bar", blockId: "b1" });
    const t2 = tension({ text: "Broad scope conflicts with launch deadline", blockId: "b3" });

    await reconcileSweepContradictions("doc1", [t1, t2], STRONG);

    const savedTensions = vi
      .mocked(db.saveObservation)
      .mock.calls.filter(([o]) => (o as Observation).type === "strategic_tension");
    expect(savedTensions).toHaveLength(2);
  });
});

describe("reconcileSweepContradictions — cross-type precedence", () => {
  const contradiction = (o: Partial<NewObservation> = {}): NewObservation =>
    tension({ type: "contradiction", kind: "problem", text: "Q3 vs Q2 ship date", ...o });

  it("drops an incoming tension when a contradiction covers the same block pair", async () => {
    // Same pair {b1,b2}, different types → the contradiction wins.
    const c = contradiction({ blockId: "b1", conflictingBlockId: "b2" });
    const t = tension({ blockId: "b1", conflictingBlockId: "b2" });

    await reconcileSweepContradictions("doc1", [c, t], STRONG);

    const saved = vi.mocked(db.saveObservation).mock.calls.map(([o]) => (o as Observation).type);
    expect(saved).toContain("contradiction");
    expect(saved).not.toContain("strategic_tension");
  });

  it("supersedes an existing tension when a contradiction lands on the same pair", async () => {
    const existing = existingTension("e1", "Fast iteration conflicts with quality bar");
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([existing]);

    await reconcileSweepContradictions(
      "doc1",
      [contradiction({ blockId: "b1", conflictingBlockId: "b2" })],
      STRONG
    );

    // The stale tension is superseded, and it is NOT kept alive as a re-emission.
    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith("e1", "superseded", "superseded");
    const keptAlive = vi
      .mocked(db.saveObservation)
      .mock.calls.find(([o]) => (o as Observation).id === "e1");
    expect(keptAlive).toBeUndefined();
  });

  it("keeps a tension on a different pair than the contradiction", async () => {
    const c = contradiction({ blockId: "b1", conflictingBlockId: "b2" });
    const t = tension({ blockId: "b1", conflictingBlockId: "b3" }); // different partner

    await reconcileSweepContradictions("doc1", [c, t], STRONG);

    const saved = vi.mocked(db.saveObservation).mock.calls.map(([o]) => (o as Observation).type);
    expect(saved).toContain("contradiction");
    expect(saved).toContain("strategic_tension");
  });
});

// ---------------------------------------------------------------------------
// reconcileConflictCardsOnEdit — edit-scoped either-side conflict resolution
// ---------------------------------------------------------------------------

const WEAK = capabilityForTier("weak");

/** A cross-block contradiction card: primary anchor in Metrics (Q3), secondary in
 *  Timeline (Q2) — the exact shape of the 2026-07-14 field bug. */
function conflictCard(overrides: Partial<Observation> = {}): Observation {
  return {
    id: "c1",
    docId: "doc1",
    type: "contradiction",
    scope: "span",
    kind: "problem",
    severity: "high",
    confidence: "high",
    priority: 5,
    text: "This contradicts the public launch date of Q3 2026 set earlier.",
    status: "active",
    blockId: "bMetrics",
    startOffset: 0,
    endOffset: 43,
    anchorText: "The public launch is firmly set for Q3 2026",
    anchorQuote: "The public launch is firmly set for Q3 2026",
    conflictingBlockId: "bTimeline",
    conflictingStartOffset: 0,
    conflictingEndOffset: 9999,
    conflictingAnchorText: "We are committing to a public launch in Q2 2026",
    missCount: 0,
    ...overrides,
  };
}

const freshClaim = (text: string, blockId = "bTimeline"): FreshClaim => ({
  text,
  anchorBlockId: blockId,
  anchorStartOffset: 0,
  anchorEndOffset: text.length,
  anchorQuote: text,
});

describe("reconcileConflictCardsOnEdit — either-side edit resolution", () => {
  it("(secondary-side resolve) closes when the edited secondary claim is gone", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([conflictCard()]);
    const confirm = vi.fn(async () => true);
    // Timeline (secondary) block reworded to something unrelated; no fresh claim resembles
    // the old Q2 commitment → genuinely gone.
    await reconcileConflictCardsOnEdit(
      "doc1",
      [{ blockId: "bTimeline", text: "The timeline is now under review." }],
      [],
      new Set(),
      STRONG,
      confirm
    );
    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "c1",
      "auto_closed",
      "resolved_by_edit"
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("(primary-side resolve) closes when the edited primary claim is gone", async () => {
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([conflictCard()]);
    await reconcileConflictCardsOnEdit(
      "doc1",
      [{ blockId: "bMetrics", text: "Success metrics are still to be defined." }],
      [],
      new Set(),
      STRONG,
      vi.fn(async () => true)
    );
    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "c1",
      "auto_closed",
      "resolved_by_edit"
    );
  });

  it("(re-emitted) keeps the card and resets grace, no B call", async () => {
    const card = conflictCard({ missCount: 1 });
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([card]);
    const confirm = vi.fn(async () => true);
    await reconcileConflictCardsOnEdit(
      "doc1",
      [{ blockId: "bTimeline", text: "We are committing to a public launch in Q2 2026." }],
      [freshClaim("We are committing to a public launch in Q2 2026")],
      new Set([conflictPairKey(card)]),
      STRONG,
      confirm
    );
    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
    const save = vi.mocked(db.saveObservation).mock.calls.find(([o]) => (o as Observation).id === "c1");
    expect(save).toBeDefined();
    expect((save![0] as Observation).missCount).toBe(0);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("(reworded, still conflicts) B keeps the card, re-anchors the edited side, freezes the message", async () => {
    const card = conflictCard();
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([card]);
    const reworded = "We are committing to a public launch in Q2, no slippage";
    const confirm = vi.fn(async () => true); // B says: still conflicts
    await reconcileConflictCardsOnEdit(
      "doc1",
      [{ blockId: "bTimeline", text: `${reworded}.` }],
      [freshClaim(reworded)],
      new Set(),
      STRONG,
      confirm
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
    const save = vi.mocked(db.saveObservation).mock.calls.find(([o]) => (o as Observation).id === "c1");
    const saved = save![0] as Observation;
    expect(saved.missCount).toBe(0);
    // Edited side is the secondary (Timeline) anchor — it moves to the reworded claim.
    expect(saved.conflictingAnchorText).toBe(reworded);
    // Card message (prose) stays frozen.
    expect(saved.text).toBe(card.text);
  });

  it("(reworded, resolved) B closes the card immediately", async () => {
    const card = conflictCard();
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([card]);
    // Lexically close to the old Q2 anchor (so the arm treats it as reworded-but-present
    // → ambiguous → B), but now aligned to Q3, and B adjudicates it resolved.
    const reworded = "We are committing to a public launch in Q3 2026 now";
    const confirm = vi.fn(async () => false); // B says: no longer conflicts
    await reconcileConflictCardsOnEdit(
      "doc1",
      [{ blockId: "bTimeline", text: `${reworded}.` }],
      [freshClaim(reworded)],
      new Set(),
      STRONG,
      confirm
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.updateObservationStatus)).toHaveBeenCalledWith(
      "c1",
      "auto_closed",
      "resolved_by_edit"
    );
  });

  it("(weak tier) skips B; an ambiguous card takes the grace path (bump, no close)", async () => {
    const card = conflictCard();
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([card]);
    const reworded = "We are committing to a public launch in Q2, no slippage";
    const confirm = vi.fn(async () => true);
    await reconcileConflictCardsOnEdit(
      "doc1",
      [{ blockId: "bTimeline", text: `${reworded}.` }],
      [freshClaim(reworded)],
      new Set(),
      WEAK,
      confirm
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
    const save = vi.mocked(db.saveObservation).mock.calls.find(([o]) => (o as Observation).id === "c1");
    expect((save![0] as Observation).missCount).toBe(1); // grace bump, threshold is 2
  });

  it("(B cap) confirms only the highest-priority ambiguous card; the rest grace-bump", async () => {
    // Two ambiguous cards touching the edited Timeline block; both claims still present.
    const c1 = conflictCard({ id: "c1", priority: 5, conflictingAnchorText: "claim one still here" });
    const c2 = conflictCard({
      id: "c2",
      priority: 2,
      blockId: "bOther",
      conflictingBlockId: "bTimeline",
      conflictingAnchorText: "claim two still here",
    });
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([c1, c2]);
    const confirm = vi.fn(async () => true);
    await reconcileConflictCardsOnEdit(
      "doc1",
      [{ blockId: "bTimeline", text: "claim one still here. claim two still here." }],
      [],
      new Set(),
      STRONG,
      confirm
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    // The lower-priority card takes the grace path.
    const c2Save = vi.mocked(db.saveObservation).mock.calls.find(([o]) => (o as Observation).id === "c2");
    expect((c2Save![0] as Observation).missCount).toBe(1);
  });
});

describe("reconcileObservations — conflicts leave the span-card decision table", () => {
  it("does NOT step-4 false-close a primary-side conflict whose pair wasn't re-emitted", async () => {
    const card = conflictCard({ id: "e1" }); // primary anchored in the edited section
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([card]);
    // Edit the Metrics (primary) section; newObs carries no conflict for this pair.
    await reconcileObservations("doc1", ["bMetrics"], []);
    expect(vi.mocked(db.updateObservationStatus)).not.toHaveBeenCalled();
  });

  it("does NOT insert a duplicate when a secondary-side edit re-emits the pair", async () => {
    const card = conflictCard({ id: "e1" }); // primary bMetrics, secondary bTimeline
    vi.mocked(db.loadActiveObservationsForDocument).mockResolvedValue([card]);
    // The Timeline (secondary) section re-emits the same pair (reversed block order).
    const incoming: NewObservation = {
      type: "contradiction",
      scope: "span",
      kind: "problem",
      severity: "high",
      confidence: "high",
      priority: 5,
      text: "Timeline conflicts with the Q3 launch date.",
      blockId: "bTimeline",
      startOffset: 0,
      endOffset: 10,
      anchorText: "launch in Q2",
      conflictingBlockId: "bMetrics",
      conflictingStartOffset: 0,
      conflictingEndOffset: 9999,
      conflictingAnchorText: "The public launch is firmly set for Q3 2026",
    };
    await reconcileObservations("doc1", ["bTimeline"], [incoming]);
    // The pair matched the existing card (allActive search) → no new "mock-id" card.
    const inserted = vi.mocked(db.saveObservation).mock.calls.find(
      ([o]) => (o as Observation).id === "mock-id"
    );
    expect(inserted).toBeUndefined();
  });
});
