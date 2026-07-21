/**
 * The de-duplication guard on the agent source signal.
 *
 * This file exists because of one live-only bug (UX-034). `setAgentSourceStatus`
 * drops updates that change nothing, so the bridge client can re-assert state
 * freely without churning React renders. Its `samePass` comparison was a
 * hand-listed subset of `AgentPass` fields — and when the type grew, the field
 * that changes *alone* (`partedAt`: nothing else moves when an agent's
 * connection drops) fell outside the list. Every unit test still passed, because
 * they exercised the bridge client's own `pass` object; the readout was wrong
 * only in the running app, where this projection sits between the two.
 *
 * So the property under test is not "these four fields are compared" — it is
 * **every field is compared**, asserted per-field off the type itself.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { setAgentSourceStatus, getAgentSourceStatus, subscribeAgentSource } from "./agentSourceSignal";
import { EMPTY_PASS, type AgentPass } from "../sidecar/agentActivityView";

const PASS_KEYS = Object.keys(EMPTY_PASS) as (keyof AgentPass)[];

/** A value different from `EMPTY_PASS`'s, whatever the field's type. */
function bump(pass: AgentPass, key: keyof AgentPass): AgentPass {
  const current = pass[key];
  return { ...pass, [key]: typeof current === "number" ? current + 1 : 1 };
}

beforeEach(() => {
  setAgentSourceStatus({ state: "idle" });
});

describe("setAgentSourceStatus — de-duplication", () => {
  it("drops a genuinely identical update", () => {
    const seen: number[] = [];
    const off = subscribeAgentSource(() => seen.push(1));
    seen.length = 0;

    const status = { state: "connected" as const, name: "Claude Code", pass: { ...EMPTY_PASS } };
    setAgentSourceStatus(status);
    const after = seen.length;
    setAgentSourceStatus({ ...status, pass: { ...EMPTY_PASS } });
    expect(seen.length).toBe(after);
    off();
  });

  /**
   * The regression, stated as a property. Generated from the type so a field
   * added later is covered without anyone remembering to add a case — which is
   * exactly what failed the first time.
   */
  it.each(PASS_KEYS)("propagates a change to `%s` alone", (key) => {
    const base: AgentPass = { ...EMPTY_PASS, lastPushAt: 1000 };
    setAgentSourceStatus({ state: "connected", name: "Claude Code", pass: base });

    let notified = false;
    const off = subscribeAgentSource(() => {
      notified = true;
    });
    notified = false; // swallow the replay-on-subscribe

    setAgentSourceStatus({
      state: "connected",
      name: "Claude Code",
      pass: bump(base, key),
    });

    expect(notified, `a change to ${key} was swallowed`).toBe(true);
    expect(getAgentSourceStatus().pass?.[key]).toBe(bump(base, key)[key]);
    off();
  });
});
