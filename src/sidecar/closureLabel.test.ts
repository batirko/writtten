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

  it("names the source that retracted a card", () => {
    // Without this the archive would read "auto closed", which tells the user
    // the evaluator decided — the opposite of what happened.
    expect(closureReasonLabel({ closureReason: "retracted", status: "auto_closed", source })).toBe(
      "retracted by Claude Code"
    );
  });

  it("degrades gracefully when a retracted card has lost its source", () => {
    expect(closureReasonLabel({ closureReason: "retracted", status: "auto_closed" })).toBe(
      "retracted"
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
