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
} from "../services/externalObservationLifecycle";
import {
  saveObservation,
  loadActiveObservationsForDocument,
  loadSuppressionsForDocument,
} from "../store/db";
import { nanoid } from "nanoid";

/** Single-document app; mirrors the constant in App.tsx / Editor.tsx. */
const DOC_ID = "default";

const IDLE: BridgeStatus = {
  state: "idle",
  agentName: null,
  port: null,
  error: null,
  docVersion: null,
  sessionId: null,
};

export interface AgentBridgeView {
  enabled: boolean;
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
}

export function useAgentBridge(): AgentBridgeView {
  const [status, setStatus] = useState<BridgeStatus>(IDLE);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [activeFromSource, setActiveFromSource] = useState(0);
  const handleRef = useRef<AgentBridgeHandle | null>(null);
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
    });
    return handleRef.current.subscribe(setStatus);
  }, []);

  // Resume an existing pairing across a reload, so re-running the bridge reconnects with
  // no UI work (decision 7).
  useEffect(() => {
    if (!agentBridgeEnabled()) return;
    const existing = loadPairing();
    if (!existing) return;
    const unsubscribe = start(existing);
    void buildAgentPrompt({
      token: existing.token,
      ports: existing.ports,
      origin: existing.origin,
    })
      .then(setPrompt)
      .catch(() => setPromptError("Couldn't build the prompt. Reload and try again."));
    return () => {
      unsubscribe();
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [start]);

  const connect = useCallback(() => {
    setPromptError(null);
    setPrompt(null);
    // Generating a new prompt invalidates the previous pairing — exactly one at a time.
    const pairing = createPairing(window.location.origin);
    start(pairing);
    buildAgentPrompt({ token: pairing.token, ports: pairing.ports, origin: pairing.origin })
      .then(setPrompt)
      .catch(() => setPromptError("Couldn't build the prompt. Reload and try again."));
  }, [start]);

  const cancel = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    clearPairing();
    setPrompt(null);
    setPromptError(null);
    setStatus(IDLE);
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
          }
    );
  }, [status.state, status.agentName, status.sessionId]);

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
    },
    [status.sessionId, status.agentName]
  );

  return {
    enabled: agentBridgeEnabled(),
    status,
    prompt,
    promptError,
    connect,
    cancel,
    activeFromSource,
    revoke,
  };
}
