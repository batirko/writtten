/**
 * Lexical prefilter for contradiction candidate selection.
 *
 * As a document grows, sending every ledger claim to the contradiction prompt
 * bloats context and cost. This prefilter returns the top-K claims most
 * semantically similar to the query text (using token-overlap / Jaccard
 * similarity), keeping the prompt bounded to what is actually relevant.
 *
 * Decision (Phase 3, 2026-06-02): LEANN (Python + local MCP server) and an
 * ONNX in-browser embedding model were considered. Both deferred:
 *   - LEANN requires Python on the user's machine.
 *   - ONNX adds significant bundle weight for marginal gain at current scales.
 * Token-overlap is sufficient for documents under ~50 distinct claims. Revisit
 * if claim density makes misses observable in practice. Decision logged in
 * docs/plan.md.
 *
 * See docs/projects/message_generation_workflow.md §9 (context envelope) and
 * docs/projects/ai_tooling_integration.md (LEANN decision tree).
 */

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "can",
  "could",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "up",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "out",
  "off",
  "over",
  "under",
  "again",
  "then",
  "once",
  "and",
  "but",
  "or",
  "so",
  "if",
  "as",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "we",
  "you",
  "he",
  "she",
  "they",
  "what",
  "which",
  "who",
  "not",
  "no",
]);

/** Tokenize text into a set of meaningful terms (lowercased, stop-words removed). */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersectionCount = 0;
  for (const token of a) {
    if (b.has(token)) intersectionCount++;
  }
  const unionSize = a.size + b.size - intersectionCount;
  return unionSize === 0 ? 0 : intersectionCount / unionSize;
}

export interface Filterable {
  text: string;
}

/**
 * Returns the top-K items from `candidates` most similar to `query`.
 *
 * - If `candidates.length <= topK`, returns all candidates unchanged (no-op).
 * - Similarity is Jaccard coefficient on tokenized term sets.
 * - Ties are broken by original insertion order (stable).
 */
export function prefilterClaims<T extends Filterable>(
  query: string,
  candidates: T[],
  topK = 10
): T[] {
  if (candidates.length <= topK) return candidates;

  const queryTokens = tokenize(query);
  const scored = candidates.map((item, index) => ({
    item,
    index,
    score: jaccardSimilarity(queryTokens, tokenize(item.text)),
  }));

  // Descending score, then stable by original index
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, topK).map((s) => s.item);
}
