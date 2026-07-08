/**
 * Fast/strong tier heuristic for a raw model id.
 *
 * Live models-list endpoints (OpenAI/Anthropic `/v1/models`, Gemini `models.list`)
 * return a flat list with no tier metadata, but the Settings picker needs a
 * fast (cheap/frequent) vs. strong (capable/rare) split. This is a pure,
 * name-based heuristic — deliberately simple and tunable — so a mis-tiered model
 * degrades gracefully (worst case: a heavy model offered under "fast", which the
 * user can re-pick). See docs/projects/multi_provider_router.md (§ Readiness specs).
 *
 * Precedence: an explicit small/fast marker wins (so `gpt-5.5-mini` is fast, not
 * strong), then strong markers, then default to strong — safer to over-tier than
 * to route a heavy model as the frequent, per-keystroke fast call.
 */

export type Tier = "fast" | "strong";

// Fast markers must sit at a token boundary (start or after -/_/.) so "mini"
// doesn't match *inside* "gemini" — which would misclassify every Gemini model
// (incl. gemini-2.5-pro) as fast. Real markers are always delimited: gpt-5.4-mini,
// flash-lite, claude-haiku-4-5, o4-mini.
const FAST_RE = /(?:^|[-_.])(?:mini|nano|lite|flash|haiku)/i;
// Strong markers don't need the boundary guard: a false strong match is harmless
// because "strong" is already the default for anything unmatched.
const STRONG_RE = /pro|opus|sonnet|gpt-5\.[5-9]|gpt-[6-9]/i;

export function classifyTier(id: string): Tier {
  if (FAST_RE.test(id)) return "fast";
  if (STRONG_RE.test(id)) return "strong";
  return "strong";
}
