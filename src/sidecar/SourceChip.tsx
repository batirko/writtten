/**
 * Per-card attribution for an externally-submitted observation (BYOA / PR3).
 *
 * Renders nothing for a built-in observation — the unmarked case is "writtten
 * said this", and chipping it would turn attribution into noise. On an external
 * card it names the agent, and dims to a `disconnected` state once that bridge
 * is gone (the card itself stays; cards outlive the socket).
 *
 * This subscribes to the connection signal itself rather than taking it as a
 * prop, because `GroupedObsCard` renders from two trees (the feed and the
 * SpanPeek float) and neither should have to thread pairing state through.
 *
 * See docs/mechanics/agent-bridge.md.
 */

import { useEffect, useState } from "react";
import type { ObservationSource } from "../store/db";
import {
  subscribeAgentSource,
  getAgentSourceStatus,
  type AgentSourceStatus,
} from "../model/agentSourceSignal";
import { sourceChipView } from "./sourceChipView";

/** Small filled dot for a live source; the disconnected state hollows it out
 *  (see styles.css) so the state never rests on colour alone. */
function SourceDot() {
  return <span className="card-source-dot" aria-hidden="true" />;
}

export function SourceChip({ source }: { source?: ObservationSource }) {
  const [status, setStatus] = useState<AgentSourceStatus>(getAgentSourceStatus);

  useEffect(() => subscribeAgentSource(setStatus), []);

  const view = sourceChipView(source, status);
  if (!view) return null;

  return (
    <span
      className="card-source"
      data-testid="obs-source"
      data-source-state={view.state}
      title={view.title}
    >
      <SourceDot />
      {view.label}
    </span>
  );
}
