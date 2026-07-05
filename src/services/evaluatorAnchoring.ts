// ---------------------------------------------------------------------------
// Anchoring and identity helpers for the evaluator pipeline.
//
// Pure module: no DB, no LLM calls, no side effects. Converts LLM-returned
// substrings to per-block offsets, computes observation identity keys, and
// provides the shared text-comparison utilities used by both the section
// reconciler and the doc-scope reconciler. Follows the seam proved by
// docReconcile.ts — pure functions, injected inputs, no ambient state.
// ---------------------------------------------------------------------------

import type { Observation } from "../store/db";
import type { SectionMember } from "./types";

export type NewObservation = Omit<Observation, "id" | "docId" | "status">;

// ---------------------------------------------------------------------------
// Dirty-check hashing (32-bit FNV-like).
// Note: 32-bit hash; collision probability is low for typical document sizes
// but non-zero — a collision silently skips an eval for that section. Noted
// as known debt (lifecycle_integrity audit #8); fixing requires a behavior
// change (different hash values) and is deferred.
// ---------------------------------------------------------------------------

export function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Text normalization and similarity
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Jaccard word-overlap similarity in [0, 1]. Used by doc-level dedup to treat
 * LLM rephrases of the same observation as equivalent — preventing the
 * "same issue, slightly different wording" false-supersede (OBS-012).
 */
export function textSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => new Set(normalizeText(s).split(/\s+/).filter(Boolean));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1.0;
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 ? intersection / union : 0;
}

// ---------------------------------------------------------------------------
// Observation identity signatures
// ---------------------------------------------------------------------------

/** Canonical key for "is this the same observation slot?" */
export function spanSig(obs: {
  type: string;
  startOffset?: number;
  endOffset?: number;
  conflictingBlockId?: string;
}): string {
  return `${obs.type}:${obs.startOffset ?? ""}:${obs.endOffset ?? ""}:${obs.conflictingBlockId ?? ""}`;
}

/** Content signature for de-duplicating observations that say the same thing
 *  about the same block but differ only in offset (Tier B noise reduction).
 *  See docs/projects/evaluation_signal_quality.md Finding 5. */
export function contentSig(obs: { type: string; blockId?: string; text: string }): string {
  return `${obs.type}:${obs.blockId ?? "doc"}:${normalizeText(obs.text)}`;
}

export function spansOverlap(
  a: { startOffset?: number; endOffset?: number },
  b: { startOffset?: number; endOffset?: number }
): boolean {
  if (a.startOffset == null || a.endOffset == null) return false;
  if (b.startOffset == null || b.endOffset == null) return false;
  return a.startOffset < b.endOffset && b.startOffset < a.endOffset;
}

/** Order-independent identity for a conflict between two blocks of a given type
 *  — used to dedupe sweep results against existing contradictions and across
 *  re-runs (the sweep is purely additive and idempotent), and (L5) to match
 *  dismissal suppressions for conflicts regardless of offsets. This is the
 *  single source of the conflict identity: the dismiss handler imports it so
 *  per-section and sweep emissions of the same pair share a suppression key. */
export function conflictPairKey(
  o: Pick<Observation, "type" | "blockId" | "conflictingBlockId">
): string {
  return `${o.type}::${blockPairKey(o)}`;
}

/**
 * Type-agnostic block-pair key (order-independent) for a cross-claim observation.
 * Unlike `conflictPairKey` it omits the type, so a `contradiction` and a
 * `strategic_tension` on the same two blocks share a key — the basis for
 * cross-type precedence (a contradiction outranks a tension on the same pair).
 */
export function blockPairKey(o: Pick<Observation, "blockId" | "conflictingBlockId">): string {
  const a = o.blockId ?? "";
  const b = o.conflictingBlockId ?? "";
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${lo}|${hi}`;
}

// ---------------------------------------------------------------------------
// Span anchoring
// ---------------------------------------------------------------------------

/**
 * Anchor a returned substring to the exact member block that contains it. The
 * LLM sees the whole section's combined text, but observations must still point
 * at individual blocks so highlights track through edits. Returns null if no
 * member contains the substring (a hallucinated span — dropped).
 */
export function anchorSubstring(
  members: SectionMember[],
  substring: string
): { blockId: string; startOffset: number; endOffset: number } | null {
  for (const m of members) {
    const idx = m.text.indexOf(substring);
    if (idx !== -1) {
      return { blockId: m.blockId, startOffset: idx, endOffset: idx + substring.length };
    }
  }
  return null;
}

/** Precise-anchor fields carried on a claim once resolved to its member block. */
export interface ClaimAnchor {
  anchorBlockId?: string;
  anchorStartOffset?: number;
  anchorEndOffset?: number;
}

/**
 * Resolve each claim to the precise member block + offsets that contain its text
 * (via `anchorSubstring`), so contradiction/tension observations later anchor to
 * the real clause instead of the section's representative (heading) block. Claims
 * whose text isn't a verbatim substring of any member — the LLM reworded it — are
 * returned unchanged (no anchor fields); the emit path then falls back to
 * `sourceBlockId` + whole-block. Pure; the caller counts the unanchored (fallback)
 * ones for the dev measurement. See docs/mechanics/evaluation-triggers.md.
 */
export function anchorClaimsToMembers<T extends { text: string }>(
  members: SectionMember[],
  claims: T[]
): (T & ClaimAnchor)[] {
  return claims.map((c) => {
    // Exact match first; then tolerate a trailing sentence punctuation the
    // extractor commonly appends when it lifts a *mid-sentence* clause into a
    // standalone claim (e.g. claim "…ship in Q3." vs source "…ship in Q3, giving…").
    // Without this that one trailing char fails the substring match and the
    // conflict falls back to the section heading.
    const a =
      anchorSubstring(members, c.text) ??
      anchorSubstring(members, c.text.replace(/[.,;:!?]+$/, ""));
    if (!a) return c;
    return {
      ...c,
      anchorBlockId: a.blockId,
      anchorStartOffset: a.startOffset,
      anchorEndOffset: a.endOffset,
    };
  });
}
