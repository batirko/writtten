import { describe, it, expect } from "vitest";
import { closureReasonLabel } from "./closureLabel";

const source = { kind: "agent" as const, name: "Claude Code", sessionId: "sess-1" };

describe("closureReasonLabel", () => {
  it("keeps the pre-existing reason labels intact", () => {
    expect(closureReasonLabel({ closureReason: "resolved_by_edit", status: "auto_closed" })).toBe(
      "resolved by edit"
    );
    expect(closureReasonLabel({ closureReason: "text_removed", status: "auto_closed" })).toBe(
      "text removed"
    );
    expect(closureReasonLabel({ closureReason: "superseded", status: "superseded" })).toBe(
      "superseded"
    );
    expect(closureReasonLabel({ closureReason: "dismissed", status: "dismissed" })).toBe(
      "dismissed"
    );
    expect(closureReasonLabel({ closureReason: "resolved_prior", status: "auto_closed" })).toBe(
      "resolved"
    );
  });

  it("says who closed a withdrawn card, and claims nothing about why", () => {
    // Two wrong stories to stay clear of. With no label at all the archive reads
    // "auto closed", which tells the user the evaluator decided — the opposite of
    // what happened. And the old "retracted by <name>" said the agent changed its
    // mind, which is false whenever the user asked it to cull; writtten never sees
    // that conversation, so the motive is not ours to assert.
    expect(closureReasonLabel({ closureReason: "retracted", status: "auto_closed", source })).toBe(
      "withdrawn by Claude Code"
    );
  });

  it("degrades gracefully when a withdrawn card has lost its source", () => {
    expect(closureReasonLabel({ closureReason: "retracted", status: "auto_closed" })).toBe(
      "withdrawn"
    );
  });

  it("labels the revoke bulk archive", () => {
    expect(
      closureReasonLabel({ closureReason: "source_revoked", status: "auto_closed", source })
    ).toBe("source revoked");
  });

  it("falls back to a humanised status for unknown reasons", () => {
    expect(closureReasonLabel({ status: "auto_closed" })).toBe("auto closed");
    expect(closureReasonLabel({ closureReason: "something_new", status: "superseded" })).toBe(
      "superseded"
    );
  });
});
