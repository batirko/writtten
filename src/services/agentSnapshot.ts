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
import { documentMaturity, type MaturityLevel } from "./documentMaturity";
import type { SectionMember } from "./types";

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
  /** How far along the draft is — the same three-band judgement our own engine
   *  runs on (UX-029). See `snapshotMaturity`. */
  maturity: MaturityLevel;
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
    // Active observations are shown so the agent doesn't duplicate what the feed
    // already carries — which only works if it can tell whose is whose. The
    // display name only: `sessionId` is internal identity the agent has no use
    // for, and it is what revoke/retract scope on.
    source: o.source?.name ?? "writtten",
  };
}

/**
 * How far along the draft is, as the connected agent should understand it (UX-029).
 *
 * Delegates to the same `documentMaturity` our own engine runs on, so "ready to
 * review" has one definition across both engines rather than a threshold table
 * duplicated into the skill prose — which would drift the moment the constants are
 * recalibrated (they are flagged provisional, and the V1 corpus study is scheduled
 * to tune them).
 *
 * **Table members are excluded, deliberately.** `buildCombined` drops table text
 * from the `sections[]` the agent receives (`editor/section.ts`), so counting it
 * here would let the snapshot claim `mature` over a document whose visible prose is
 * a couple of sentences — the band must describe the document the agent was
 * *given*, not the one the editor holds.
 *
 * Two knowing divergences from `Editor.getMaturity`, both in the same direction
 * (this reads slightly lower): tables as above, and top-level nodes carrying no
 * `blockId` (a `horizontalRule` is the one real instance) never reach `members` at
 * all. Both are immaterial to a three-band split.
 */
export function snapshotMaturity(members: SectionMember[]): MaturityLevel {
  const prose = members.filter((m) => !m.isTable);
  const wordCount = prose.reduce((sum, m) => sum + m.text.split(/\s+/).filter(Boolean).length, 0);
  return documentMaturity({ wordCount, blockCount: prose.length });
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
    maturity: snapshotMaturity(live.members),
  };
}
