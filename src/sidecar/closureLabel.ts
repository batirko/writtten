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
 * See docs/projects/feed_surface.md (§ Archive — the elegant past: the archive's
 * job is trust) and docs/mechanics/agent-bridge.md.
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
    // The source that submitted this card is what closed it. Name it — "withdrawn"
    // alone would leave the user wondering who did it, and would let an agent's
    // closure read as ours.
    //
    // The verb carries no motive on purpose. It used to be "retracted by <name>",
    // which says *the agent changed its mind* — false whenever the user was the one
    // who asked it to cull, and we cannot tell the two apart: writtten never sees
    // the conversation, so any "the user asked me to" flag would be the agent's
    // unverifiable word. The archive is where a user goes to find out why a card
    // is gone, so it says only what the app can stand behind (owner, 2026-07-25).
    case "retracted":
      return obs.source ? `withdrawn by ${obs.source.name}` : "withdrawn";
    case "source_revoked":
      return "source revoked";
    default:
      return obs.status.replace(/_/g, " ");
  }
}
