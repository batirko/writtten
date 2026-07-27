import { describe, it, expect, beforeEach } from "vitest";
import {
  setActivityPending,
  getActivityPending,
  subscribeActivity,
  getLastCompletedAt,
  noteEvalCompleted,
  __resetActivitySignal,
} from "./activitySignal";

describe("activitySignal", () => {
  beforeEach(() => setActivityPending(0));

  it("pushes the current value immediately on subscribe", () => {
    setActivityPending(3);
    const seen: number[] = [];
    const unsub = subscribeActivity((n) => seen.push(n));
    expect(seen).toEqual([3]);
    unsub();
  });

  it("notifies subscribers on change and reflects in getter", () => {
    const seen: number[] = [];
    const unsub = subscribeActivity((n) => seen.push(n));
    setActivityPending(1);
    setActivityPending(2);
    expect(getActivityPending()).toBe(2);
    expect(seen).toEqual([0, 1, 2]);
    unsub();
  });

  it("de-dupes identical values (no redundant notifications)", () => {
    const seen: number[] = [];
    const unsub = subscribeActivity((n) => seen.push(n));
    setActivityPending(1);
    setActivityPending(1);
    expect(seen).toEqual([0, 1]);
    unsub();
  });

  it("stops notifying after unsubscribe", () => {
    const seen: number[] = [];
    const unsub = subscribeActivity((n) => seen.push(n));
    unsub();
    setActivityPending(5);
    expect(seen).toEqual([0]);
  });
});

describe("activitySignal — the completion stamp (UX-053)", () => {
  beforeEach(() => __resetActivitySignal());

  it("starts with no completion, which is not the same as a completion long ago", () => {
    // `null` is what lets the feed distinguish "nothing has read this document"
    // from "something read it and had nothing to say". Softening it to 0 would
    // print the confident all-clear on first load.
    expect(getLastCompletedAt()).toBeNull();
  });

  it("stamps only when an evaluation actually completed", () => {
    noteEvalCompleted();
    expect(getLastCompletedAt()).not.toBeNull();
  });

  /**
   * The two failures the running app demonstrated, both of which an
   * inferred-from-the-queue version reported as success.
   *
   * Every `evaluate*` entry point swallows its own exception, so a batch that
   * failed outright drains the count exactly like a clean pass — a fake API key
   * produced "read your draft — nothing to raise". And a batch where nothing ran
   * at all (a doc pass returning early on its dirty-check) drains with no error
   * to suppress, so "no failure was recorded" was never evidence of a read.
   */
  it("does not stamp merely because outstanding work drained to zero", () => {
    setActivityPending(3);
    setActivityPending(0);
    expect(getLastCompletedAt()).toBeNull();
  });

  it("does not stamp for a batch that rose and fell without completing anything", () => {
    setActivityPending(1);
    setActivityPending(2);
    setActivityPending(0);
    setActivityPending(1);
    setActivityPending(0);
    expect(getLastCompletedAt()).toBeNull();
  });

  it("keeps the count itself independent of the stamp", () => {
    setActivityPending(4);
    expect(getActivityPending()).toBe(4);
    expect(getLastCompletedAt()).toBeNull();
    noteEvalCompleted();
    setActivityPending(0);
    expect(getActivityPending()).toBe(0);
    expect(getLastCompletedAt()).not.toBeNull();
  });
});
