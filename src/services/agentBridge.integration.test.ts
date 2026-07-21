/** @vitest-environment node */
/**
 * Bridge integration test — the drift guard for the published bridge.
 *
 * `public/writtten-bridge.mjs` IS the artifact users run, and the setup command in the
 * pasted prompt fetches it **over HTTP from the app's own origin**. So this test does the
 * same thing the user's agent does: it serves `public/` on a loopback port, GETs
 * `/writtten-bridge.mjs`, writes what came back to a temp dir, spawns it with Node, and
 * drives the full relay (/snapshot → /doc, /submit → SSE → /verdict → held-response
 * completion).
 *
 * Fetching rather than reading the file off disk is the point. Disk-reading would prove
 * the repo's copy works while saying nothing about whether the deploy can actually serve
 * it — and "serve it from the app origin" is the whole mechanism now. A file that isn't
 * reachable over HTTP fails here.
 *
 * Runs unconditionally in CI: it needs nothing but Node and loopback (no keys, no quota,
 * ~2-4 s). Skipping it would leave the one artifact users actually execute unverified.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:net";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { AGENT_PROTOCOL_VERSION } from "./agentBridgeClient";

const TOKEN = "test-token-3f9c1a";
const ORIGIN = "http://localhost:5173";

/** The published location — what Vite copies verbatim into `dist/` and the deploy serves
 *  at `{ORIGIN}/writtten-bridge.mjs`. */
const BRIDGE_FILE = fileURLToPath(new URL("../../public/writtten-bridge.mjs", import.meta.url));

/**
 * Stands in for the app origin: serves exactly one path, the way the deploy does.
 *
 * Deliberately reads from disk per request rather than caching, so the bytes under test
 * are the bytes on disk at spawn time.
 */
let assetServer: HttpServer | null = null;
let assetOrigin = "";

async function startAssetServer(): Promise<void> {
  if (!existsSync(BRIDGE_FILE)) {
    throw new Error(`public/writtten-bridge.mjs is missing — the app has nothing to serve`);
  }
  assetServer = createHttpServer((req, res) => {
    if (req.url?.split("?")[0] === "/writtten-bridge.mjs") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(readFileSync(BRIDGE_FILE));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => assetServer!.listen(0, "127.0.0.1", r));
  assetOrigin = `http://127.0.0.1:${(assetServer!.address() as AddressInfo).port}`;
}

/** Fetch the bridge the way the agent's setup command does. */
export async function fetchBridgeScript(): Promise<string> {
  const res = await fetch(`${assetOrigin}/writtten-bridge.mjs`);
  if (!res.ok) throw new Error(`bridge fetch failed: ${res.status}`);
  return res.text();
}

// --- process/port plumbing --------------------------------------------------

const spawned: ChildProcess[] = [];
const tmpDirs: string[] = [];

/** Bind :0, read what the OS gave us, release it. Never use the real candidate ports —
 *  a concurrent dev session or a genuinely paired bridge could own them. */
async function freePort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as AddressInfo).port;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

async function startBridge(
  ports: number[],
  opts: { name?: string; origin?: string; token?: string } = {}
): Promise<{ base: string; port: number; child: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "writtten-bridge-"));
  tmpDirs.push(dir);
  const file = join(dir, "writtten-bridge.mjs");
  writeFileSync(file, await fetchBridgeScript(), "utf8");

  const child = spawn(
    process.execPath,
    [
      file,
      `--token=${opts.token ?? TOKEN}`,
      `--ports=${ports.join(",")}`,
      `--origin=${opts.origin ?? ORIGIN}`,
      `--name=${opts.name ?? "Test Agent"}`,
    ],
    { cwd: dir, stdio: ["ignore", "pipe", "pipe"] }
  );
  spawned.push(child);

  let stderr = "";
  child.stderr!.on("data", (d) => (stderr += d));

  const port = await new Promise<number>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(
      () => reject(new Error(`bridge never listened.\nstdout:\n${out}\nstderr:\n${stderr}`)),
      10_000
    );
    child.stdout!.on("data", (d) => {
      out += d;
      const m = /writtten bridge listening on 127\.0\.0\.1:(\d+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    // Reject early rather than burning the full timeout when the child dies on a bad arg.
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`bridge exited ${code}\nstdout:\n${out}\nstderr:\n${stderr}`));
    });
  });

  return { base: `http://127.0.0.1:${port}`, port, child };
}

async function killChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((r) => child.once("exit", () => r())),
    new Promise<void>((r) => setTimeout(r, 2000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

// Belt and braces: a vitest worker crash must not orphan a process holding a port.
process.on("exit", () => {
  for (const c of spawned) {
    try {
      c.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
});

// --- SSE consumption (no EventSource in Node) -------------------------------

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

async function openEvents(base: string, controller: AbortController) {
  const res = await fetch(`${base}/events?token=${TOKEN}`, {
    headers: { Origin: ORIGIN, Accept: "text/event-stream" },
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
  // The easy-to-forget one: without CORS on the stream the browser rejects it before a
  // single event arrives, and EventSource.onerror carries nothing to diagnose with.
  expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);

  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  return {
    async next(): Promise<SseEvent> {
      for (;;) {
        const i = buf.indexOf("\n\n");
        if (i >= 0) {
          const raw = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const lines = raw.split("\n");
          const event = lines.find((l) => l.startsWith("event: "))?.slice(7) ?? "message";
          const data = lines
            .filter((l) => l.startsWith("data: "))
            .map((l) => l.slice(6))
            .join("\n");
          if (event === "ping" || !data) continue;
          return { event, data: JSON.parse(data) };
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("SSE stream closed unexpectedly");
        buf += dec.decode(value, { stream: true });
      }
    },
    // Cancel the reader before aborting, so tearing down a stream mid-read doesn't
    // surface as an unhandled rejection and fail an unrelated test.
    close: async () => {
      await reader.cancel().catch(() => {});
      controller.abort();
    },
  };
}

const auth = { Authorization: `Bearer ${TOKEN}` };
const jsonHeaders = { ...auth, "Content-Type": "application/json" };

// ---------------------------------------------------------------------------

// The app origin has to be up before any bridge can be fetched from it, and it outlives
// every describe below — file-level, so no block has to remember to start it.
beforeAll(startAssetServer);
afterAll(async () => {
  if (assetServer) await new Promise<void>((r) => assetServer!.close(() => r()));
  assetServer = null;
});

describe("bridge script — static invariants", () => {
  let script: string;
  beforeAll(async () => {
    script = await fetchBridgeScript();
  });

  it("is actually reachable over HTTP from the app origin", () => {
    // The setup command in the pasted prompt is a `curl` at this path. If the file stops
    // being served — moved out of public/, renamed, publicDir disabled — every other test
    // here would fail confusingly; this one says why.
    expect(script).toContain("// writtten-bridge.mjs");
    expect(script.length).toBeGreaterThan(1000);
  });

  it("binds loopback only", () => {
    // The single most security-relevant token in the script: without the host argument
    // Node binds the wildcard address and the whole LAN can read the document.
    expect(script).toContain('server.listen(port, "127.0.0.1")');
    // Comments stripped — the script explains this hazard in prose, and the assertion is
    // about what the code does, not what it says.
    const code = script
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    expect(code).not.toContain("0.0.0.0");
  });

  it("answers Chrome's private-network preflight", () => {
    expect(script).toContain("Access-Control-Allow-Private-Network");
  });

  it("declares the same protocolVersion as the app", () => {
    expect(script).toContain(`const PROTOCOL_VERSION = ${AGENT_PROTOCOL_VERSION};`);
  });

  it("has zero dependencies", () => {
    const imports = [...script.matchAll(/^import\s.*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec.startsWith("node:")).toBe(true);
  });
});

describe("bridge script — relay round-trip", { timeout: 25_000 }, () => {
  let base: string;
  let child: ChildProcess;

  beforeAll(async () => {
    const started = await startBridge([await freePort()]);
    base = started.base;
    child = started.child;
  });

  afterAll(async () => {
    await killChild(child);
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  });

  // --- auth / origin matrix ---

  it("handshakes with a valid token", async () => {
    const res = await fetch(`${base}/handshake`, { headers: { ...auth, Origin: ORIGIN } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.protocolVersion).toBe(AGENT_PROTOCOL_VERSION);
    expect(body.agentName).toBe("Test Agent");
    expect(body.bridgeVersion).toBeTruthy();
  });

  it("accepts the token as a query param (EventSource cannot set headers)", async () => {
    const res = await fetch(`${base}/handshake?token=${TOKEN}`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(200);
  });

  it("rejects a wrong token", async () => {
    const res = await fetch(`${base}/handshake`, {
      headers: { Authorization: "Bearer nope", Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
    // CORS on the error too, or the app sees a network error rather than a 401 and can
    // never say "your token is stale".
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("rejects a disallowed Origin even with a valid token", async () => {
    const res = await fetch(`${base}/handshake`, {
      headers: { ...auth, Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("does not match the Origin allowlist by prefix", async () => {
    const res = await fetch(`${base}/handshake`, {
      headers: { ...auth, Origin: "http://localhost:5173.evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("allows an Origin-less request (the agent's own curl) on the token alone", async () => {
    const res = await fetch(`${base}/handshake`, { headers: auth });
    expect(res.status).toBe(200);
  });

  // --- preflight ---

  it("answers a preflight that carries no Authorization", async () => {
    // POST /snapshot is non-simple, so Chrome preflights it WITHOUT the Authorization
    // header. If the token check ran before the OPTIONS branch this would 401, the
    // browser would report an opaque "Failed to fetch", and pairing would silently never
    // complete — a defect otherwise only reproducible in a real Chrome.
    const res = await fetch(`${base}/snapshot`, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-private-network")).toBe("true");
    expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("preflights the SSE endpoint too", async () => {
    const res = await fetch(`${base}/events`, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-private-network")).toBe("true");
  });

  // --- snapshot / doc / wait ---

  it("reports not-connected before the first snapshot push", async () => {
    const res = await fetch(`${base}/doc`, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ connected: false });
  });

  it("relays a pushed snapshot verbatim to the agent", async () => {
    const snap = {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      docVersion: 1,
      title: "Fraud tooling PRD",
      stage: "internal PRD for the payments team",
      sections: [{ heading: "Goals", text: "Cut chargebacks." }],
      activeObservations: [],
      // UX-029. The bridge stores the pushed body wholesale, which is what lets the band
      // reach the agent through an unmodified bridge — no protocolVersion bump, no
      // re-paste. Asserted here rather than assumed, because the deferral rule in the
      // skill is worthless if the field the agent reads never arrives.
      maturity: "forming",
    };
    const push = await fetch(`${base}/snapshot`, {
      method: "POST",
      headers: { ...jsonHeaders, Origin: ORIGIN },
      body: JSON.stringify(snap),
    });
    expect(push.status).toBe(200);

    const doc = await fetch(`${base}/doc`, { headers: auth });
    const relayed = await doc.json();
    expect(relayed).toEqual(snap);
    expect(relayed.maturity).toBe("forming");
  });

  it("returns immediately from /wait when a newer version already exists", async () => {
    const t0 = Date.now();
    const res = await fetch(`${base}/wait?since=0`, { headers: auth });
    expect(await res.json()).toEqual({ docVersion: 1 });
    // The point of `since`: an always-park version loses the snapshot that lands between
    // the agent's /doc read and its /wait call.
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("wakes a parked /wait when a newer snapshot arrives", async () => {
    const t0 = Date.now();
    const waiting = fetch(`${base}/wait?since=1`, { headers: auth }).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 100));
    await fetch(`${base}/snapshot`, {
      method: "POST",
      headers: { ...jsonHeaders, Origin: ORIGIN },
      body: JSON.stringify({ docVersion: 2, sections: [], activeObservations: [] }),
    });
    expect(await waiting).toEqual({ docVersion: 2 });
    expect(Date.now() - t0).toBeLessThan(3000); // a wake, not the 60 s timeout
  });

  it("does NOT wake /wait when only the observations changed", async () => {
    // The app bumps docVersion on content change only. An accepted external card changes
    // activeObservations; if that woke the agent it would re-review, re-submit, and wake
    // itself forever.
    const parked = fetch(`${base}/wait?since=2`, { headers: auth }).then(() => "woke");
    await fetch(`${base}/snapshot`, {
      method: "POST",
      headers: { ...jsonHeaders, Origin: ORIGIN },
      body: JSON.stringify({
        docVersion: 2,
        sections: [],
        activeObservations: [{ type: "clarity", scope: "span", text: "…", source: "Test Agent" }],
      }),
    });
    const raced = await Promise.race([parked, new Promise((r) => setTimeout(() => r("parked"), 400))]);
    expect(raced).toBe("parked");
  });

  // --- the held submit ---

  it("holds /submit until the app's verdict arrives", async () => {
    const controller = new AbortController();
    const events = await openEvents(base, controller);
    const hello = await events.next();
    expect(hello.event).toBe("hello");
    expect(hello.data.agentName).toBe("Test Agent");

    const payload = {
      type: "contradiction",
      scope: "span",
      anchorText: "ship by the end of Q3",
      text: "This section commits to Q3; the Timeline section commits the same work to Q2.",
    };

    let settled = false;
    const submit = fetch(`${base}/submit`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((v) => {
        settled = true;
        return v;
      });

    const relayed = await events.next();
    expect(relayed.event).toBe("submission");
    expect(relayed.data.payload).toEqual(payload);
    const sid = relayed.data.sid as string;
    expect(sid).toBeTruthy();

    // Still held — the agent must not get an answer before writtten has ruled.
    await new Promise((r) => setTimeout(r, 150));
    expect(settled).toBe(false);

    const verdict = await fetch(`${base}/verdict`, {
      method: "POST",
      headers: { ...jsonHeaders, Origin: ORIGIN },
      body: JSON.stringify({ sid, result: "accepted", observationId: "obs-1" }),
    });
    expect((await verdict.json()).ok).toBe(true);

    expect(await submit).toMatchObject({ sid, result: "accepted", observationId: "obs-1" });
    await events.close();
  });

  // The missing "started" signal. The bridge already observed every /doc pull
  // and told the app nothing, so the activity readout sat on `idle` for the
  // entire time an agent was reviewing.
  it("announces a /doc pull to the app as a `pulled` event", async () => {
    const controller = new AbortController();
    const events = await openEvents(base, controller);
    expect((await events.next()).event).toBe("hello");

    await fetch(`${base}/doc`, { headers: auth });

    const pulled = await events.next();
    expect(pulled.event).toBe("pulled");
    // A snapshot was pushed earlier in this suite, so this pull read real content.
    expect(pulled.data.connected).toBe(true);
    expect(typeof pulled.data.docVersion).toBe("number");
    expect(typeof pulled.data.t).toBe("number");
    await events.close();
  });

  // Watch mode was invisible to the app: a parked agent and one that had
  // wandered off were the same silence.
  it("announces a /wait park to the app as a `waiting` event", async () => {
    const controller = new AbortController();
    const events = await openEvents(base, controller);
    expect((await events.next()).event).toBe("hello");

    // `since` is already stale, so /wait returns immediately — the agent is
    // still watching, and the event must fire on entry regardless of branch.
    await fetch(`${base}/wait?since=0`, { headers: auth });

    const waiting = await events.next();
    expect(waiting.event).toBe("waiting");
    expect(waiting.data.since).toBe(0);
    expect(typeof waiting.data.t).toBe("number");
    await events.close();
  });

  /**
   * UX-034. The only moment the bridge can observe the agent going away: a
   * parked `/wait` whose connection drops because the session ended. The bridge
   * already cleaned up silently, so the app went on reporting `watching` for the
   * full idle window after the agent was gone.
   *
   * Driven against the real spawned script — an aborted fetch is precisely what
   * a killed agent session does to a held request.
   */
  it("announces a dropped /wait connection as a `parted` event", async () => {
    const controller = new AbortController();
    const events = await openEvents(base, controller);
    expect((await events.next()).event).toBe("hello");

    // Park for real: `since` is ahead of the current version, so the bridge holds.
    const parkController = new AbortController();
    const parked = fetch(`${base}/wait?since=99999`, {
      headers: auth,
      signal: parkController.signal,
    }).catch(() => {});

    expect((await events.next()).event).toBe("waiting");

    // The agent's session ends while parked.
    parkController.abort();
    await parked;

    const parted = await events.next();
    expect(parted.event).toBe("parted");
    expect(typeof parted.data.t).toBe("number");
    await events.close();
  });

  /**
   * The other half, and the reason the waiter carries `answered`: the bridge's
   * own timeout reply closes the response too. Reporting that as a departure
   * would flicker a healthy watch loop to `quiet` every WAIT_TIMEOUT_MS.
   */
  it("does not announce `parted` when the bridge answers /wait itself", async () => {
    const controller = new AbortController();
    const events = await openEvents(base, controller);
    expect((await events.next()).event).toBe("hello");

    // Stale `since` → answered immediately by the bridge, connection closes.
    await fetch(`${base}/wait?since=0`, { headers: auth });
    expect((await events.next()).event).toBe("waiting");

    // A `parted` would arrive before any later event; using the next real one as
    // a fence proves its absence without sleeping.
    await fetch(`${base}/doc`, { headers: auth });
    expect((await events.next()).event).toBe("pulled");
    await events.close();
  });

  it("relays a retraction", async () => {
    const controller = new AbortController();
    const events = await openEvents(base, controller);
    await events.next(); // hello

    const ack = fetch(`${base}/retract`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ observationId: "obs-1" }),
    }).then((r) => r.json());

    const relayed = await events.next();
    expect(relayed.event).toBe("retract");
    expect(relayed.data.observationId).toBe("obs-1");
    expect(await ack).toEqual({ ok: true });
    await events.close();
  });

  it("fails /submit fast when no app is connected", async () => {
    // Nobody will ever send a verdict, so holding would burn the full 10 s per submission
    // and grind the agent's review pass to a halt.
    await new Promise((r) => setTimeout(r, 250)); // let the aborted SSE clients drain
    const t0 = Date.now();
    const res = await fetch(`${base}/submit`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ type: "clarity", scope: "document", text: "x" }),
    });
    expect(await res.json()).toEqual({ error: "not_connected" });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("answers a stale verdict with 200, not 404", async () => {
    // A verdict arriving one tick after the hold expired is normal. A non-2xx would read
    // as a transport failure and flip the app to "disconnected" for no reason.
    const res = await fetch(`${base}/verdict`, {
      method: "POST",
      headers: { ...jsonHeaders, Origin: ORIGIN },
      body: JSON.stringify({ sid: "no-such-sid", result: "accepted" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stale: true });
  });
});

describe("bridge script — lifecycle", { timeout: 25_000 }, () => {
  it("falls back to the next candidate port when the first is busy", async () => {
    const [busy, free] = [await freePort(), await freePort()];
    const holder: Server = createServer();
    await new Promise<void>((r) => holder.listen(busy, "127.0.0.1", r));
    try {
      const started = await startBridge([busy, free]);
      expect(started.port).toBe(free);
      await killChild(started.child);
    } finally {
      await new Promise<void>((r) => holder.close(() => r()));
    }
  });

  it("exits cleanly on SIGTERM with an SSE client attached", async () => {
    // server.close() alone stops accepting new connections but waits for existing ones,
    // and an SSE stream never ends by itself. Without explicitly ending the streams,
    // Ctrl-C appears to do nothing — a defect review reliably misses.
    const started = await startBridge([await freePort()]);
    const controller = new AbortController();
    const events = await openEvents(started.base, controller);
    await events.next(); // hello — the stream is live

    const t0 = Date.now();
    started.child.kill("SIGTERM");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("bridge did not exit within 3s")), 3000);
      started.child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    expect(Date.now() - t0).toBeLessThan(3000);
    await events.close();
  });

  it("prints the endpoint table for --help and exits 0", async () => {
    const dir = mkdtempSync(join(tmpdir(), "writtten-bridge-help-"));
    tmpDirs.push(dir);
    const file = join(dir, "writtten-bridge.mjs");
    writeFileSync(file, await fetchBridgeScript(), "utf8");
    const { code, out } = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const c = spawn(process.execPath, [file, "--help"], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      c.stdout.on("data", (d) => (out += d));
      c.on("exit", (code) => resolve({ code, out }));
    });
    expect(code).toBe(0);
    for (const path of [
      "/handshake",
      "/events",
      "/snapshot",
      "/verdict",
      "/doc",
      "/wait",
      "/submit",
      "/retract",
    ]) {
      expect(out).toContain(path);
    }
  });

  it("refuses to start without a token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "writtten-bridge-notoken-"));
    tmpDirs.push(dir);
    const file = join(dir, "writtten-bridge.mjs");
    writeFileSync(file, await fetchBridgeScript(), "utf8");
    const code = await new Promise<number | null>((resolve) => {
      const c = spawn(process.execPath, [file, `--origin=${ORIGIN}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      c.on("exit", resolve);
    });
    expect(code).toBe(2);
  });

  afterAll(() => {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  });
});
