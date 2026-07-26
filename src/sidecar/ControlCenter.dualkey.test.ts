import { describe, it, expect } from "vitest";
import { geminiKeyStatus } from "./ControlCenter";

// The two-field Gemini setup routes a free key + an optional billed key. This
// pure helper picks the honest status copy; the rest of the plumbing (App key
// derivation, rotation free→paid fallback) is covered elsewhere. See
// docs/projects/byok_capability_model.md.
//
// A `summarizePing` block sat here until 2026-07-25 and went with the "Ping model"
// button in the settings rework. Nothing it asserted is unguarded: the one case
// with product meaning — a free-tier key pasted into the paid slot — is the
// geminiKeyStatus case above, which is what actually renders the warning now.

describe("geminiKeyStatus — combined two-key read", () => {
  const base = { geminiTier: "idle", geminiPaidTier: "idle", keyTier: "weak" } as const;

  it("free + paid keys both set → paid split", () => {
    const s = geminiKeyStatus({ ...base, hasFree: true, hasPaid: true, geminiPaidTier: "paid" });
    expect(s.cls).toBe("paid");
  });

  it("paid field holding a free-tier key → warns (invalid styling)", () => {
    const s = geminiKeyStatus({ ...base, hasFree: true, hasPaid: true, geminiPaidTier: "free" });
    expect(s.cls).toBe("invalid");
  });

  it("paid field unrecognized → warns", () => {
    const s = geminiKeyStatus({
      ...base,
      hasFree: false,
      hasPaid: true,
      geminiPaidTier: "invalid",
    });
    expect(s.cls).toBe("invalid");
  });

  it("paid key only → paid", () => {
    const s = geminiKeyStatus({ ...base, hasFree: false, hasPaid: true, geminiPaidTier: "paid" });
    expect(s.cls).toBe("paid");
  });

  it("free key only, detected free → free", () => {
    const s = geminiKeyStatus({ ...base, hasFree: true, hasPaid: false, geminiTier: "free" });
    expect(s.cls).toBe("free");
  });

  it("free key only, detected paid (single-key backward compat) → paid", () => {
    const s = geminiKeyStatus({ ...base, hasFree: true, hasPaid: false, geminiTier: "paid" });
    expect(s.cls).toBe("paid");
  });

  it("free key only, persisted strong tier before detection resolves → paid", () => {
    const s = geminiKeyStatus({ ...base, hasFree: true, hasPaid: false, keyTier: "strong" });
    expect(s.cls).toBe("paid");
  });

  it("free key only, still detecting → detecting", () => {
    const s = geminiKeyStatus({ ...base, hasFree: true, hasPaid: false, geminiTier: "detecting" });
    expect(s.cls).toBe("detecting");
  });
});
