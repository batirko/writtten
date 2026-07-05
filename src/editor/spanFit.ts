/**
 * Distant-contradiction detection (UX-009). Given the viewport-relative top of
 * the two conflicting spans and the viewport height, decide whether both can be
 * read at once. When they can't, activating the card floats a peek of the far
 * span next to the near one instead of leaving it off-screen.
 *
 * The factor (< 1) leaves headroom so "fits" means *comfortably* both visible,
 * not merely both technically on-screen at the edges.
 */
export function bothSpansFit(
  aTop: number,
  bTop: number,
  viewportHeight: number,
  factor = 0.85
): boolean {
  return Math.abs(aTop - bTop) < viewportHeight * factor;
}
