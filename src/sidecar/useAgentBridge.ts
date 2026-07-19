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
import { FEATURE_AGENT_BRIDGE } from "../services/featureFlags";
import {
  submitExternalObservation,
  sanitizeSourceName,
} from "../services/externalObservations";
import { readLiveDoc } from "../model/docSnapshotSource";
import { notifyObservationsChanged } from "../model/observationsSignal";
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
};

export interface AgentBridgeView {
  enabled: boolean;
  status: BridgeStatus;
  /** The personalized prompt, once generated. */
  prompt: string | null;
  promptError: string | null;
  connect: () => void;
  cancel: () => void;
}

export function useAgentBridge(): AgentBridgeView {
  const [status, setStatus] = useState<BridgeStatus>(IDLE);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
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
    if (!FEATURE_AGENT_BRIDGE) return;
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

  return { enabled: FEATURE_AGENT_BRIDGE, status, prompt, promptError, connect, cancel };
}
