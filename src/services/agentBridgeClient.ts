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
import { subscribeDocSettled } from "../model/docSettleSignal";
// Pure module (its own imports are type-only) — importing it keeps this transport
// DB-free and trivially loadable in a bare node test worker.
import {
  agentPushFingerprint,
  changedSectionIndices,
  sectionProseFingerprints,
} from "./docPassMateriality";
import type { MaturityLevel } from "./documentMaturity";
import { llmLogger, type AgentEventInfo } from "../model/logger";
import { EMPTY_PASS, agentPassPhase, type AgentPass } from "../sidecar/agentActivityView";

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
  /** Facts about the current review pass — timestamps and a count, never a
   *  progress estimate. `agentActivityView` derives the readout (and its decay)
   *  from these; see that module for why decay is derived rather than timed. */
  pass: AgentPass;
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
  /**
   * How far along the draft is (UX-029) — the agent's cue to hold off on a document
   * too thin to review, instead of inventing a settle rule off `WAIT_TIMEOUT_MS`.
   *
   * Optional so an app/bridge pair on either side of this change degrades silently,
   * exactly as the `changedSections` hint does. Derived in `agentSnapshot.ts`; the
   * transport only relays it — and gates on it, see `stableContentHash`.
   */
  maturity?: MaturityLevel;
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
  /** Resolves `true` when a card was actually closed. The boolean matters: the
   *  bridge acks the agent unconditionally, so "refused" and "applied" are
   *  indistinguishable from the agent's side and only the log can tell them
   *  apart. */
  onRetract?: (observationId: string, meta: SubmissionMeta) => Promise<boolean>;
  // ---- test seams; all default to the real thing ----
  fetchImpl?: typeof fetch;
  eventSourceImpl?: (url: string) => EventSourceLike;
  subscribeSettled?: (fn: () => void) => () => void;
  /** Where bridge events go for the debug export. Injected for the same reason
   *  as the transport seams: a bare-node unit test shouldn't need the logger. */
  logEvent?: (info: AgentEventInfo) => void;
  /** Injectable clock — the pass timestamps are the thing under test. */
  now?: () => number;
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
 * The document-settle signal is the wake. Coalescing lives in the orchestrator,
 * which owns the window, so this is a pass-through.
 *
 * **This used to read the falling edge of the orchestrator's outstanding-work count**
 * (`pending` 5→4→…→0), on the reasoning that our eval queue draining implied the
 * document had settled. Engine exclusivity broke that implication: with an agent
 * holding the slot the built-in evaluator never arms, so the count never leaves 0,
 * so there is no falling edge — in exactly the mode this bridge exists for. The
 * agent kept the empty snapshot it got at connect and was never sent another
 * (UX-033). The lesson worth keeping: *the document settled* and *writtten has no
 * outstanding work* are different facts that happened to coincide for one release.
 */
export function subscribeSettled(fn: () => void): () => void {
  return subscribeDocSettled(fn);
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
 *
 * **`maturity` is folded in (UX-029), and it has to be.** The fingerprint's whole
 * job is to make re-partitioning invisible — but `blockCount` *is* a re-partition
 * signal, so splitting a paragraph at 120 words takes the band `unformed → forming`
 * while the fingerprint never moves. An agent parked waiting for the draft to
 * become reviewable would sleep through exactly the event it is waiting for. The
 * table case never self-heals at all: table text is excluded from `sections[]`, so
 * 300 words typed into one shift the band without moving a fingerprint byte.
 *
 * Consistent with what the floor is *for*: it asks whether the agent's conclusions
 * could change, and crossing out of `unformed` changes whether it should be drawing
 * conclusions at all. It cannot reintroduce self-waking — maturity reads the
 * document, never the observations.
 */
function stableContentHash(body: SnapshotBody): string {
  return `${agentPushFingerprint(body)}|${body.maturity ?? ""}`;
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
    logEvent = (info) => llmLogger.logAgent(info),
    now = () => Date.now(),
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
  let pass: AgentPass = { ...EMPTY_PASS };

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
      pass: { ...pass },
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
    logEvent({
      event: "pairing",
      state: next,
      agentName: agentName ?? undefined,
      sessionId: sessionId || undefined,
    });
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
        // A different sessionId is a different bridge RUN, not a reconnect of
        // the same one. Its predecessor's pass facts describe work that run did
        // not do — carrying its pass timestamps across would credit a fresh
        // session with the last one's activity. Same reasoning that scopes card
        // attribution on sessionId rather than on the display name.
        if (d.sessionId && d.sessionId !== sessionId) {
          pass = { ...EMPTY_PASS };
        }
        if (d.sessionId) sessionId = d.sessionId;
        // The stream is live even if onopen didn't fire in this implementation.
        clearGrace();
        setState("connected");
        emit();
      } catch {
        /* malformed hello — the bridge is still usable */
      }
    });

    // The agent picked the document up. This is the ONLY "started" signal the
    // protocol carries — there is no "finished" one, which is why the readout
    // derived from it must decay (agentActivityView). Emitted by bridges from
    // this version on; an older bridge simply never sends it and the row stays
    // on "sent", which is still true.
    source.addEventListener("pulled", (e) => {
      try {
        const d = JSON.parse(e.data) as { docVersion?: number; connected?: boolean };
        // A pull before the first snapshot push tells us the agent is alive, but
        // it read nothing — counting it as pickup would start an elapsed timer
        // against a document that never travelled.
        if (d.connected === false) return;
        // A pull only STARTS a stretch when one isn't already running, so a
        // polling agent extends its pass instead of restarting it (UX-035).
        // `agentPassPhase` is the arbiter rather than a hand-rolled comparison,
        // so "is it still reading" has one definition — a stretch ends by
        // parking, by departing, or by decaying, and all three live there.
        const t = now();
        const continuing = agentPassPhase(pass, t) === "reading";
        pass = {
          ...pass,
          lastPullAt: t,
          // A resumed stretch also clears a stale departure: the agent
          // demonstrably came back.
          partedAt: continuing ? pass.partedAt : null,
          readingSince: continuing ? (pass.readingSince ?? t) : t,
          accepted: continuing ? pass.accepted : 0,
        };
        logEvent({ event: "pull", docVersion: d.docVersion, sessionId: sessionId || undefined });
        emit();
      } catch {
        /* malformed frame — the stream is still usable */
      }
    });

    // The agent parking in `GET /wait` — watch mode. Without this, an agent
    // idling in a poll loop and an agent that has gone away are the same
    // silence, which is exactly how a stalled watch session hid in plain sight.
    source.addEventListener("waiting", () => {
      pass = { ...pass, lastWaitAt: now() };
      emit();
    });

    // The agent's parked `/wait` connection dropped — its session ended
    // (UX-034). Additive, like `pulled` and `waiting`: an older pasted bridge
    // simply never sends it and the idle window still covers the case.
    source.addEventListener("parted", () => {
      pass = { ...pass, partedAt: now() };
      emit();
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
        if (!env.observationId) return;
        if (!onRetract) {
          // Log the drop rather than swallowing it. The bridge has already told
          // the agent `{ok:true}`, so a missing handler means the agent believes
          // it withdrew a card that is still on screen — exactly the shipped bug
          // this log family exists to make visible.
          logEvent({ event: "retract", observationId: env.observationId, applied: false });
          return;
        }
        void onRetract(env.observationId, { agentName: agentName ?? "agent", sessionId }).then(
          (applied) => {
            logEvent({
              event: "retract",
              observationId: env.observationId,
              sessionId: sessionId || undefined,
              applied,
            });
          },
          () => logEvent({ event: "retract", observationId: env.observationId, applied: false })
        );
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
        // A submission counts as agent activity whatever the verdict — a burst
        // of rejections is still the agent working, and it is exactly the case a
        // debug export needs to show.
        const payload = (env.payload ?? {}) as { type?: unknown; scope?: unknown };
        // ...but only an ACCEPTED one is counted for display (UX-036). The
        // timestamp re-arms decay on any verdict; the number reports what
        // actually reached the feed, so it can never claim more than the author
        // can see.
        pass = {
          ...pass,
          lastSubmissionAt: now(),
          accepted: pass.accepted + (verdict.result === "accepted" ? 1 : 0),
        };
        logEvent({
          event: "submission",
          sessionId: sessionId || undefined,
          obsType: typeof payload.type === "string" ? payload.type : undefined,
          scope: typeof payload.scope === "string" ? payload.scope : undefined,
          result: verdict.result,
          code: verdict.code,
          rule: verdict.rule,
          observationId: verdict.observationId,
        });
        emit();

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

      // End the pass here, BEFORE the await — not after the POST resolves. A new
      // material version supersedes whatever the agent was reading, so the old
      // pass is over the moment we mint the version; resetting on the far side of
      // the network hop would wipe a pull or submission that arrived while the
      // POST was in flight and silently zero a live pass.
      // This rides on the SAME gate as the version bump, which is what keeps the
      // readout aligned with the materiality floor: a non-material re-push does
      // not wake the agent, so it must not reset the pass it is still working on.
      pass = { ...EMPTY_PASS, lastPushAt: now() };
      logEvent({ event: "snapshot", docVersion, sessionId: sessionId || undefined });
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
