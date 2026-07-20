/** @vitest-environment node */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  startAgentBridge,
  bridgeUrl,
  isLoopbackHost,
  assertLoopbackUrl,
  subscribeSettled,
  createPairing,
  loadPairing,
  clearPairing,
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
// Pairing persistence — surviving a Storage that exists but doesn't work
// ---------------------------------------------------------------------------

/**
 * A Map-backed Storage, with an override seam so a *failing* store can be driven
 * honestly: a real browser throws on `getItem` in some privacy modes and on
 * `setItem` at quota, and making the backing store throw is the only way to
 * exercise the module's try/catch. (Recovered from the deleted
 * `agentOnlyMode.test.ts`, which needed exactly this.)
 */
function installStorage(over: Partial<Storage> = {}) {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    ...over,
  };
  vi.stubGlobal("localStorage", store);
  return store;
}

describe("pairing persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a pairing through a working Storage", () => {
    installStorage();
    const made = createPairing("https://writtten.com");
    expect(made.token).toBeTruthy();
    expect(made.ports).toEqual(CANDIDATE_PORTS);

    const loaded = loadPairing();
    expect(loaded?.token).toBe(made.token);
    expect(loaded?.origin).toBe("https://writtten.com");

    clearPairing();
    expect(loadPairing()).toBeNull();
  });

  /**
   * The regression this file exists for. `localStorage` can be *defined but
   * inert* — Node ≥ 22 installs a bare `{}` when `--localstorage-file` is absent,
   * which is why this bit the moment FEATURE_AGENT_BRIDGE was flipped on and
   * `useAgentBridge`'s resume effect ran `loadPairing()`. An existence check
   * ("is the binding defined?") hands that object back as a `Storage` and the
   * first method call throws; only a capability check refuses it.
   */
  it("degrades to no-persistence when Storage exists but has no methods", () => {
    vi.stubGlobal("localStorage", {});

    expect(() => loadPairing()).not.toThrow();
    expect(loadPairing()).toBeNull();

    // The pairing is still minted — it just isn't remembered across reloads.
    let made: Pairing | null = null;
    expect(() => (made = createPairing("https://writtten.com"))).not.toThrow();
    expect(made!.token).toBeTruthy();

    expect(() => clearPairing()).not.toThrow();
  });

  it("degrades when the Storage getter itself throws (private-mode shape)", () => {
    vi.stubGlobal("localStorage", {
      get getItem(): never {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });

    expect(() => loadPairing()).not.toThrow();
    expect(loadPairing()).toBeNull();
  });

  it("degrades when a present method throws at call time (quota shape)", () => {
    installStorage({
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    });

    // A quota failure must not cost the user their pairing — the token is
    // returned and the session works; only the reload-resume is lost.
    expect(() => createPairing("https://writtten.com")).not.toThrow();
  });
});

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

  it("does NOT bump docVersion when a heading is split into its own section", async () => {
    // The field case (2026-07-20): a connected agent was woken by a heading split and
    // reported "No new content — just the heading was split into its own section," at
    // ~4.1k tokens for the pass. The prose is byte-identical; only its partition moved.
    // The old byte-exact hash over `sections` could not see the difference.
    let sections = [{ heading: "Goals", text: "Ship the thing. Rollout We start in Q3." }];
    harness = makeHarness({
      snapshot: async () => ({
        title: "T",
        stage: "S",
        sections,
        activeObservations: [],
      }),
    });
    const es = await until(() => harness!.sources[0]);
    es.open();
    await until(() => harness!.calls.find((c) => c.url.includes("/snapshot")));

    // Same words, re-partitioned: "Rollout" promoted from body text to its own heading.
    sections = [
      { heading: "Goals", text: "Ship the thing." },
      { heading: "Rollout", text: "We start in Q3." },
    ];
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 2);

    const pushes = harness.calls.filter((c) => c.url.includes("/snapshot"));
    expect((pushes[0].body as { docVersion: number }).docVersion).toBe(1);
    expect((pushes[1].body as { docVersion: number }).docVersion).toBe(1);
    // The snapshot itself still ships the new partition — /doc stays complete.
    expect((pushes[1].body as { sections: unknown[] }).sections).toHaveLength(2);
  });

  it("DOES bump docVersion when a re-partition also changes the words", async () => {
    // The floor must not become a blanket structure-blind guard: splitting a heading AND
    // writing new prose under it is exactly what the agent should wake for.
    let sections = [{ heading: "Goals", text: "Ship the thing." }];
    harness = makeHarness({
      snapshot: async () => ({ title: "T", stage: "S", sections, activeObservations: [] }),
    });
    const es = await until(() => harness!.sources[0]);
    es.open();
    await until(() => harness!.calls.find((c) => c.url.includes("/snapshot")));

    sections = [
      { heading: "Goals", text: "Ship the thing." },
      { heading: "Rollout", text: "We start in Q3." },
    ];
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 2);
    const pushes = harness.calls.filter((c) => c.url.includes("/snapshot"));
    expect((pushes[1].body as { docVersion: number }).docVersion).toBe(2);
  });

  it("ships a changedSections hint naming only the edited section", async () => {
    let sections = [
      { heading: "A", text: "alpha" },
      { heading: "B", text: "beta" },
      { heading: "C", text: "gamma" },
    ];
    harness = makeHarness({
      snapshot: async () => ({ title: "T", stage: "S", sections, activeObservations: [] }),
    });
    const es = await until(() => harness!.sources[0]);
    es.open();
    const first = await until(() => harness!.calls.find((c) => c.url.includes("/snapshot")));
    // No baseline on the first push — the agent must read the whole document.
    expect(first.body).not.toHaveProperty("changedSections");

    sections = [
      { heading: "A", text: "alpha" },
      { heading: "B", text: "beta, now rewritten" },
      { heading: "C", text: "gamma" },
    ];
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 2);

    const second = harness.calls.filter((c) => c.url.includes("/snapshot"))[1].body as {
      docVersion: number;
      changedSections: number[];
      changedSectionsSince: number;
      sections: unknown[];
    };
    expect(second.docVersion).toBe(2);
    expect(second.changedSections).toEqual([1]);
    // The hint is relative to v1, so only an agent that saw v1 may act on it.
    expect(second.changedSectionsSince).toBe(1);
    // The snapshot is still complete — the hint is an optimisation, not a replacement.
    expect(second.sections).toHaveLength(3);
  });

  it("omits the hint when the section count changed — a shifted diff would over-report", async () => {
    let sections = [
      { heading: "A", text: "alpha" },
      { heading: "B", text: "beta" },
    ];
    harness = makeHarness({
      snapshot: async () => ({ title: "T", stage: "S", sections, activeObservations: [] }),
    });
    const es = await until(() => harness!.sources[0]);
    es.open();
    await until(() => harness!.calls.find((c) => c.url.includes("/snapshot")));

    sections = [
      { heading: "A", text: "alpha" },
      { heading: "New", text: "inserted prose" },
      { heading: "B", text: "beta" },
    ];
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 2);

    const second = harness.calls.filter((c) => c.url.includes("/snapshot"))[1].body;
    expect(second).not.toHaveProperty("changedSections");
  });

  it("carries the hint unchanged across a non-material re-push at the same docVersion", async () => {
    // An observations-only push re-sends the SAME docVersion, so the hint must keep
    // describing that version rather than collapsing to "nothing changed".
    let sections = [
      { heading: "A", text: "alpha" },
      { heading: "B", text: "beta" },
    ];
    let obs: Array<Record<string, unknown>> = [];
    harness = makeHarness({
      snapshot: async () => ({ title: "T", stage: "S", sections, activeObservations: obs }),
    });
    const es = await until(() => harness!.sources[0]);
    es.open();
    await until(() => harness!.calls.find((c) => c.url.includes("/snapshot")));

    sections = [
      { heading: "A", text: "alpha" },
      { heading: "B", text: "beta rewritten" },
    ];
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 2);

    obs = [{ type: "clarity", scope: "document", text: "x", source: "Claude Code" }];
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 3);

    const pushes = harness.calls.filter((c) => c.url.includes("/snapshot"));
    const second = pushes[1].body as { docVersion: number; changedSections: number[] };
    const third = pushes[2].body as { docVersion: number; changedSections: number[] };
    expect(third.docVersion).toBe(second.docVersion);
    expect(third.changedSections).toEqual(second.changedSections);
  });

  it("omits the hint for a heading split, which does not bump docVersion at all", async () => {
    let sections = [{ heading: "Goals", text: "Ship it. Rollout Q3." }];
    harness = makeHarness({
      snapshot: async () => ({ title: "T", stage: "S", sections, activeObservations: [] }),
    });
    const es = await until(() => harness!.sources[0]);
    es.open();
    await until(() => harness!.calls.find((c) => c.url.includes("/snapshot")));

    sections = [
      { heading: "Goals", text: "Ship it." },
      { heading: "Rollout", text: "Q3." },
    ];
    harness.settle();
    await until(() => harness!.calls.filter((c) => c.url.includes("/snapshot")).length === 2);

    const second = harness.calls.filter((c) => c.url.includes("/snapshot"))[1].body as {
      docVersion: number;
    };
    expect(second.docVersion).toBe(1); // the materiality floor already suppressed the wake
    expect(second).not.toHaveProperty("changedSections");
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
