/**
 * Agent bridge client — the app half of the bring-your-own-agent connection.
 *
 * See docs/projects/agent_connected_eval.md § Bridge protocol. The bridge itself is a
 * zero-dependency Node script the user's agent runs (published in
 * docs/skills/writtten-agent.md); this module connects out to it over loopback, pushes
 * settled document snapshots, and relays each submission's verdict back.
 *
 * Deliberate non-dependencies: this module imports no React, no DB module, and — most
 * importantly — not the observation boundary (`externalObservations`). The verdict
 * handler is injected, which keeps the transport unit-testable in a bare node worker and
 * keeps enforcement in exactly one place.
 */
import { getActivityPending, subscribeActivity } from "../model/activitySignal";
// Pure module (its own imports are type-only) — importing it keeps this transport
// DB-free and trivially loadable in a bare node test worker.
import {
  agentPushFingerprint,
  changedSectionIndices,
  sectionProseFingerprints,
} from "./docPassMateriality";

/** Bumped only on a breaking protocol change. Equal → connect; anything else → refuse
 *  with "re-copy the prompt". Lives in three places by design: here, the skill template,
 *  and the bridge script — the integration test asserts they agree. */
export const AGENT_PROTOCOL_VERSION = 1;

/** The app probes exactly these, with its own token, and never sweeps beyond them
 *  (agent_connected_eval.md § Non-goals). Kept in sync with DEFAULT_PORTS in the
 *  bridge script. */
export const CANDIDATE_PORTS = [8787, 8788, 8789, 17321];

const PAIRING_STORAGE_KEY = "writtten_agent_pairing";

const PROBE_INTERVAL_MS = 2_000;
const RECONNECT_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 1_500;
/** EventSource reconnects on its own; only give up on the chip after this. */
const DISCONNECT_GRACE_MS = 8_000;
/** Decision (e): one pending verdict at a time, ≥500 ms apart. */
const VERDICT_SPACING_MS = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BridgeState = "idle" | "waiting" | "connected" | "disconnected";
export type BridgeError = "version_mismatch" | null;

export interface Pairing {
  token: string;
  ports: number[];
  origin: string;
  createdAt: number;
}

export interface BridgeStatus {
  state: BridgeState;
  agentName: string | null;
  port: number | null;
  error: BridgeError;
  /** Last successfully-pushed docVersion; null before the first push. */
  docVersion: number | null;
  /** The bridge's per-run id, learned from the `hello` event; null until then.
   *  Attribution scopes on this, not on the display name: two runs of the same
   *  agent are two sources, so a card from a previous run must not read as live
   *  just because something with the same name reconnected. */
  sessionId: string | null;
}

export interface SubmissionMeta {
  agentName: string;
  sessionId: string;
}

export interface VerdictBody {
  result: "accepted" | "rejected";
  observationId?: string;
  code?: string;
  rule?: string;
  hint?: string;
}

export interface SnapshotBody {
  title: string;
  stage: string;
  sections: Array<{ heading: string; text: string }>;
  /** Opaque to the transport — it serializes these and never reads them. The projection
   *  that decides what an agent may see lives in `agentSnapshot.ts`. */
  activeObservations: unknown[];
}

/** The subset of EventSource this module uses — so a node test can supply a fake. */
export interface EventSourceLike {
  readyState: number;
  onopen: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  addEventListener(type: string, fn: (e: { data: string }) => void): void;
  close(): void;
}

export interface BridgeDeps {
  pairing: Pairing;
  /** Assemble the settled snapshot. `null` = nothing to push yet (no editor mounted). */
  readSnapshot: () => Promise<SnapshotBody | null>;
  /** PR1's boundary, injected. A throw becomes an `internal_error` rejection. */
  onSubmission: (payload: unknown, meta: SubmissionMeta) => Promise<VerdictBody>;
  onRetract?: (observationId: string, meta: SubmissionMeta) => Promise<void>;
  // ---- test seams; all default to the real thing ----
  fetchImpl?: typeof fetch;
  eventSourceImpl?: (url: string) => EventSourceLike;
  subscribeSettled?: (fn: () => void) => () => void;
}

export interface AgentBridgeHandle {
  stop(): void;
  getStatus(): BridgeStatus;
  /** Pushes the current status immediately, mirroring subscribeActivity. */
  subscribe(fn: (s: BridgeStatus) => void): () => void;
  pushSnapshot(): Promise<void>;
}

// ---------------------------------------------------------------------------
// The loopback invariant (decision (d))
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * The ONLY way this module produces a request URL — so no future code path can turn the
 * bridge into an egress channel. No pasted prompt, doctored skill, or config can make the
 * app push the document anywhere but the local machine.
 *
 * Note it validates the parsed `hostname`, not the href string: that is what defeats
 * `http://127.0.0.1@evil.example/`, where the loopback-looking part is userinfo and the
 * real host is the attacker's.
 */
export function bridgeUrl(
  pairing: Pairing,
  port: number,
  path: string,
  params: Record<string, string> = {}
): string {
  if (!pairing.ports.includes(port)) {
    throw new Error(`agentBridge: port ${port} is not in this pairing's candidate list`);
  }
  const url = new URL(`http://127.0.0.1:${port}${path}`);
  if (url.protocol !== "http:" || !isLoopbackHost(url.hostname)) {
    throw new Error(`agentBridge: refusing non-loopback bridge URL ${url.href}`);
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.href;
}

/** Asserts an externally-supplied bridge URL is loopback. Exported for the invariant
 *  test corpus and for any future config path. */
export function assertLoopbackUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`agentBridge: unparseable bridge URL ${raw}`);
  }
  if (url.protocol !== "http:" || !isLoopbackHost(url.hostname)) {
    throw new Error(`agentBridge: refusing non-loopback bridge URL ${raw}`);
  }
  return url;
}

// ---------------------------------------------------------------------------
// Pairing persistence
// ---------------------------------------------------------------------------

/**
 * A *capability* check, not an existence check — the distinction is load-bearing.
 * `typeof localStorage === "undefined"` only asks whether the binding is defined,
 * and environments hand out a defined-but-inert Storage: Node ≥ 22 puts a bare
 * `{}` on `globalThis.localStorage` when `--localstorage-file` is absent, and a
 * partial/blocked Storage is possible in restricted browser contexts. Such an
 * object is `typeof "object"`, so the old check returned it as a `Storage` and
 * the first `.getItem` call threw. The `try/catch` still guards the other shape
 * of failure — a *throwing getter*, which is how Safari private mode refuses.
 */
function safeLocalStorage(): Storage | null {
  try {
    const s = typeof localStorage === "undefined" ? null : localStorage;
    return typeof s?.getItem === "function" &&
      typeof s.setItem === "function" &&
      typeof s.removeItem === "function"
      ? s
      : null;
  } catch {
    return null; // storage disabled (private mode, blocked third-party context)
  }
}

export function createPairing(origin: string): Pairing {
  const pairing: Pairing = {
    token:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    ports: [...CANDIDATE_PORTS],
    origin,
    createdAt: Date.now(),
  };
  // Exactly one pairing exists at a time — generating a new prompt invalidates the last.
  // A write that fails (quota, blocked storage) costs the user only the resume-on-reload,
  // never the pairing itself: the token is live in memory and the session works.
  try {
    safeLocalStorage()?.setItem(PAIRING_STORAGE_KEY, JSON.stringify(pairing));
  } catch {
    /* not persisted — the caller still gets a usable pairing */
  }
  return pairing;
}

export function loadPairing(): Pairing | null {
  try {
    const raw = safeLocalStorage()?.getItem(PAIRING_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pairing;
    if (!p?.token || !Array.isArray(p.ports) || !p.origin) return null;
    return p;
  } catch {
    return null; // unreadable or unparseable — treat as "no pairing", never throw
  }
}

export function clearPairing(): void {
  try {
    safeLocalStorage()?.removeItem(PAIRING_STORAGE_KEY);
  } catch {
    /* nothing to clear if the store won't answer */
  }
}

// ---------------------------------------------------------------------------
// Settle detection
// ---------------------------------------------------------------------------

/**
 * The falling edge of the orchestrator's outstanding-work count is the settle signal:
 * `pending` reaching 0 means nothing is debouncing, queued, or in flight, and the count
 * is recomputed in `dispatch`'s finally — after the evaluation's DB writes resolve — so
 * the observations read at that instant are the settled set.
 *
 * `subscribeActivity` replays the current value on subscribe; seeding `prev` from
 * `getActivityPending()` makes the `wasBusy` guard swallow that replay. Concurrent
 * sections collapse naturally (5→4→…→0 fires once).
 */
export function subscribeSettled(fn: () => void): () => void {
  let prev = getActivityPending();
  return subscribeActivity((n) => {
    const wasBusy = prev > 0;
    prev = n;
    if (wasBusy && n === 0) fn();
  });
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

function defaultEventSource(url: string): EventSourceLike {
  // Resolved at call time, never at module scope: a module-scope reference to
  // EventSource throws on import under Node and would break the unit tests before they
  // start.
  const Ctor = (globalThis as { EventSource?: new (u: string) => EventSourceLike }).EventSource;
  if (!Ctor) throw new Error("agentBridge: EventSource is unavailable in this environment");
  return new Ctor(url);
}

/**
 * The materiality fingerprint that gates `docVersion`.
 *
 * Was a byte-exact hash over `[title, stage, sections]`, which answered "did the
 * bytes change" when the question is "could the agent's conclusions change" — a
 * heading split changes `sections[]`, so it woke the agent for a full re-review
 * that found nothing. `agentPushFingerprint` flattens the partition away, so a
 * re-partition of unchanged words is invisible while any real word change still
 * bumps.
 *
 * `activeObservations` stays excluded for the separate reason spelled out in
 * pushSnapshot (self-waking).
 */
function stableContentHash(body: SnapshotBody): string {
  return agentPushFingerprint(body);
}

export function startAgentBridge(deps: BridgeDeps): AgentBridgeHandle {
  const {
    pairing,
    readSnapshot,
    onSubmission,
    onRetract,
    fetchImpl,
    eventSourceImpl = defaultEventSource,
    subscribeSettled: subscribeSettledImpl = subscribeSettled,
  } = deps;

  const doFetch: typeof fetch = (...args) => (fetchImpl ?? globalThis.fetch)(...args);

  let state: BridgeState = "waiting";
  let error: BridgeError = null;
  let agentName: string | null = null;
  let sessionId = "";
  let port: number | null = null;
  let docVersion = 0;
  let lastPushedVersion: number | null = null;
  let lastContentHash: string | null = null;
  // Per-section fingerprints as of the last MATERIAL push, plus the delta hint derived
  // from them. The hint describes `docVersion`, so it is carried unchanged across
  // non-material re-pushes (which re-send the same version) and only recomputed on a bump.
  let lastSectionFps: string[] | null = null;
  let lastHint: { changedSections: number[]; changedSectionsSince: number } | null = null;

  let stopped = false;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let source: EventSourceLike | null = null;
  let verdictChain: Promise<void> = Promise.resolve();

  const listeners = new Set<(s: BridgeStatus) => void>();

  function status(): BridgeStatus {
    return {
      state,
      agentName,
      port,
      error,
      docVersion: lastPushedVersion,
      sessionId: sessionId || null,
    };
  }

  function emit(): void {
    const s = status();
    for (const l of listeners) l(s);
  }

  function setState(next: BridgeState, nextError: BridgeError = null): void {
    if (state === next && error === nextError) return;
    state = next;
    error = nextError;
    emit();
  }

  function clearGrace(): void {
    if (graceTimer) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
  }

  // --- probing ---

  async function probePort(candidate: number): Promise<boolean> {
    // A header-free simple GET: no preflight round-trip in the hot polling loop.
    const url = bridgeUrl(pairing, candidate, "/handshake", { token: pairing.token });
    const res = await doFetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return false;
    const body = (await res.json()) as { protocolVersion?: number; agentName?: string };
    if (body.protocolVersion !== AGENT_PROTOCOL_VERSION) {
      // Park visibly rather than failing: the user's fix is to re-copy the prompt, and
      // they may re-run with a fresh script at any moment.
      setState("waiting", "version_mismatch");
      return false;
    }
    port = candidate;
    agentName = typeof body.agentName === "string" ? body.agentName : "agent";
    return true;
  }

  async function probeOnce(): Promise<boolean> {
    for (const candidate of pairing.ports) {
      if (stopped) return false;
      try {
        if (await probePort(candidate)) return true;
      } catch {
        // 401/403/timeout/TypeError — keep probing silently and indefinitely. On Chrome
        // ~138+ the first probe can fail or hang until the user grants the Local Network
        // Access prompt, so impatience here would strand the pairing.
      }
    }
    return false;
  }

  function scheduleProbe(delay: number): void {
    if (stopped) return;
    probeTimer = setTimeout(async () => {
      if (stopped) return;
      const found = await probeOnce();
      if (stopped) return;
      if (found) openStream();
      else scheduleProbe(state === "disconnected" ? RECONNECT_INTERVAL_MS : PROBE_INTERVAL_MS);
    }, delay);
  }

  // --- stream ---

  function openStream(): void {
    if (stopped || port === null) return;
    try {
      source = eventSourceImpl(bridgeUrl(pairing, port, "/events", { token: pairing.token }));
    } catch {
      dropToDisconnected();
      return;
    }

    source.onopen = () => {
      clearGrace();
      setState("connected");
      void pushSnapshot();
    };

    source.addEventListener("hello", (e) => {
      try {
        const d = JSON.parse(e.data) as { agentName?: string; sessionId?: string };
        if (d.agentName) agentName = d.agentName;
        if (d.sessionId) sessionId = d.sessionId;
        // The stream is live even if onopen didn't fire in this implementation.
        clearGrace();
        setState("connected");
        emit();
      } catch {
        /* malformed hello — the bridge is still usable */
      }
    });

    source.addEventListener("submission", (e) => {
      try {
        const env = JSON.parse(e.data) as { sid: string; payload: unknown };
        enqueueSubmission(env);
      } catch {
        /* ignore malformed frame */
      }
    });

    source.addEventListener("retract", (e) => {
      try {
        const env = JSON.parse(e.data) as { observationId: string };
        if (env.observationId && onRetract) {
          void onRetract(env.observationId, { agentName: agentName ?? "agent", sessionId });
        }
      } catch {
        /* ignore malformed frame */
      }
    });

    source.onerror = () => {
      if (stopped) return;
      // readyState 2 (CLOSED) is terminal; 0 (CONNECTING) means EventSource is retrying on
      // its own, and dropping the chip immediately would flicker it on every blip.
      if (source && source.readyState === 2) dropToDisconnected();
      else if (!graceTimer) graceTimer = setTimeout(dropToDisconnected, DISCONNECT_GRACE_MS);
    };
  }

  function dropToDisconnected(): void {
    clearGrace();
    if (source) {
      try {
        source.close();
      } catch {
        /* already closed */
      }
      source = null;
    }
    if (stopped) return;
    // Cards persist; the app retries quietly so re-running the bridge with the same
    // pairing reconnects with zero UI work (decision 7).
    setState("disconnected");
    scheduleProbe(RECONNECT_INTERVAL_MS);
  }

  // --- verdicts ---

  async function postJson(path: string, body: unknown): Promise<Response> {
    if (port === null) throw new Error("agentBridge: no bound port");
    return doFetch(bridgeUrl(pairing, port, path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pairing.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  function enqueueSubmission(env: { sid: string; payload: unknown }): void {
    verdictChain = verdictChain
      .then(async () => {
        let verdict: VerdictBody;
        try {
          verdict = await onSubmission(env.payload, {
            agentName: agentName ?? "agent",
            sessionId,
          });
        } catch (err) {
          // A throwing boundary must still produce a verdict, or the agent's held
          // /submit hangs the full timeout with nothing to diagnose.
          verdict = {
            result: "rejected",
            code: "internal_error",
            hint: err instanceof Error ? err.message : String(err),
          };
        }
        await postJson("/verdict", { sid: env.sid, ...verdict });
        await new Promise((r) => setTimeout(r, VERDICT_SPACING_MS));
      })
      // A failed verdict POST is a transport problem, handled by the stream's error path.
      // It must not break the chain for subsequent submissions.
      .catch(() => {});
  }

  // --- snapshot ---

  async function pushSnapshot(): Promise<void> {
    if (stopped || state !== "connected" || port === null) return;
    const body = await readSnapshot();
    if (!body) return;

    // We always push, so GET /doc stays a complete, current snapshot; `docVersion` is the
    // separate question of whether the agent should be WOKEN to re-review.
    //
    // Two distinct reasons it may not bump. (a) Only the observations changed: bumping
    // would wake the agent's /wait, which would re-review and possibly re-submit, waking
    // itself forever — and every accepted external card changes activeObservations, so
    // this is not a corner case. (b) The edit was not material: the words are unchanged
    // and only their partition moved (see agentPushFingerprint).
    const hash = stableContentHash(body);
    const sectionFps = sectionProseFingerprints(body.sections);
    if (hash !== lastContentHash) {
      const previousVersion = docVersion;
      docVersion += 1;
      lastContentHash = hash;

      // Derive the delta hint against the previous material version. `null` from
      // changedSectionIndices (section count changed) and the first-ever push (no
      // baseline) both mean "cannot express it" — drop the hint, and the agent
      // correctly falls back to re-reading the whole document.
      const changed = lastSectionFps ? changedSectionIndices(lastSectionFps, sectionFps) : null;
      lastHint = changed ? { changedSections: changed, changedSectionsSince: previousVersion } : null;
      lastSectionFps = sectionFps;
    }

    try {
      await postJson("/snapshot", {
        protocolVersion: AGENT_PROTOCOL_VERSION,
        docVersion,
        ...body,
        // Additive and optional: the field is absent whenever the delta cannot be
        // stated, and `/doc` still carries every section either way.
        ...(lastHint ?? {}),
      });
      lastPushedVersion = docVersion;
      emit();
    } catch {
      dropToDisconnected();
    }
  }

  // --- lifecycle ---

  const unsubscribeSettled = subscribeSettledImpl(() => {
    void pushSnapshot();
  });

  scheduleProbe(0);

  return {
    stop() {
      stopped = true;
      if (probeTimer) clearTimeout(probeTimer);
      clearGrace();
      if (source) {
        try {
          source.close();
        } catch {
          /* already closed */
        }
        source = null;
      }
      unsubscribeSettled();
      listeners.clear();
    },
    getStatus: status,
    subscribe(fn) {
      listeners.add(fn);
      fn(status());
      return () => listeners.delete(fn);
    },
    pushSnapshot,
  };
}
