// ---------------------------------------------------------------------------
// Anchoring and identity helpers for the evaluator pipeline.
//
// Pure module: no DB, no LLM calls, no side effects. Converts LLM-returned
// substrings to per-block offsets, computes observation identity keys, and
// provides the shared text-comparison utilities used by both the section
// reconciler and the doc-scope reconciler. Follows the seam proved by
// docReconcile.ts — pure functions, injected inputs, no ambient state.
// ---------------------------------------------------------------------------

import type { DismissalSuppression, Observation } from "../store/db";
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
// Suppression check
//
// Lives here rather than in evaluatorReconcile.ts (which re-exports it for its
// existing callers) so the *pure* layer owns it: the external-observation
// boundary must run the identical check without importing the DB module.
// One suppression rule, two sources — an agent's re-submission of a dismissed
// observation is filtered by exactly the logic that filters the evaluator's.
// ---------------------------------------------------------------------------

export function isSpanSuppressed(
  newO: NewObservation,
  suppressions: DismissalSuppression[]
): boolean {
  const spanKey =
    newO.blockId != null
      ? `${newO.blockId}:${newO.startOffset ?? ""}:${newO.endOffset ?? ""}`
      : undefined;
  const isConflict = newO.type === "contradiction" || newO.type === "strategic_tension";
  const newAnchorNorm = newO.anchorText ? normalizeText(newO.anchorText) : "";
  return suppressions.some((s) => {
    if (s.type !== newO.type) return false;

    // G1: Flattery-resistant dismissal
    // High-severity observations and critical defects are span-only suppressions.
    // Low/medium severity observations are category-wide.
    const isSpanOnly =
      s.severity === "high" || s.type === "contradiction" || s.type === "unsupported_claim";

    if (!isSpanOnly) {
      // Category-wide suppression for this document
      return true;
    }

    // L5 — match by content identity, with the offset signature as fallback so
    // legacy suppressions (and observations without anchor text) still work.
    if (isConflict) {
      // Conflicts are identified by their (order-independent) block pair, which
      // is offset-free — so a dismissal holds whether the pair is re-emitted by
      // the per-section path (precise offsets) or the ledger sweep (0:9999).
      if (s.conflictPairKey) return s.conflictPairKey === conflictPairKey(newO);
      return s.spanSignature != null && s.spanSignature === spanKey;
    }

    // Span observations (clarity / unsupported_claim / undefined_jargon): match
    // on (blockId + normalized anchor text) so the dismissal survives edits that
    // shift offsets. blockId keeps it precise (the same phrase in another block
    // is a genuinely different span). blockId is recovered from the suppression's
    // spanSignature ("blockId:start:end").
    if (s.anchorText && s.anchorText.trim() && newAnchorNorm) {
      const suppressedBlockId = s.spanSignature?.split(":")[0];
      return (
        suppressedBlockId != null &&
        suppressedBlockId === newO.blockId &&
        normalizeText(s.anchorText) === newAnchorNorm
      );
    }
    return s.spanSignature != null && s.spanSignature === spanKey;
  });
}

// ---------------------------------------------------------------------------
// Span anchoring
// ---------------------------------------------------------------------------

/**
 * Anchor a returned substring to the exact member block that contains it. The
 * LLM sees the whole section's combined text, but observations must still point
 * at individual blocks so highlights track through edits. Returns null if no
 * member contains the substring (a hallucinated span — dropped).
 *
 * Tries a case-sensitive match first, then falls back to case-insensitive: the
 * extractor commonly capitalizes a claim it lifts into a standalone sentence
 * even when the source clause is lowercase mid-sentence (e.g. source "...it
 * stays quiet..." vs claim "It stays quiet..."). Without the fallback, that
 * case difference alone sends the claim to the whole-block fallback, which can
 * anchor a cross-claim observation to the wrong-looking span (a real anchor
 * exists, just not case-exact). The returned offsets are always taken from the
 * *source* text, so the resolved span stays byte-exact to the document.
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
  const lowerSubstring = substring.toLowerCase();
  for (const m of members) {
    const idx = m.text.toLowerCase().indexOf(lowerSubstring);
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
  /** True when the anchor is a *verbatim* substring match (precise clause);
   *  false when the claim was reworded and we fell back to a whole **body**
   *  block (OBS-032). Absent on hand-built fixtures that skip anchoring. The dev
   *  paraphrase-residual counter reads this (an approximate anchor still has an
   *  `anchorBlockId`, so `!anchorBlockId` would no longer measure the residual). */
  anchorExact?: boolean;
  /** UX-008: the user's *verbatim* words at the resolved offsets — the exact
   *  source-text slice, which may be a mid-sentence, lowercase clause. Only set on
   *  a precise (exact) anchor; absent on the whole-body-block paraphrase fallback
   *  (no faithful excerpt available). Lets the card quote the user's own words with
   *  a leading `…` instead of the model-normalized, capitalized claim text. */
  anchorQuote?: string;
}

/**
 * The first **body** member of a section — skipping heading and table blocks —
 * used as the whole-block anchor fallback so a reworded claim never lights the
 * section's heading (OBS-032). Mirrors the `hasBody` predicate in `evaluateSection`.
 * Falls back to `members[0]` defensively (unreachable for claim-bearing sections:
 * a bodyless heading section is short-circuited inert before extraction — OBS-029).
 */
export function firstBodyMember(members: SectionMember[]): SectionMember | undefined {
  return (
    members.find((m) => !m.isHeading && !m.isTable && m.text.trim().length > 0) ?? members[0]
  );
}

/**
 * Resolve each claim to the precise member block + offsets that contain its text
 * (via `anchorSubstring`), so contradiction/tension observations anchor to the
 * real clause. When the claim text isn't a verbatim substring of any member — the
 * LLM reworded it — fall back to the section's first **body** block, whole-block
 * (`0..text.length`), marked `anchorExact: false`, so the conflict lights the body
 * sentence rather than the section heading (OBS-032). This resolved body block is
 * carried on the ledger, so both the per-section conflicting side and the doc-wide
 * sweep (which only see ledger rows, not `members`) inherit it. Pure; the caller
 * counts the approximate anchors for the dev measurement.
 * See docs/mechanics/evaluation-triggers.md.
 */
export function anchorClaimsToMembers<T extends { text: string }>(
  members: SectionMember[],
  claims: T[]
): (T & ClaimAnchor)[] {
  const body = firstBodyMember(members);
  return claims.map((c) => {
    // Exact match first; then tolerate a trailing sentence punctuation the
    // extractor commonly appends when it lifts a *mid-sentence* clause into a
    // standalone claim (e.g. claim "…ship in Q3." vs source "…ship in Q3, giving…").
    // Without this that one trailing char fails the substring match and the
    // conflict falls back to whole-block.
    const a =
      anchorSubstring(members, c.text) ??
      anchorSubstring(members, c.text.replace(/[.,;:!?]+$/, ""));
    if (a) {
      // UX-008: the exact source slice at these offsets is the user's verbatim
      // words (may be a mid-sentence, lowercase clause) — distinct from the
      // normalized claim `text`. Slice the member's flat text so the quote is
      // faithful to the document, not to the extractor's rendering.
      const member = members.find((m) => m.blockId === a.blockId);
      const anchorQuote = member?.text.slice(a.startOffset, a.endOffset);
      return {
        ...c,
        anchorBlockId: a.blockId,
        anchorStartOffset: a.startOffset,
        anchorEndOffset: a.endOffset,
        anchorExact: true,
        anchorQuote,
      };
    }
    // Reworded claim → whole-body-block fallback (never the heading). If the
    // section somehow has no member at all, leave it unanchored (emit's own
    // `sourceBlockId` fallback then applies).
    if (!body) return c;
    return {
      ...c,
      anchorBlockId: body.blockId,
      anchorStartOffset: 0,
      // 9999 sentinel (not body.text.length): downstream (evaluator.ts emit,
      // reanchorOffset's isWholeBlockSentinel) distinguishes "whole-block
      // fallback" from "exact anchor whose text later vanished" by this exact
      // value. A real length here reads as the latter and gets suppressed.
      anchorEndOffset: 9999,
      anchorExact: false,
    };
  });
}
