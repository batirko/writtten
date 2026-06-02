import { describe, it, expect, beforeEach, vi } from "vitest";
import { harness } from "./harness";

// The event stream console-logs each emit; silence it for clean test output.
beforeEach(() => {
  harness._resetForTests();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("harness event stream", () => {
  it("assigns a monotonically increasing seq to each event", () => {
    harness.emit("settle", { block: "a" });
    harness.emit("request", { block: "a" });
    harness.emit("response", { block: "a" });

    const events = harness.getEvents();
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(harness.currentSeq()).toBe(3);
  });

  it("getEvents(sinceSeq) returns only events strictly newer than sinceSeq", () => {
    harness.emit("settle", {});
    harness.emit("request", {});
    const cutoff = harness.currentSeq(); // 2
    harness.emit("response", {});
    harness.emit("observation", {});

    const tail = harness.getEvents(cutoff);
    expect(tail.map((e) => e.seq)).toEqual([3, 4]);
    expect(tail.map((e) => e.type)).toEqual(["response", "observation"]);
  });

  it("carries event-specific fields through to the buffer", () => {
    harness.emit("ledger-write", { block: "gD-8uoum", action: "overwrite", claims: 1 });
    const [event] = harness.getEvents();
    expect(event).toMatchObject({
      type: "ledger-write",
      block: "gD-8uoum",
      action: "overwrite",
      claims: 1,
    });
    expect(typeof event.t).toBe("number");
  });

  it("bounds the ring buffer but keeps seq monotonic across eviction", () => {
    for (let i = 0; i < 600; i++) harness.emit("settle", { i });
    const events = harness.getEvents();
    expect(events.length).toBe(500);
    // Oldest retained event is newer than the evicted ones; seq never resets.
    expect(events[0].seq).toBe(101);
    expect(events[events.length - 1].seq).toBe(600);
  });
});

describe("harness readiness signal", () => {
  it("set/get pending and notifies subscribers on change only", () => {
    const seen: number[] = [];
    const unsubscribe = harness.subscribePending((n) => seen.push(n));
    expect(seen).toEqual([0]); // initial push

    harness.setPending(2);
    harness.setPending(2); // no-op, same value
    harness.setPending(0);

    expect(harness.getPending()).toBe(0);
    expect(seen).toEqual([0, 2, 0]);

    unsubscribe();
    harness.setPending(5);
    expect(seen).toEqual([0, 2, 0]); // no further notifications after unsubscribe
  });
});

describe("harness reset", () => {
  it("clears events, seq, pending, and listeners", () => {
    const seen: number[] = [];
    harness.subscribePending((n) => seen.push(n));
    harness.emit("settle", {});
    harness.setPending(3);

    harness._resetForTests();

    expect(harness.currentSeq()).toBe(0);
    expect(harness.getEvents()).toEqual([]);
    expect(harness.getPending()).toBe(0);

    const before = seen.length;
    harness.setPending(9); // listener was cleared by reset
    expect(seen.length).toBe(before);
  });
});
