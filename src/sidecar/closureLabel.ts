/**
 * How a closed observation explains itself in the archive drawer.
 *
 * Lifted out of SidecarFeed's render as a nested ternary when BYOA added two
 * new closure reasons. The fallback matters: an unmapped reason silently
 * degrades to the raw status ("auto closed"), which reads as *the evaluator
 * decided this* — exactly the wrong story for a card an agent withdrew. Keeping
 * the mapping here, unit-tested, means a new reason gets a label rather than
 * quietly inheriting a misleading one.
 *
 * See docs/features.md (archive = trust surface) and
 * docs/mechanics/agent-bridge.md.
 */

import type { Observation } from "../store/db";

export function closureReasonLabel(
  obs: Pick<Observation, "closureReason" | "status" | "source">
): string {
  switch (obs.closureReason) {
    case "resolved_by_edit":
      return "resolved by edit";
    case "text_removed":
      return "text removed";
    case "superseded":
      return "superseded";
    case "dismissed":
      return "dismissed";
    case "resolved_prior":
      return "resolved";
    // The agent withdrew its own card. Name the source: "retracted" alone would
    // leave the user wondering who did it.
    case "retracted":
      return obs.source ? `retracted by ${obs.source.name}` : "retracted";
    case "source_revoked":
      return "source revoked";
    default:
      return obs.status.replace(/_/g, " ");
  }
}
