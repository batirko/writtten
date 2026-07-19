/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startAgentBridge,
  bridgeUrl,
  isLoopbackHost,
  assertLoopbackUrl,
  subscribeSettled,
  AGENT_PROTOCOL_VERSION,
  CANDIDATE_PORTS,
  type EventSourceLike,
  type Pairing,
  type SnapshotBody,
  type VerdictBody,
} from "./agentBridgeClient";
import { setActivityPending } from "../model/activitySignal";

const pairing: Pairing = {
  token: "tok-1",
  ports: [8787, 8788],
  origin: "http://localhost:5173",
  createdAt: 0,
};

// ---------------------------------------------------------------------------
// The loopback invariant (decision (d)) — the security-critical corpus
// ---------------------------------------------------------------------------

describe("loopback invariant", () => {
  it("accepts the loopback hosts and nothing else", () => {
    for (const h of ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]"]) {
      expect(isLoopbackHost(h)).toBe(true);
    }
    for (const h of ["0.0.0.0", "evil.example", "127.0.0.1.evil.example", "192.168.1.4", "::"]) {
      expect(isLoopbackHost(h)).toBe(false);
    }
  });

  it("refuses every non-loopback bridge URL", () => {
    const hostile = [
      "http://evil.example/handshake",
      "https://writtten.com/handshake",
      "http://127.0.0.1.evil.example/handshake",
      "http://localhost.evil.example/handshake",
      "http://0.0.0.0:8787/handshake",
      "http://[::]:8787/handshake",
      // The userinfo trick: the loopback-looking part is a username and the real host is
      // the attacker's. Defeated by validating the parsed hostname, not the href string —
      // assert it explicitly so nobody "simplifies" the check back to a string match.
      "http://127.0.0.1@evil.example/handshake",
      "https://127.0.0.1:8787/handshake", // https is not the bridge's scheme
    ];
    for (const raw of hostile) {
      expect(() => assertLoopbackUrl(raw), raw).toThrow(/refusing non-loopback/);
    }
  });

  it("accepts a loopback URL", () => {
    expect(assertLoopbackUrl("http://127.0.0.1:8787/doc").hostname).toBe("127.0.0.1");
  });

  it("builds only loopback URLs, and only on the pairing's candidate ports", () => {
    expect(bridgeUrl(pairing, 8787, "/handshake", { token: "t" })).toBe(
      "http://127.0.0.1:8787/handshake?token=t"
    );
    expect(() => bridgeUrl(pairing, 9999, "/handshake")).toThrow(/candidate list/);
  });

  it("ships candidate ports the bridge script also defaults to", () => {
    expect(CANDIDATE_PORTS.length).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeEventSource implements EventSourceLike {
  readyState = 0;
  onopen: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  private handlers = new Map<string, ((e: { data: string }) => void)[]>();

  constructor(public url: string) {}

  addEventListener(type: string, fn: (e: { data: string }) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  close(): void {
    this.closed = true;
    this.readyState = 2;
  }
  // --- test drivers ---
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  emit(type: string, data: unknown): void {
    for (const fn of this.handlers.get(type) ?? []) fn({ data: JSON.stringify(data) });
  }
  fail(closed: boolean): void {
    this.readyState = closed ? 2 : 0;
    this.onerror?.({});
  }
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function makeHarness(opts: {
  protocolVersion?: number;
  handshakeOkOn?: number[];
  onSubmission?: (payload: unknown) => Promise<VerdictBody>;
  snapshot?: () => Promise<SnapshotBody | null>;
} = {}) {
  const calls: Call[] = [];
  const sources: FakeEventSource[] = [];
  let settle: () => void = () => {};

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });

    if (url.includes("/handshake")) {
      const port = Number(new URL(url).port);
      const ok = (opts.handshakeOkOn ?? [8787]).includes(port);
      if (!ok) throw new TypeError("fetch failed");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          protocolVersion: opts.protocolVersion ?? AGENT_PROTOCOL_VERSION,
          agentName: "Claude Code",
        }),
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
  }) as unknown as typeof fetch;

  const handle = startAgentBridge({
    pairing,
    fetchImpl,
    eventSourceImpl: (url) => {
      const es = new FakeEventSource(url);
      sources.push(es);
      return es;
    },
    subscribeSettled: (fn) => {
      settle = fn;
      return () => {};
    },
    readSnapshot:
      opts.snapshot ??
      (async () => ({
        title: "T",
        stage: "S",
        sections: [{ heading: "H", text: "body" }],
        activeObservations: [],
      })),
    onSubmission: opts.onSubmission ?? (async () => ({ result: "accepted", observationId: "o1" })),
  });

  return { handle, calls, sources, settle: () => settle() };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Wait until `fn()` is truthy, polling the macrotask queue. */
async function until<T>(fn: () => T | undefined | false, ms = 1500): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v as T;
    if (Date.now() - start > ms) throw new Error("condition never became true");
    await tick(5);
  }
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

describe("pairing state machine", () => {
  let harness: ReturnType<typeof makeHarness> | null = null;

  afterEach(() => {
    harness?.handle.stop();
    harness = null;
  });

  it("starts waiting, then connects once the stream opens", async () => {
    harness = makeHarness();
    expect(harness.handle.getStatus().state).toBe("waiting");

    const es = await until(() => harness!.sources[0]);
    es.open();
    await tick();

    const st = harness.handle.getStatus();
    expect(st.state).toBe("connected");
    expect(st.agentName).toBe("Claude Code");
    expect(st.port).toBe(8787);
  });

  it("probes candidate ports in order and stops at the first that answers", async () => {
    harness = makeHarness({ handshakeOkOn: [8788] });
    await until(() => harness!.sources[0]);
    const probes = harness.calls.filter((c) => c.url.includes("/handshake")).map((c) => c.url);
    expect(probes[0]).toContain(":8787");
    expect(probes[1]).toContain(":8788");
    expect(harness.handle.getStatus().port).toBe(8788);
  });

  it("parks in waiting with version_mismatch on a stale bridge", async () => {
    harness = makeHarness({ protocolVersion: AGENT_PROTOCOL_VERSION + 1 });
    await until(() => harness!.handle.getStatus().error === "version_mismatch");
    const st = harness.handle.getStatus();
    // Keeps probing: the user's fix is to re-copy the prompt and re-run at any moment.
    expect(st.state).toBe("waiting");
    expect(harness.sources.length).toBe(0);
  });

  it("does not drop the connection while EventSource is reconnecting", async () => {
    harness = makeHarness();
    const es = await until(() => harness!.sources[0]);
    es.open();
    await tick();
    es.fail(false); // readyState 0 — retrying on its own
    await tick(20);
    expect(harness.handle.getStatus().state).toBe("connected");
  });

  it("drops to disconnected when the stream closes for good", async () => {
    harness = makeHarness();
    const es = await until(() => harness!.sources[0]);
    es.open();
    await tick();
    es.fail(true); // readyState 2 — terminal
    await tick();
    expect(harness.handle.getStatus().state).toBe("disconnected");
  });

  it("stop() closes the stream and stops probing", async () => {
    harness = makeHarness();
    const es = await until(() => harness!.sources[0]);
    es.open();
    await tick();
    harness.handle.stop();
    expect(es.closed).toBe(true);
    const after = harness.calls.length;
    await tick(50);
    expect(harness.calls.length).toBe(after);
    harness = null;
  });
});

// ---------------------------------------------------------------------------
// Verdict relay
// ---------------------------------------------------------------------------

describe("verdict relay", () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.handle.stop();
    harness = null;
  });

  async function connected(opts: Parameters<typeof makeHarness>[0] = {}) {
    harness = makeHarness(opts);
    const es = await until(() => harness!.sources[0]);
    es.open();
    await tick();
    return es;
  }

  it("routes a submission to the boundary and posts the verdict with its sid", async () => {
    const seen: unknown[] = [];
    const es = await connected({
      onSubmission: async (p) => {
        seen.push(p);
        return { result: "accepted", observationId: "obs-9" };
      },
    });
    es.emit("submission", { sid: "sid-1", payload: { type: "clarity", scope: "document" } });

    const verdict = await until(() =>
      harness!.calls.find((c) => c.url.includes("/verdict"))
    );
    expect(seen).toEqual([{ type: "clarity", scope: "document" }]);
    expect(verdict.body).toMatchObject({ sid: "sid-1", result: "accepted", observationId: "obs-9" });
  });

  it("still answers when the boundary throws", async () => {
    // Otherwise the agent's held /submit hangs the full timeout with nothing to diagnose.
    const es = await connected({
      onSubmission: async () => {
        throw new Error("boom");
      },
    });
    es.emit("submission", { sid: "sid-2", payload: {} });

    const verdict = await until(() => harness!.calls.find((c) => c.url.includes("/verdict")));
    expect(verdict.body).toMatchObject({
      sid: "sid-2",
      result: "rejected",
      code: "internal_error",
    });
  });

  it("serialises submissions in order", async () => {
    const order: string[] = [];
    const es = await connected({
      onSubmission: async (p) => {
        const id = (p as { id: string }).id;
        order.push(`start:${id}`);
        await tick(10);
        order.push(`end:${id}`);
        return { result: "accepted" };
      },
    });
    es.emit("submission", { sid: "a", payload: { id: "a" } });
    es.emit("submission", { sid: "b", payload: { id: "b" } });

    await until(() => harness!.calls.filter((c) => c.url.includes("/verdict")).length === 2, 3000);
    // One pending verdict at a time (decision (e)) — never interleaved.
    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });
});

// ---------------------------------------------------------------------------
// Snapshot push
// ---------------------------------------------------------------------------

describe("snapshot push", () => {
  let harness: ReturnType<typeof makeHarness> | null = null;
  afterEach(() => {
    harness?.handle.stop();
    harness = null;
  });

  it("pushes on connect and bumps docVersion when content changes", async () => {
    let text = "one";
    harness = makeHarness({
      snapshot: async () => ({
        title: "T",
        stage: "S",
        sections: [{ heading: "H", text }],
        activeObservations: [],
      }),
    });
    const es = await until(() => harness!.sources[0]);
    es.open();

    const first = await until(() => harness!.calls.find((c) => c.url.includes("/snapshot")));
    expect((first.body as { docVersion: number }).docVersion).toBe(1);

    text = "two";
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 2);
    const second = harness.calls.filter((c) => c.url.includes("/snapshot"))[1];
    expect((second.body as { docVersion: number }).docVersion).toBe(2);
  });

  it("re-pushes at the SAME docVersion when only the observations changed", async () => {
    // An accepted external card changes activeObservations. Bumping docVersion for that
    // would wake the agent's /wait, which would re-review and re-submit — forever.
    let obs: Array<Record<string, unknown>> = [];
    harness = makeHarness({
      snapshot: async () => ({
        title: "T",
        stage: "S",
        sections: [{ heading: "H", text: "stable" }],
        activeObservations: obs,
      }),
    });
    const es = await until(() => harness!.sources[0]);
    es.open();
    await until(() => harness!.calls.find((c) => c.url.includes("/snapshot")));

    obs = [{ type: "clarity", scope: "document", text: "x", source: "Claude Code" }];
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 2);

    const pushes = harness.calls.filter((c) => c.url.includes("/snapshot"));
    expect((pushes[0].body as { docVersion: number }).docVersion).toBe(1);
    expect((pushes[1].body as { docVersion: number }).docVersion).toBe(1);
    expect((pushes[1].body as { activeObservations: unknown[] }).activeObservations).toHaveLength(1);
  });

  it("does not push before the stream is open", async () => {
    harness = makeHarness();
    harness.settle();
    await tick(20);
    expect(harness.calls.filter((c) => c.url.includes("/snapshot"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Settle detection against the real activitySignal
// ---------------------------------------------------------------------------

describe("subscribeSettled", () => {
  beforeEach(() => setActivityPending(0));
  afterEach(() => setActivityPending(0));

  it("fires only on the falling edge to zero", () => {
    const fn = vi.fn();
    const off = subscribeSettled(fn);
    // The replayed current value must not count as a settle.
    expect(fn).not.toHaveBeenCalled();

    setActivityPending(2);
    setActivityPending(1);
    expect(fn).not.toHaveBeenCalled();

    setActivityPending(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Already idle — no repeat.
    setActivityPending(0);
    expect(fn).toHaveBeenCalledTimes(1);

    setActivityPending(3);
    setActivityPending(0);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
  });

  it("stops firing after unsubscribe", () => {
    const fn = vi.fn();
    const off = subscribeSettled(fn);
    off();
    setActivityPending(1);
    setActivityPending(0);
    expect(fn).not.toHaveBeenCalled();
  });
});
