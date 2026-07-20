// ---------------------------------------------------------------------------
// Doc-pass materiality floor (Tier 1) — a pure, semantic dirty-check that sits
// *behind* evaluateDocument's byte-exact `docStateHash` check. The hash says
// "some text changed"; this asks "could it change a doc-level conclusion?"
// before spending a strong-tier call — protecting the binding ~20-RPD free-tier
// budget from reword-only churn.
//
// Pure by construction: no DB, no LLM, no imports beyond a type and a pure
// string normalizer. The persistence + flush-streak wiring lives in
// `evaluateDocument` (evaluator.ts); this module only *classifies* a delta.
//
// See docs/projects/trigger_rederivation.md § "Tier 1 — build spec".
// ---------------------------------------------------------------------------

import type { MaturityLevel } from "./documentMaturity";
import { normalizeText } from "./evaluatorAnchoring";

/** Provisional constants — recalibrated against V1 evidence (separate Todo),
 *  the same way the maturity thresholds shipped provisional. */
export const SUMMARY_DELTA_FLOOR = 2;
export const SUBFLOOR_FLUSH_STREAK = 4;

/**
 * A snapshot of the inputs the last *executed* doc pass reviewed. Written only
 * when a pass actually runs, so every idle diffs against the last executed pass
 * — that is what makes sub-floor deltas *accumulate* (small edits across
 * sections add up) rather than vanish.
 */
export interface DocPassSnapshot {
  /** Stage/context string; "" when unset. */
  stage: string;
  /** Draft maturity level; "" on the legacy path where maturity isn't threaded. */
  maturity: MaturityLevel | "";
  /** Number of sections (meaningful summaries) at the last pass. */
  sectionCount: number;
  /** Ordered section heading texts — order matters for structure_flow. */
  headings: string[];
  /** blockId → normalized summary CONTENT (not the raw-text hash — comparing
   *  what the section *says* is what absorbs reword-only churn). */
  summaries: Record<string, string>;
  /** Sorted `${sourceBlockId}:${normalizedText}` for every active claim. */
  claimSigs: string[];
  /** Consecutive hash-dirty-but-sub-floor idles since the last executed pass.
   *  Bumped by the wiring on suppress; reset to 0 on every executed pass. */
  subFloorDirtyStreak: number;
}

/** The candidate snapshot for the *current* idle. Omits the streak: whether the
 *  streak flushes is a wiring decision, not a property of the delta itself. */
export type CandidateSnapshot = Omit<DocPassSnapshot, "subFloorDirtyStreak">;

/** True iff the two arrays differ in length or any positional element. */
function orderedListsDiffer(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

/** Count of blockIds whose normalized summary content changed between two
 *  snapshots — a summary added, removed, or reworded past normalization all
 *  count as one changed blockId. */
function changedSummaryCount(
  prev: Record<string, string>,
  next: Record<string, string>
): number {
  let changed = 0;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (prev[k] !== next[k]) changed++;
  }
  return changed;
}

/**
 * Classify the delta between the last executed pass (`prev`) and the current
 * idle's inputs (`next`). Material if ANY of the five clauses holds. Owns no
 * streak/flush logic — that is the caller's (see evaluateDocument).
 */
export function isMaterialDelta(
  prev: DocPassSnapshot,
  next: CandidateSnapshot
): { material: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // 1. Claim delta — any claim added / removed-orphaned / reworded past
  //    normalization (set-difference non-empty in either direction).
  const prevClaims = new Set(prev.claimSigs);
  const nextClaims = new Set(next.claimSigs);
  const claimDelta =
    prevClaims.size !== nextClaims.size ||
    next.claimSigs.some((s) => !prevClaims.has(s)) ||
    prev.claimSigs.some((s) => !nextClaims.has(s));
  if (claimDelta) reasons.push("claim");

  // 2. Structure delta — section count or ordered headings differ.
  if (prev.sectionCount !== next.sectionCount || orderedListsDiffer(prev.headings, next.headings)) {
    reasons.push("structure");
  }

  // 3. Maturity edge.
  if (prev.maturity !== next.maturity) reasons.push("maturity");

  // 4. Stage change.
  if (prev.stage !== next.stage) reasons.push("stage");

  // 5. Summary delta ≥ K — enough sections changed what they *say*.
  if (changedSummaryCount(prev.summaries, next.summaries) >= SUMMARY_DELTA_FLOOR) {
    reasons.push("summaries");
  }

  return { material: reasons.length > 0, reasons };
}

// --- Persistence helpers (JSON under the string-KV doc-eval-state store) ------

export function serializeDocPassSnapshot(s: DocPassSnapshot): string {
  return JSON.stringify(s);
}

/**
 * Parse a stored snapshot. Returns null on absent / corrupt / legacy-shaped
 * data, which the caller treats as "no snapshot → run the pass" — the safe
 * fallback (a strong call, never a wrongful suppression).
 */
export function parseDocPassSnapshot(raw: string | undefined | null): DocPassSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (
    typeof p.stage !== "string" ||
    typeof p.maturity !== "string" ||
    typeof p.sectionCount !== "number" ||
    !Array.isArray(p.headings) ||
    typeof p.summaries !== "object" ||
    p.summaries === null ||
    !Array.isArray(p.claimSigs) ||
    typeof p.subFloorDirtyStreak !== "number"
  ) {
    return null;
  }
  return {
    stage: p.stage,
    maturity: p.maturity as MaturityLevel | "",
    sectionCount: p.sectionCount,
    headings: (p.headings as unknown[]).map(String),
    summaries: p.summaries as Record<string, string>,
    claimSigs: (p.claimSigs as unknown[]).map(String),
    subFloorDirtyStreak: p.subFloorDirtyStreak,
  };
}

// ---------------------------------------------------------------------------
// Agent-push materiality (BYOA) — a *sibling* floor, deliberately not the five
// clauses above.
// ---------------------------------------------------------------------------
//
// Why a second classifier rather than reusing `isMaterialDelta`:
//
// 1. It would not have caught the case that motivated it. A connected agent was
//    woken by a heading split and reported back "No new content — just the
//    heading was split into its own section," at ~4.1k tokens for the pass.
//    Clause 2 is "section count or ordered headings differ" — exactly what a
//    heading split does — so the doc-pass floor calls that edit MATERIAL. It is
//    right to: `structure_flow` is a doc-level conclusion that genuinely turns
//    on where the boundaries fall.
//
// 2. Three of the five clauses are not computable here. The floor above reads
//    summaries, claims, and maturity; the bridge's snapshot is `{heading, text}`
//    and id-free by the wire invariant (agent_connected_eval.md § The boundary).
//    Wiring the module across verbatim would leave only `structure` and `stage`
//    live — which reads as "material iff structure or stage changed" and makes a
//    pure prose edit NON-material. That is not a floor, it is a hole: the floor's
//    prose sensitivity lives entirely in the summary clause the bridge can't see.
//
// So the bridge floor is built on the one honest content signal it has — the
// prose itself. The question it answers is "did the words change, or only the
// boxes they sit in?"
//
// Deliberately NOT thresholded (no ≥K clause, hence no accumulation or flush
// streak — nothing is held back, so nothing can dead-end). A threshold makes
// sense when we are spending our own RPD budget on a doc-level conclusion; here
// the agent IS the reviewer, and withholding prose it has never seen is a worse
// failure than an occasional wasted pass. This floor only ever suppresses a pure
// re-partition of unchanged words.

/** Collapse *all* whitespace runs, then trim + lowercase.
 *
 *  Stronger than `normalizeText` (trim + lowercase only), and the collapsing is
 *  the load-bearing part: sections are joined with a single space, so section
 *  boundaries contribute no distinguishing token and a re-partition of the same
 *  words fingerprints identically. */
function normalizeProse(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Fingerprint the prose an agent would review, ignoring how it is partitioned.
 *
 * Heading and body text are flattened together on purpose: promoting an existing
 * line from body text to its own heading moves no words, so it must not wake the
 * agent. What DOES change the fingerprint is anything that changes the words or
 * their order — new prose, a reworded sentence, a renamed heading, or a section
 * reorder (reordering permutes the token stream, and flow is a real conclusion).
 */
export function agentPushFingerprint(body: {
  title: string;
  stage: string;
  sections: Array<{ heading: string; text: string }>;
}): string {
  const prose = body.sections.map((s) => `${s.heading} ${s.text}`).join(" ");
  return JSON.stringify([
    normalizeProse(body.title),
    normalizeProse(body.stage),
    normalizeProse(prose),
  ]);
}

/**
 * Per-section prose fingerprints, positionally aligned with `sections`.
 *
 * Same normalization as `agentPushFingerprint`, applied per section instead of
 * across the whole document — so the two can never disagree about whether a
 * given section's words changed.
 */
export function sectionProseFingerprints(
  sections: Array<{ heading: string; text: string }>
): string[] {
  return sections.map((s) => normalizeProse(`${s.heading} ${s.text}`));
}

/**
 * Which sections changed, as indices into the CURRENT `sections[]` — or `null`
 * meaning "cannot be expressed; re-read everything".
 *
 * `null` is returned whenever the section count changed. Under a split, merge,
 * insertion, or deletion every later index shifts, so an index-wise diff would
 * report a tail of sections whose words never moved — a hint that over-reports
 * is worse than no hint, because the agent pays for it in context. Omission is
 * the safe default and keeps this a pure optimisation: a consumer that ignores
 * the hint entirely is always correct.
 *
 * Same-length reorders are reported index-wise, which flags both the moved
 * sections and nothing else — conservative and true.
 */
export function changedSectionIndices(prev: string[], next: string[]): number[] | null {
  if (prev.length !== next.length) return null;
  const changed: number[] = [];
  for (let i = 0; i < next.length; i++) {
    if (prev[i] !== next[i]) changed.push(i);
  }
  return changed;
}

/** Build a candidate snapshot from raw inputs — the single place summary/claim
 *  normalization is applied, so the wiring and tests stay in lockstep. */
export function buildCandidateSnapshot(input: {
  stage: string | undefined;
  maturity: MaturityLevel | undefined;
  sectionCount: number;
  headings: string[];
  summaries: Array<{ blockId: string; summary: string }>;
  claims: Array<{ sourceBlockId: string; text: string }>;
}): CandidateSnapshot {
  const summaries: Record<string, string> = {};
  for (const s of input.summaries) summaries[s.blockId] = normalizeText(s.summary);
  const claimSigs = input.claims
    .map((c) => `${c.sourceBlockId}:${normalizeText(c.text)}`)
    .sort();
  return {
    stage: input.stage ?? "",
    maturity: input.maturity ?? "",
    sectionCount: input.sectionCount,
    headings: input.headings,
    summaries,
    claimSigs,
  };
}
