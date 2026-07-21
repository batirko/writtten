// writtten-bridge.mjs — writtten agent bridge (protocolVersion 1)
//
// A zero-dependency, token-gated relay between the writtten web app and an agent
// session. Node >= 18. Binds 127.0.0.1 only — the document never leaves this machine.
//
// The bridge holds NO review logic. Every submission is validated app-side, in code the
// agent cannot reach: fixed taxonomy, register lint, locally-resolved anchors. There is
// deliberately no message type that mutates the document.
//
// Reference: https://writtten.com/agent

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PROTOCOL_VERSION = 1;
const BRIDGE_VERSION = "1.0.0";

const SUBMIT_HOLD_MS = 10_000; // how long POST /submit waits for the app's verdict
const WAIT_TIMEOUT_MS = 60_000; // GET /wait long-poll ceiling
const PING_MS = 25_000; // SSE keepalive
const MAX_BODY = 256 * 1024;
const DEFAULT_PORTS = [8787, 8788, 8789, 17321];

const USAGE = `writtten bridge v${BRIDGE_VERSION} (protocolVersion ${PROTOCOL_VERSION})

  node writtten-bridge.mjs --token=<token> --origin=<origin> [--ports=8787,8788] [--name="Your Agent"]

Endpoints — every one requires the token (Authorization: Bearer <t> or ?token=<t>).

  app   GET  /handshake        pairing + liveness probe
  app   GET  /events           SSE: hello | submission | retract | pulled | waiting | ping
  app   POST /snapshot         push the latest settled document snapshot
  app   POST /verdict          { sid, result, ... } completes a held /submit

  agent GET  /doc              latest snapshot ({ connected: false } before the first push)
  agent GET  /wait?since=<n>   long-poll; resolves when a newer docVersion arrives
  agent POST /submit           { type, scope, anchorText?, conflictingAnchorText?, text, confidence? } — held until verdict
  agent POST /retract          { observationId }
`;

// --- args ------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let key = argv[i];
    if (!key.startsWith("--")) continue;
    let value = null;
    const eq = key.indexOf("=");
    if (eq > -1) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      value = argv[++i];
    }
    out[key.slice(2)] = value === null ? true : value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const TOKEN = typeof args.token === "string" ? args.token : "";
if (!TOKEN) {
  process.stderr.write("writtten bridge: --token is required\n\n" + USAGE);
  process.exit(2);
}

// The origin allowlist. Any web page the user visits can try to talk to 127.0.0.1, so a
// browser-originated request whose Origin isn't the app instance that generated this
// pairing is refused. Comma-separated so a self-hoster can list more than one.
const ALLOWED_ORIGINS = new Set(
  String(args.origin ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
if (ALLOWED_ORIGINS.size === 0) {
  process.stderr.write("writtten bridge: --origin is required\n\n" + USAGE);
  process.exit(2);
}

const PORTS = (typeof args.ports === "string" && args.ports.trim()
  ? args.ports.split(",")
  : DEFAULT_PORTS
)
  .map((p) => Number(String(p).trim()))
  .filter((p) => Number.isInteger(p) && p >= 1024 && p <= 65535);
if (PORTS.length === 0) {
  process.stderr.write("writtten bridge: --ports had no usable port numbers\n\n" + USAGE);
  process.exit(2);
}

// Courtesy sanitisation only — the app re-sanitises this. The bridge is not trusted.
const AGENT_NAME =
  String(typeof args.name === "string" ? args.name : "agent")
    .split("")
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join("")
    .slice(0, 32)
    .trim() || "agent";

const SESSION_ID = randomUUID();

// --- state -----------------------------------------------------------------

let snapshot = null; // last pushed snapshot
let docVersion = -1;
const sseClients = new Set(); // app-side SSE responses
const pending = new Map(); // sid -> { res, timer } — held /submit requests
const waiters = new Set(); // { res, since, timer } — parked /wait long-polls
let shuttingDown = false;

// --- http helpers ----------------------------------------------------------

function corsHeaders(origin) {
  // Echo the exact origin rather than "*": tighter, and it survives a later change that
  // introduces credentials. Vary is free and correct.
  return origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

function applyCors(res, origin) {
  for (const [k, v] of Object.entries(corsHeaders(origin))) res.setHeader(k, v);
}

function send(res, status, body) {
  // Guard against a double-send: the /submit timeout and the /verdict path can race.
  if (res.writableEnded || res.destroyed) return;
  const payload = JSON.stringify(body);
  try {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
    });
    res.end(payload);
  } catch {
    /* client vanished mid-write */
  }
}

function tokenOk(req, url) {
  const header = req.headers.authorization ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = url.searchParams.get("token") ?? "";
  // EventSource cannot set headers, which is why ?token= is accepted everywhere.
  return bearer === TOKEN || query === TOKEN;
}

function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on("error", () => {
    /* a client abort must never crash the bridge */
  });
  req.on("end", () => {
    try {
      cb(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
    } catch {
      cb(null);
    }
  });
}

// --- SSE -------------------------------------------------------------------

function writeEvent(res, event, data) {
  if (res.writableEnded || res.destroyed) {
    sseClients.delete(res);
    return false;
  }
  try {
    // The blank line (i.e. the second \n) is what dispatches the event. With one
    // newline the stream looks healthy and no event ever arrives.
    return res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    sseClients.delete(res);
    return false;
  }
}

function broadcast(event, data) {
  for (const res of [...sseClients]) writeEvent(res, event, data);
}

function handleEvents(req, res, origin) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    // Easy to forget, because an SSE stream doesn't look like "an API response": without
    // CORS here the browser rejects the stream before a single event arrives, and
    // EventSource.onerror carries nothing to diagnose it with.
    ...corsHeaders(origin),
  });
  res.flushHeaders?.();
  res.socket?.setNoDelay(true);
  res.socket?.setTimeout(0); // never let an idle-socket timeout reap a quiet stream
  res.write("retry: 3000\n\n");
  sseClients.add(res);
  writeEvent(res, "hello", {
    agentName: AGENT_NAME,
    sessionId: SESSION_ID,
    protocolVersion: PROTOCOL_VERSION,
    bridgeVersion: BRIDGE_VERSION,
  });
  res.on("close", () => sseClients.delete(res));
}

// One shared keepalive, not one per client: per-client intervals leak on disconnect and
// end up writing to destroyed responses. .unref() lets the process exit on Ctrl-C.
const pingTimer = setInterval(() => {
  for (const res of [...sseClients]) writeEvent(res, "ping", { t: Date.now() });
}, PING_MS);
pingTimer.unref();

// --- routes ----------------------------------------------------------------

function handleSnapshot(res, body) {
  if (!body || typeof body !== "object") return send(res, 400, { error: "malformed" });
  snapshot = body;
  docVersion = Number(body.docVersion ?? docVersion);
  // Wake only the waiters whose `since` is now stale. Waking on *any* push would drag
  // watch mode awake for observation-only refreshes.
  for (const w of [...waiters]) {
    if (docVersion > w.since) {
      clearTimeout(w.timer);
      waiters.delete(w);
      send(w.res, 200, { docVersion });
    }
  }
  send(res, 200, { ok: true, docVersion });
}

function handleWait(req, res, url) {
  const since = Number(url.searchParams.get("since") ?? -1);
  // Watch mode is otherwise invisible to the app, which then cannot tell an
  // agent parked here from one that has wandered off — both look like silence.
  // Broadcast on entry, before either branch: an immediate return still means
  // the agent is watching, it just happened to be behind.
  broadcast("waiting", { since, t: Date.now() });
  // Immediate return is the whole point of `since`: an always-park version loses the
  // snapshot that lands between the agent's /doc read and its /wait call, and watch mode
  // then stalls a full timeout per cycle for no visible reason.
  if (snapshot && docVersion > since) return send(res, 200, { docVersion });
  const w = { res, since, timer: null, answered: false };
  w.timer = setTimeout(() => {
    waiters.delete(w);
    w.answered = true;
    send(res, 200, { timeout: true });
  }, WAIT_TIMEOUT_MS);
  waiters.add(w);
  // Response, not request — see handleSubmit. A GET has no body, so req "close" would
  // fire straight away and unpark the waiter before it ever waited.
  res.on("close", () => {
    clearTimeout(w.timer);
    waiters.delete(w);
    // A close we did NOT cause is the agent leaving — its session ended, or the
    // process was killed, while parked here. That is the only moment the bridge
    // can observe a departure at all, and it used to be swallowed: the app kept
    // reporting "watching" for the full idle window after the agent was gone.
    // `answered` separates it from our own timeout reply above, which closes the
    // response too.
    //
    // Note the limit: an agent that simply never calls /wait again after a
    // normal timeout leaves no connection to close. Decay still covers that.
    if (!w.answered) broadcast("parted", { t: Date.now() });
  });
}

function handleSubmit(req, res, body) {
  if (!body || typeof body !== "object") return send(res, 400, { error: "malformed" });
  // With no app attached nobody will ever send a verdict, so holding would burn the full
  // timeout on every submission and grind the agent's review pass to a halt.
  if (sseClients.size === 0) return send(res, 200, { error: "not_connected" });
  const sid = randomUUID();
  const entry = { res, timer: null };
  entry.timer = setTimeout(() => {
    pending.delete(sid);
    send(res, 200, { sid, timeout: true });
  }, SUBMIT_HOLD_MS);
  pending.set(sid, entry);
  // Hook the RESPONSE, not the request: req's "close" fires as soon as the request body
  // has been read, which for a held response is immediately — it would delete the entry
  // before the verdict could ever match it. res "close" is the actual hang-up.
  res.on("close", () => {
    const p = pending.get(sid);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(sid);
    }
  });
  broadcast("submission", { sid, payload: body });
}

function handleVerdict(res, body) {
  const sid = body?.sid;
  const p = sid ? pending.get(sid) : null;
  // A verdict arriving one tick after the hold expired is normal, not a broken
  // connection. A 404 here would read as a transport failure and flip the app to
  // "disconnected" for no reason.
  if (!p) return send(res, 200, { stale: true });
  clearTimeout(p.timer);
  pending.delete(sid);
  send(p.res, 200, body); // completes the agent's held /submit
  send(res, 200, { ok: true }); // completes the app's POST
}

function handleRetract(res, body) {
  const observationId = body?.observationId;
  if (!observationId) return send(res, 400, { error: "malformed" });
  broadcast("retract", { sid: randomUUID(), observationId });
  send(res, 200, { ok: true });
}

function route(req, res, url, origin) {
  const path = url.pathname;
  const method = req.method;

  if (method === "GET" && path === "/handshake") {
    return send(res, 200, {
      protocolVersion: PROTOCOL_VERSION,
      bridgeVersion: BRIDGE_VERSION,
      agentName: AGENT_NAME,
      sessionId: SESSION_ID,
    });
  }
  if (method === "GET" && path === "/events") return handleEvents(req, res, origin);
  if (method === "GET" && path === "/doc") {
    // The agent picking the document up is the ONLY "started" signal this
    // protocol has — it never reports finishing, it just stops. Telling the app
    // costs one frame and is what lets writtten say "reading since 14:02"
    // instead of showing an idle chip through the whole review pass.
    // Additive: the app registers named listeners, so an older app ignores this,
    // and an older bridge simply never sends it. No protocolVersion bump.
    broadcast("pulled", { docVersion, connected: snapshot !== null, t: Date.now() });
    return send(res, 200, snapshot ?? { connected: false });
  }
  if (method === "GET" && path === "/wait") return handleWait(req, res, url);
  if (method === "POST" && path === "/snapshot")
    return readBody(req, (b) => handleSnapshot(res, b));
  if (method === "POST" && path === "/verdict") return readBody(req, (b) => handleVerdict(res, b));
  if (method === "POST" && path === "/submit") return readBody(req, (b) => handleSubmit(req, res, b));
  if (method === "POST" && path === "/retract") return readBody(req, (b) => handleRetract(res, b));

  return send(res, 404, { error: "not_found" });
}

const server = createServer();

server.on("request", (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const origin = req.headers.origin;

  // 1. Origin allowlist first. A preflight carries no token, so this must precede auth.
  //    Exact match only — startsWith("http://localhost") also matches
  //    http://localhost.attacker.example.
  if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) {
    return send(res, 403, { error: "origin_not_allowed" });
  }

  // 2. Preflight, path-agnostic and before the token check. POST /snapshot carries
  //    Authorization + JSON, so Chrome sends OPTIONS with NO Authorization; a token check
  //    here would 401 the preflight, the browser would report an opaque "Failed to
  //    fetch", and pairing would silently never complete. Chrome's private-network
  //    preflight also fires for plain GETs and for the SSE connection, so this cannot be
  //    limited to the POST routes.
  if (req.method === "OPTIONS") {
    applyCors(res, origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, accept");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.headers["access-control-request-private-network"] === "true") {
      // Only meaningful on the preflight; ignored on the actual response.
      res.setHeader("Access-Control-Allow-Private-Network", "true");
    }
    res.writeHead(204);
    return res.end();
  }

  // 3. Token on everything else. CORS headers go on error responses too — without them
  //    the app sees a network error rather than a 401 and can never say "token is stale".
  applyCors(res, origin);
  if (!tokenOk(req, url)) return send(res, 401, { error: "unauthorized" });

  route(req, res, url, origin);
});

// A malformed request or stray TLS handshake from a drive-by page must not kill us.
server.on("clientError", (_err, socket) => socket.destroy());

// --- listen ----------------------------------------------------------------

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      if (err.code === "EADDRINUSE" || err.code === "EACCES") resolve(false);
      else reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(true);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    // The "127.0.0.1" host argument is the most security-relevant token in this file.
    // Without it Node binds 0.0.0.0 and the whole local network can read the document
    // over an unencrypted port. Do not remove it.
    server.listen(port, "127.0.0.1");
  });
}

let boundPort = null;
for (const port of PORTS) {
  if (await listenOn(port)) {
    boundPort = port;
    break;
  }
}

if (boundPort === null) {
  process.stderr.write(
    `writtten bridge: all candidate ports busy (${PORTS.join(",")}). ` +
      `Free one, or re-copy the prompt from writtten for a fresh list.\n`
  );
  process.exit(1);
}

// A late error after a successful listen would otherwise be an uncaught throw.
server.on("error", (err) => {
  process.stderr.write(`writtten bridge: ${err.message}\n`);
  process.exit(1);
});

// Line 1 is parsed by the app's docs and by writtten's integration test — keep it stable.
process.stdout.write(`writtten bridge listening on 127.0.0.1:${boundPort}\n`);
process.stdout.write(
  `  protocolVersion ${PROTOCOL_VERSION} · bridge ${BRIDGE_VERSION} · agent "${AGENT_NAME}"\n`
);
process.stdout.write(`  allowed origin: ${[...ALLOWED_ORIGINS].join(", ")}\n`);

// --- shutdown --------------------------------------------------------------

function shutdown() {
  if (shuttingDown) process.exit(0); // second Ctrl-C = immediate
  shuttingDown = true;
  clearInterval(pingTimer);
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    send(p.res, 200, { shutdown: true });
  }
  pending.clear();
  for (const w of waiters) {
    clearTimeout(w.timer);
    send(w.res, 200, { shutdown: true });
  }
  waiters.clear();
  // server.close() alone appears to hang: it stops accepting new connections but waits
  // for existing ones, and an SSE stream never ends by itself. The open streams must be
  // ended explicitly or Ctrl-C does nothing.
  for (const res of sseClients) {
    try {
      res.end();
    } catch {
      /* already gone */
    }
    res.destroy?.();
  }
  sseClients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
