import type { Observation } from "../store/db";

/** Observation types whose `anchorText` is the model-normalized (and therefore
 *  inherently capitalized) claim text, not a verbatim source slice. For these,
 *  a captured `anchorQuote` is the user's own words and preferred; without one
 *  we fall back to the normalized claim and render it plainly. */
const CROSS_CLAIM_TYPES: ReadonlySet<Observation["type"]> = new Set([
  "contradiction",
  "strategic_tension",
]);

/**
 * UX-008: format a card's anchor excerpt as a faithful quote of the user's words.
 *
 * Prefers the verbatim `anchorQuote` (the exact source slice at the claim's
 * anchor offsets) over the normalized, capitalized claim `anchorText`. A verbatim
 * excerpt is often lifted mid-sentence, so:
 *   - it leads with an ellipsis when it starts mid-sentence (lowercase first
 *     letter), and keeps its original casing — never force-capitalized;
 *   - it trails with an ellipsis when it's cut before a sentence boundary.
 *
 * The cross-claim paraphrase fallback (a normalized claim, no `anchorQuote`) is a
 * standalone sentence, so it renders plainly with no ellipsis. Returns `null`
 * when there's nothing to quote.
 */
export function formatAnchorExcerpt(obs: {
  type: Observation["type"];
  anchorText?: string;
  anchorQuote?: string;
}): string | null {
  const raw = (obs.anchorQuote ?? obs.anchorText ?? "").trim();
  if (!raw) return null;

  // Verbatim = we're showing the user's own words: always for span checks (their
  // `anchorText` is the flagged substring), and for cross-claim cards only when
  // the precise slice (`anchorQuote`) was captured. The cross-claim paraphrase
  // fallback is a normalized claim and stays a plain standalone sentence.
  const verbatim = obs.anchorQuote != null || !CROSS_CLAIM_TYPES.has(obs.type);
  if (!verbatim) return raw;

  const startsMidSentence = /^\p{Ll}/u.test(raw);
  const endsAtBoundary = /[.!?…][)"'”’\]]?$/.test(raw);
  return `${startsMidSentence ? "…" : ""}${raw}${endsAtBoundary ? "" : "…"}`;
}
