import { describe, it, expect } from "vitest";
import { geminiKeyStatus, summarizePing } from "./ControlCenter";

// The two-field Gemini setup routes a free key + an optional billed key. These
// pure helpers pick the honest status copy and the combined ping verdict; the
// rest of the plumbing (App key derivation, rotation free→paid fallback) is
// covered elsewhere. See docs/projects/byok_capability_model.md.

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

describe("summarizePing — combined verdict", () => {
  it("no keys → invalid nudge", () => {
    expect(summarizePing([])).toEqual({ status: "invalid", label: "Enter a key first." });
  });

  it("both keys reachable → ok, both named", () => {
    const r = summarizePing([
      { field: "free", tier: "free" },
      { field: "paid", tier: "paid" },
    ]);
    expect(r.status).toBe("ok");
    expect(r.label).toBe("Free key reachable (free tier) · Paid key reachable.");
  });

  it("a free-tier key in the paid slot → billing status", () => {
    const r = summarizePing([
      { field: "free", tier: "free" },
      { field: "paid", tier: "free" },
    ]);
    expect(r.status).toBe("billing");
  });

  it("any invalid key dominates → invalid", () => {
    const r = summarizePing([
      { field: "free", tier: "invalid" },
      { field: "paid", tier: "paid" },
    ]);
    expect(r.status).toBe("invalid");
  });

  it("unreachable (no invalid) → network", () => {
    const r = summarizePing([{ field: "paid", tier: "unknown" }]);
    expect(r.status).toBe("network");
  });
});
