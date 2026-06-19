/**
 * Unit tests for reconcileSweepContradictions — OBS-025 strategic_tension dedup.
 *
 * The strong-tier sweep can emit near-identical strategic_tension observations when
 * the same intent is stated in two document sections. These tests verify that the
 * text-similarity dedup (via planDocReconciliation) collapses them before insert.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { reconcileSweepContradictions } from "./evaluatorReconcile";
import type { Observation } from "../store/db";
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
