import { describe, it, expect } from "vitest";
import { capabilityForTier, WEAK_CAPABILITY } from "./capability";

describe("capabilityForTier", () => {
  it("strong tier enables confident adjudication and resolution-driving", () => {
    const cap = capabilityForTier("strong");
    expect(cap.tier).toBe("strong");
    expect(cap.adjudicateConfidently).toBe(true);
    expect(cap.driveResolution).toBe(true);
  });

  it("weak tier disables both — the conservative floor", () => {
    const cap = capabilityForTier("weak");
    expect(cap.tier).toBe("weak");
    expect(cap.adjudicateConfidently).toBe(false);
    expect(cap.driveResolution).toBe(false);
  });

  it("WEAK_CAPABILITY is the weak tier — never assume strength without a declaration", () => {
    expect(WEAK_CAPABILITY).toEqual(capabilityForTier("weak"));
  });
});
