import { describe, it, expect } from "vitest";
import { bothSpansFit } from "./spanFit";

// UX-009: decide whether a contradiction's two spans can be read together, which
// gates whether activating the card floats a peek of the far span.
describe("bothSpansFit", () => {
  const H = 800; // viewport height

  it("fits when the two spans are close together", () => {
    expect(bothSpansFit(100, 300, H)).toBe(true);
  });

  it("does not fit when the gap exceeds the viewport factor", () => {
    // gap 700 >= 800 * 0.85 = 680 → distant
    expect(bothSpansFit(100, 800, H)).toBe(false);
  });

  it("is symmetric in argument order", () => {
    expect(bothSpansFit(800, 100, H)).toBe(bothSpansFit(100, 800, H));
  });

  it("treats the factor boundary as not-fitting", () => {
    // exactly at 0.85 * H = 680 → not < → false
    expect(bothSpansFit(0, 680, H)).toBe(false);
    expect(bothSpansFit(0, 679, H)).toBe(true);
  });

  it("respects a custom factor", () => {
    // gap 400, H 800: fits at factor 0.6 (480) but not at 0.4 (320)
    expect(bothSpansFit(0, 400, H, 0.6)).toBe(true);
    expect(bothSpansFit(0, 400, H, 0.4)).toBe(false);
  });
});
