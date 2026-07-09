import { describe, it, expect, beforeEach } from "vitest";
import { setActivityPending, getActivityPending, subscribeActivity } from "./activitySignal";

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
