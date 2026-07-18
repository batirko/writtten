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

/**
 * Two claims whose token sets are at least this Jaccard-similar are treated as the
 * same claim during candidate dedup (keep-first). 0.9 keeps genuine paraphrases
 * (a compatible restatement of a claim) from each occupying a separate candidate
 * slot, while leaving distinct claims — even lexically close ones — in place.
 */
const NEAR_DUP_THRESHOLD = 0.9;

export interface SelectContradictionOptions {
  /** How many candidates to retrieve per new claim (default 5). */
  perClaimK?: number;
  /** Hard cap on the unioned candidate set handed to the adjudicator (default 15). */
  totalCap?: number;
}

/**
 * Candidate selection for the per-section contradiction check (OBS-038 fix).
 *
 * Replaces the old whole-section blob query + single global top-10 (`prefilterClaims`
 * called with every new claim's text concatenated). That blob query had two composing
 * failures diagnosed on V1 Run 1's real PRDs (0% hero recall):
 *   - it dilutes any one claim's retrieval signal across the whole section, and
 *   - a *compatible* near-duplicate of a claim can outscore and evict the *contradictory*
 *     claim from the top-K, so the true pair never co-occurs in a prompt and the
 *     adjudicator is never asked (candidate SELECTION, not adjudication).
 *
 * A genuine contradiction almost always shares its subject with its counterpart, so
 * *pairwise* claim-to-claim similarity is the right retrieval signal. Keeping lexical
 * Jaccard (embeddings/LEANN stay deferred — see the module header):
 *   1. Dedup near-duplicate candidates (>= NEAR_DUP_THRESHOLD Jaccard), keep-first —
 *      stops a paraphrase cluster from monopolizing every per-claim list.
 *   2. Retrieve the top-`perClaimK` deduped candidates for EACH new claim.
 *   3. Union the per-claim lists, rank each candidate by its max per-claim score,
 *      and slice to `totalCap`.
 *
 * Byte-identity on small docs: when the candidate set is small (<= totalCap) and each
 * new claim is itself among the candidates (the Mechanism-A same-section pool folded
 * in at >= 2 claims), a new claim retrieves itself at Jaccard 1.0, so the union covers
 * every candidate and the output *set* equals `otherClaims`. The call site re-sorts the
 * result by (text, sourceBlockId), so existing contradiction fixtures stay byte-identical.
 *
 * See docs/projects/contradiction_coverage.md § Phase 8B.
 */
export function selectContradictionCandidates<T extends Filterable>(
  newClaims: Filterable[],
  otherClaims: T[],
  { perClaimK = 5, totalCap = 15 }: SelectContradictionOptions = {}
): T[] {
  // 1. Dedup near-duplicate candidates (keep-first, stable order). Cache each kept
  //    candidate's token set so step 2 doesn't re-tokenize it per new claim.
  const deduped: T[] = [];
  const dedupedTokens: Set<string>[] = [];
  for (const cand of otherClaims) {
    const tokens = tokenize(cand.text);
    if (dedupedTokens.some((seen) => jaccardSimilarity(seen, tokens) >= NEAR_DUP_THRESHOLD)) continue;
    deduped.push(cand);
    dedupedTokens.push(tokens);
  }

  const dedupedIndex = new Map<T, number>();
  deduped.forEach((cand, index) => dedupedIndex.set(cand, index));

  // 2 + 3. Per new claim, take the top-`perClaimK` deduped candidates by pairwise
  //        Jaccard; union them, ranking each surviving candidate by its MAX similarity
  //        to any new claim (a candidate contradicting even one new claim earns its slot).
  const maxScore = new Map<T, number>();
  for (const nc of newClaims) {
    const queryTokens = tokenize(nc.text);
    const perClaim = deduped
      .map((cand, index) => ({
        cand,
        index,
        score: jaccardSimilarity(queryTokens, dedupedTokens[index]),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, perClaimK);
    for (const { cand, score } of perClaim) {
      const prev = maxScore.get(cand);
      if (prev === undefined || score > prev) maxScore.set(cand, score);
    }
  }

  // Rank the union by max per-claim score, tie-break by deduped order, then cap.
  return [...maxScore.keys()]
    .sort((a, b) => maxScore.get(b)! - maxScore.get(a)! || dedupedIndex.get(a)! - dedupedIndex.get(b)!)
    .slice(0, totalCap);
}
