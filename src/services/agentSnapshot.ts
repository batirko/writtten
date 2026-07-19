/**
 * Assembles the snapshot pushed to a connected agent's bridge.
 *
 * Kept separate from `agentBridgeClient` so the transport imports no DB module and stays
 * trivially loadable in a bare node test worker; the client takes this as an injected
 * `readSnapshot`.
 *
 * See docs/projects/agent_connected_eval.md § Bridge protocol → Snapshot shape.
 */
import { readLiveDoc, type SnapshotSection } from "../model/docSnapshotSource";
import { loadActiveObservationsForDocument, type Observation } from "../store/db";

export interface AgentSnapshotObservation {
  type: Observation["type"];
  scope: Observation["scope"];
  text: string;
  anchorText?: string;
  source: string;
}

export interface AgentSnapshotBody {
  title: string;
  stage: string;
  sections: SnapshotSection[];
  activeObservations: AgentSnapshotObservation[];
}

/**
 * The exact set of observation fields an agent may see. Exported so a test can assert the
 * mapping below never widens.
 *
 * This is an explicit allowlist and must never become a spread: `{...o, source}` would
 * ship `blockId` / `startOffset` / `endOffset` to the agent the moment anyone adds or
 * reorders a field on `Observation`, silently breaking the "agent never learns block
 * identity" invariant with a green test suite.
 */
export const AGENT_OBSERVATION_FIELDS = ["type", "scope", "text", "anchorText", "source"] as const;

export function toAgentObservation(o: Observation): AgentSnapshotObservation {
  return {
    type: o.type,
    scope: o.scope,
    text: o.text,
    ...(o.anchorText ? { anchorText: o.anchorText } : {}),
    // PR3 gives external cards a real `source`; until then everything active is ours.
    source: "writtten",
  };
}

/**
 * Build the snapshot body, or null when no editor is mounted yet (nothing to push).
 *
 * Active observations are included so the agent can avoid duplicating what the feed
 * already shows. Dismissal suppressions are deliberately NOT included — exposing them
 * would invite the agent to self-censor whole categories, the exact sycophancy the
 * flattery-resistant-dismissal guardrail exists to prevent (decision (b)). A
 * re-submission that matches a suppression is rejected per-item instead.
 */
export async function buildAgentSnapshot(docId: string): Promise<AgentSnapshotBody | null> {
  const live = readLiveDoc();
  if (!live) return null;
  const active = await loadActiveObservationsForDocument(docId);
  return {
    title: live.title,
    stage: live.stage,
    sections: live.sections,
    activeObservations: active.map(toAgentObservation),
  };
}
