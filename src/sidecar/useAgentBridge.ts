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

  const start = useCallback((pairing: Pairing) => {
    handleRef.current?.stop();
    handleRef.current = startAgentBridge({
      pairing,
      readSnapshot: () => buildAgentSnapshot(DOC_ID),
      // PR1 (src/services/externalObservations.ts) lands the real boundary — taxonomy,
      // register lint, anchor resolution, suppression + budget checks. Until it merges
      // this rejects everything, which is the safe direction: the transport is verified
      // end to end while no unvalidated observation can reach the feed.
      onSubmission: async (): Promise<VerdictBody> => ({
        result: "rejected",
        code: "not_implemented",
        hint: "This build of writtten cannot accept observations yet.",
      }),
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
