/**
 * Owns the agent-bridge lifecycle for the connect UI.
 *
 * Lives in a hook called from `ControlCenter` (which stays mounted whether or not the
 * settings modal is open) rather than inside the section component — so closing Settings
 * never tears down a live pairing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  startAgentBridge,
  createPairing,
  loadPairing,
  clearPairing,
  type AgentBridgeHandle,
  type BridgeStatus,
  type Pairing,
  type VerdictBody,
} from "../services/agentBridgeClient";
import { buildAgentPrompt } from "../services/agentPrompt";
import { buildAgentSnapshot } from "../services/agentSnapshot";
import { agentBridgeEnabled } from "../services/featureFlags";
import { releaseAgentEngine } from "../services/evalEngine";
import { EMPTY_PASS } from "./agentActivityView";
import {
  currentAgentBrowserSupport,
  type AgentBrowserSupport,
} from "../services/agentBrowserSupport";
import {
  currentLoopbackPermission,
  preflightBranch,
  subscribeLoopbackPermission,
  type LoopbackPermission,
} from "../services/agentLocalNetworkPermission";
import {
  submitExternalObservation,
  sanitizeSourceName,
} from "../services/externalObservations";
import { readLiveDoc } from "../model/docSnapshotSource";
import {
  notifyObservationsChanged,
  subscribeObservationsChanged,
} from "../model/observationsSignal";
import { setAgentSourceStatus } from "../model/agentSourceSignal";
import {
  archiveExternalSource,
  countActiveFromSource,
  retractExternalObservation,
} from "../services/externalObservationLifecycle";
import {
  saveObservation,
  loadActiveObservationsForDocument,
  loadSuppressionsForDocument,
} from "../store/db";
import { nanoid } from "nanoid";

/** Single-document app; mirrors the constant in App.tsx / Editor.tsx. */
const DOC_ID = "default";

/**
 * How long to wait before admitting the wait isn't going anywhere.
 *
 * The probe loop is deliberately patient and silent — on Chrome the first fetch
 * can hang until the local-network prompt is answered, so impatience would strand
 * a pairing that was about to work. But patience with nothing on screen is the
 * defect this milestone exists to remove, and the causes we *cannot* detect are
 * the ones that need it most: a dialog the browser suppressed, an embedded shell
 * that force-denies every permission, Firefox (whose state we can't yet vouch
 * for), or the user allowing it and simply never running the bridge.
 *
 * Long enough to clear a slow allow-then-start, short enough that nobody decides
 * the product is broken first.
 */
const STALLED_AFTER_MS = 25_000;

/**
 * Where the local-network pre-flight is in its two-step handshake.
 *
 * `asking` exists because the probe is *what raises the browser dialog*, so
 * anything we render at probe time appears at the same instant as the dialog —
 * and in the same corner of the screen, since both point at the address bar. The
 * dialog is browser chrome and always wins that fight. Explaining first and
 * probing second is the only ordering where the explanation can actually be read.
 */
export type PreflightPhase = "none" | "asking" | "blocked";

const IDLE: BridgeStatus = {
  state: "idle",
  agentName: null,
  port: null,
  error: null,
  docVersion: null,
  sessionId: null,
  pass: EMPTY_PASS,
};

export interface AgentBridgeView {
  enabled: boolean;
  /** Whether this browser can reach a loopback bridge at all. When it can't, no
   *  probe is started — the old behaviour left the user on "Waiting for your
   *  agent…" forever against a limitation we could name up front. */
  support: AgentBrowserSupport;
  status: BridgeStatus;
  /** The personalized prompt, once generated. */
  prompt: string | null;
  promptError: string | null;
  connect: () => void;
  cancel: () => void;
  /** How many active cards the current source has submitted. Drives the
   *  teardown confirm, so the user is told the size of what they'd be clearing
   *  rather than agreeing to an unknown. */
  activeFromSource: number;
  /** Tear the pairing down. `archive: true` also closes everything this source
   *  submitted (closure reason `source_revoked`); `false` keeps the cards, which
   *  then read as revoked-but-kept on their chips. */
  revoke: (archive: boolean) => Promise<void>;
  /** The local-network pre-flight step, when this browser's state warrants one. */
  preflight: PreflightPhase;
  /** Acknowledge the pre-flight and start probing — the act that raises the dialog. */
  proceed: () => void;
  /** Re-read the permission after the user has gone and changed it. */
  recheckPermission: () => void;
  /** The initial wait has run long enough that silence is no longer honest. */
  stalled: boolean;
  /**
   * We could not read the permission, so the waiting state keeps the old
   * unconditional "your browser will ask" line. False once a real reading let us
   * say something better (or say nothing, on `granted`). Defaults true, which is
   * exactly today's behaviour — the honest posture when we know nothing.
   */
  permissionUnreadable: boolean;
}

export function useAgentBridge(): AgentBridgeView {
  // Read once: neither the vendor nor the page's scheme changes under us.
  const [support] = useState<AgentBrowserSupport>(currentAgentBrowserSupport);
  const [status, setStatus] = useState<BridgeStatus>(IDLE);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [activeFromSource, setActiveFromSource] = useState(0);
  const [preflight, setPreflight] = useState<PreflightPhase>("none");
  const [stalled, setStalled] = useState(false);
  const [permissionUnreadable, setPermissionUnreadable] = useState(true);
  const handleRef = useRef<AgentBridgeHandle | null>(null);
  /** The live PermissionStatus, kept so the pre-flight can watch it change. */
  const permissionRef = useRef<LoopbackPermission | null>(null);
  /** A pairing whose reattach is deferred behind the pre-flight — set when a
   *  *resume* (not a fresh connect) has to explain or recover before it probes.
   *  Reattaching the existing pairing rather than minting a new one matters: an
   *  agent may still be running that bridge, and a new token would strand it. */
  const pendingResumeRef = useRef<Pairing | null>(null);
  /** Feeds the boundary's rate check — survives re-renders, resets with the pairing. */
  const lastSubmissionAtRef = useRef<number | undefined>(undefined);

  const start = useCallback((pairing: Pairing) => {
    handleRef.current?.stop();
    handleRef.current = startAgentBridge({
      pairing,
      readSnapshot: () => buildAgentSnapshot(DOC_ID),
      onSubmission: async (payload, meta): Promise<VerdictBody> => {
        const live = readLiveDoc();
        if (!live) {
          return {
            result: "rejected",
            code: "internal_error",
            hint: "No document is open. Pull /doc again before submitting.",
          };
        }
        const [activeObservations, suppressions] = await Promise.all([
          loadActiveObservationsForDocument(DOC_ID),
          loadSuppressionsForDocument(DOC_ID),
        ]);

        const verdict = submitExternalObservation(payload, {
          members: live.members,
          activeObservations,
          suppressions,
          source: {
            kind: "agent",
            name: sanitizeSourceName(meta.agentName),
            sessionId: meta.sessionId,
          },
          now: Date.now(),
          lastSubmissionAt: lastSubmissionAtRef.current,
        });
        // Rate limiting is scored on submissions the boundary actually considered, so the
        // clock advances whatever the verdict — otherwise a rejected burst would reset it.
        lastSubmissionAtRef.current = Date.now();

        if (!verdict.ok) {
          return {
            result: "rejected",
            code: verdict.code,
            rule: verdict.rule,
            hint: verdict.hint,
            observationId: verdict.observationId,
          };
        }

        const id = nanoid();
        await saveObservation({
          ...verdict.observation,
          id,
          docId: DOC_ID,
          status: "active",
        });
        // No eval pass ran, so nothing else will tell the feed to reload.
        notifyObservationsChanged();
        return { result: "accepted", observationId: id };
      },
      // Shipped unwired: the bridge relayed `retract`, acked the agent
      // `{ok:true}`, and the app dropped the frame — so an agent that withdrew a
      // card left it on screen and believed otherwise. Scoped by sessionId
      // inside `retractExternalObservation`: a source may only close its own.
      onRetract: async (observationId, meta) => {
        const applied = await retractExternalObservation(observationId, meta.sessionId);
        // Closing a card outside an eval pass — nothing else refreshes the feed.
        if (applied) notifyObservationsChanged();
        return applied;
      },
    });
    return handleRef.current.subscribe(setStatus);
  }, []);

  /** The probe itself — and therefore the moment the browser dialog is raised. */
  const beginPairing = useCallback(() => {
    setPreflight("none");
    setPromptError(null);
    setPrompt(null);
    // Generating a new prompt invalidates the previous pairing — exactly one at a time.
    const pairing = createPairing(window.location.origin);
    start(pairing);
    buildAgentPrompt({ token: pairing.token, ports: pairing.ports, origin: pairing.origin })
      .then(setPrompt)
      .catch(() => setPromptError("Couldn't build the prompt. Reload and try again."));
  }, [start]);

  /** Reattach a stored pairing rather than minting a new one — the resume
   *  counterpart of `beginPairing`, used once the pre-flight (if any) is cleared. */
  const resumePairing = useCallback(
    (pairing: Pairing) => {
      setPreflight("none");
      setPromptError(null);
      start(pairing);
      void buildAgentPrompt({
        token: pairing.token,
        ports: pairing.ports,
        origin: pairing.origin,
      })
        .then(setPrompt)
        .catch(() => setPromptError("Couldn't build the prompt. Reload and try again."));
    },
    [start]
  );

  /** Leave the pre-flight and start reading: reattach a deferred resume if there
   *  is one (an agent may still be on that bridge), otherwise mint a fresh pairing. */
  const proceedFromPreflight = useCallback(() => {
    const resume = pendingResumeRef.current;
    pendingResumeRef.current = null;
    if (resume) resumePairing(resume);
    else beginPairing();
  }, [beginPairing, resumePairing]);

  const connect = useCallback(() => {
    // Nothing to wait for on a browser that cannot reach loopback. The panel
    // shows the reason instead of a spinner that can never resolve.
    if (!support.supported) return;
    // A fresh connect is never a resume — drop any pairing a prior resume deferred.
    pendingResumeRef.current = null;
    void (async () => {
      const permission = await currentLoopbackPermission();
      permissionRef.current = permission;
      setPermissionUnreadable(preflightBranch(permission) === "unknown");
      switch (preflightBranch(permission)) {
        case "prompt":
          // Explain before probing, never alongside it.
          setPreflight("asking");
          return;
        case "denied":
          // The one case worth refusing outright: probing here buys a wait that
          // cannot end, which is the failure this milestone was written about.
          setPreflight("blocked");
          return;
        default:
          // `granted` (nothing to say) and `unknown` (nothing we can say
          // truthfully — the fallback copy carries it) both go straight through.
          beginPairing();
      }
    })();
  }, [beginPairing, support.supported]);

  /**
   * The user changed the permission somewhere we can't see and came back. Read
   * it again rather than trusting the branch we captured before they left.
   */
  const recheckPermission = useCallback(() => {
    void (async () => {
      const permission = await currentLoopbackPermission();
      permissionRef.current = permission;
      setPermissionUnreadable(preflightBranch(permission) === "unknown");
      if (preflightBranch(permission) === "denied") {
        setPreflight("blocked");
        return;
      }
      proceedFromPreflight();
    })();
  }, [proceedFromPreflight]);

  /** Stop probing and surface the recovery — the block is unrecoverable until
   *  the user changes a browser setting, so waiting on it is the dead end this
   *  feature exists to remove. The pairing is *kept*, not cleared: a block is a
   *  browser setting, not a teardown, and the agent's bridge may still be running,
   *  so allowing again should reattach that pairing rather than mint a new token.
   *  Deferring it lets the watcher (or Try again) resume it. */
  const showBlocked = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setPrompt(null);
    setStatus(IDLE);
    pendingResumeRef.current = loadPairing();
    setPreflight("blocked");
  }, []);

  // Resume an existing pairing across a reload, so re-running the bridge reconnects
  // with no UI work (decision 7) — but not blind.
  useEffect(() => {
    if (!agentBridgeEnabled()) return;
    // A browser that cannot reach loopback at all (chose the agent in Chrome, opened
    // writtten in Safari) can never serve the slot it holds — and unlike "not
    // connected yet", that is not a state the user can act their way out of on this
    // machine. Hand the slot back.
    if (!support.supported) {
      releaseAgentEngine();
      return;
    }
    // No stored pairing is NOT a release any more. Selecting the agent is a standing
    // choice, so "agent selected, nothing attached" is an ordinary state that
    // survives a reload — the panel says "Connect your agent", and the readout says
    // nothing is reading. Releasing here would silently move the user to a key they
    // did not pick, which is the defect this model exists to remove (UX-041).
    const existing = loadPairing();
    if (!existing) return;

    // A resumed pairing must consult the permission the same way a fresh connect
    // does. The first build skipped it and reattached blind — so a permission
    // blocked *between* sessions resumed straight into a probe that could never
    // answer, with nothing on screen saying why, and `permissionRef` left empty so
    // even the live watcher couldn't see the block. Now the resume branches like
    // connect, deferring the actual reattach behind the pre-flight (`pendingResume`)
    // so `granted` later reconnects the existing bridge rather than minting a token.
    let cancelled = false;
    void (async () => {
      const permission = await currentLoopbackPermission();
      if (cancelled) return;
      permissionRef.current = permission;
      setPermissionUnreadable(preflightBranch(permission) === "unknown");
      switch (preflightBranch(permission)) {
        case "denied":
          pendingResumeRef.current = existing;
          setPreflight("blocked");
          return;
        case "prompt":
          // Reattaching would raise the dialog cold again; explain first.
          pendingResumeRef.current = existing;
          setPreflight("asking");
          return;
        default:
          resumePairing(existing);
      }
    })();

    return () => {
      cancelled = true;
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [resumePairing, support.supported]);

  /**
   * Watch the permission from the pre-flight all the way through the wait.
   *
   * Two payoffs, and the second is a bug the first build shipped without. (1) A
   * user who allows in site settings is moved on without hunting for a button —
   * the auto-continue. (2) A user who clicks **Block** on the real dialog, which
   * only appears *after* `beginPairing` has left the pre-flight, would otherwise
   * be met with a silent probe loop until the 25 s floor — the old watcher was
   * torn down the moment the pre-flight closed. Watching until `connected` means
   * a live block flips straight to the recovery. `onchange` is present on every
   * status measured, so this is one listener.
   */
  useEffect(() => {
    if (status.state === "connected") return;
    const st = permissionRef.current?.status;
    if (!st) return;
    return subscribeLoopbackPermission(st, () => {
      if (st.state === "granted") {
        // Only when we're parked on the callout; during the wait the in-flight
        // probe will succeed on its own, and proceeding would double the pairing.
        if (preflight !== "none") proceedFromPreflight();
      } else if (st.state === "denied") {
        showBlocked();
      }
    });
  }, [preflight, status.state, proceedFromPreflight, showBlocked]);

  /**
   * Start the "this isn't going anywhere" clock, scoped to the *initial* wait.
   *
   * Deliberately not applied to `disconnected`, which has its own retry story and
   * a name on screen — the user there knows what they're waiting for.
   */
  useEffect(() => {
    if (status.state !== "waiting") {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALLED_AFTER_MS);
    return () => clearTimeout(timer);
  }, [status.state]);

  const cancel = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    clearPairing();
    setPrompt(null);
    setPromptError(null);
    setStatus(IDLE);
    // Backing out of the pre-flight is a cancel too — drop any deferred resume so
    // a later allow doesn't silently reattach a pairing the user just dismissed.
    setPreflight("none");
    pendingResumeRef.current = null;
    // Deliberately does NOT release the slot. Tearing down a pairing is not the same
    // act as choosing a key, and the app must not choose one on the user's behalf:
    // that silently starts spending their API quota moments after they disconnected,
    // and it moves the settings surface out from under them mid-gesture (UX-041).
    // `evalEngine.ts` already refuses the fallback for a bridge that merely dropped,
    // on exactly this reasoning; a deliberate teardown has the same claim on it.
    // The selection stays on the agent until the user picks the other tab — the
    // Engine control is the only thing that moves it.
  }, []);

  // Republish the pairing state to the app-wide signal. The source chip renders
  // inside the feed — a different React tree from ControlCenter — so a module
  // signal, not a prop, is what reaches it. This hook is the only writer.
  useEffect(() => {
    setAgentSourceStatus(
      status.state === "idle"
        ? { state: "idle" }
        : {
            state: status.state,
            name: status.agentName ?? undefined,
            sessionId: status.sessionId ?? undefined,
            pass: status.pass,
          }
    );
  }, [status.state, status.agentName, status.sessionId, status.pass]);

  // Keep the teardown confirm's count honest: recount whenever the source
  // changes or its cards do (a submission, a dismissal, an eval pass).
  useEffect(() => {
    const sessionId = status.sessionId;
    if (!sessionId) {
      setActiveFromSource(0);
      return;
    }
    let cancelled = false;
    const recount = async () => {
      const active = await loadActiveObservationsForDocument(DOC_ID);
      if (!cancelled) setActiveFromSource(countActiveFromSource(active, sessionId));
    };
    void recount();
    const unsubscribe = subscribeObservationsChanged(() => void recount());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [status.sessionId]);

  const revoke = useCallback(
    async (archive: boolean) => {
      const sessionId = status.sessionId;
      if (archive && sessionId) {
        await archiveExternalSource(DOC_ID, sessionId);
        // Closing cards outside an eval pass — nothing else refreshes the feed.
        notifyObservationsChanged();
      }
      handleRef.current?.stop();
      handleRef.current = null;
      clearPairing();
      setPrompt(null);
      setPromptError(null);
      setStatus(IDLE);
      // Cards the user chose to keep should not read as merely "disconnected" —
      // the source is gone deliberately, and the chip says so.
      if (!archive && sessionId) {
        setAgentSourceStatus({
          state: "revoked",
          name: status.agentName ?? undefined,
          sessionId,
        });
      }
      // Same as `cancel`: no release. Revoking a source is a statement about that
      // source, not a vote for the key engine.
    },
    [status.sessionId, status.agentName]
  );

  return {
    enabled: agentBridgeEnabled(),
    support,
    status,
    prompt,
    promptError,
    connect,
    cancel,
    activeFromSource,
    revoke,
    preflight,
    proceed: proceedFromPreflight,
    recheckPermission,
    stalled,
    permissionUnreadable,
  };
}
