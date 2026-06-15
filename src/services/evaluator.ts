import { createRouter } from "../model/factory";
import { getLlmMode } from "../model/mock";
import { prefilterClaims } from "./prefilter";
import { computePriority } from "./priority";
import { JARGON_PRESET } from "./jargonPreset";
import {
  saveBlockSummary,
  loadBlockSummary,
  saveClaimsForBlock,
  loadActiveClaimsForDocument,
  loadBlockSummariesForDocument,
  saveDocEvalState,
  loadDocEvalState,
  saveObservation,
  loadActiveObservationsForDocument,
  updateObservationStatus,
  loadSuppressionsForDocument,
  type ClaimLedgerEntry,
  type DismissalSuppression,
  type Observation,
} from "../store/db";
import { nanoid } from "nanoid";
import { harness } from "../debug/harness";
import { llmLogger, type ArchiveInfo } from "../model/logger";
import type { SectionMember } from "./types";
import { planDocReconciliation } from "./docReconcile";
import { type ModelCapability, WEAK_CAPABILITY } from "../model/capability";

/**
 * Record a system-driven observation closure in the debug log (dev-only).
 * Mirrors the user-driven archives emitted from App.tsx, so the log shows every
 * status transition with its actor + reason. See docs/projects/debug_log.md.
 */
function archiveObs(
  o: Observation,
  reason: ArchiveInfo["reason"],
  evalId?: string,
  supersededBy?: string
): void {
  if (!import.meta.env.DEV) return;
  harness.archive(
    {
      observationId: o.id,
      obsType: o.type,
      kind: o.kind,
      severity: o.severity,
      scope: o.scope,
      blockId: o.blockId,
      text: o.text,
      reason,
      actor: "system",
      supersededBy,
    },
    evalId
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function parseJSONResponse(text: string): unknown {
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        /* fallback */
      }
    }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch {
        /* fallback */
      }
    }
    throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}...`);
  }
}

// ---------------------------------------------------------------------------
// Reconciliation: dedupe / supersede / auto-close / insert
// See docs/projects/message_generation_workflow.md §7
// ---------------------------------------------------------------------------

/** Canonical key for "is this the same observation slot?" */
function spanSig(obs: {
  type: string;
  startOffset?: number;
  endOffset?: number;
  conflictingBlockId?: string;
}): string {
  return `${obs.type}:${obs.startOffset ?? ""}:${obs.endOffset ?? ""}:${obs.conflictingBlockId ?? ""}`;
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase();
}

/** Content signature for de-duplicating observations that say the same thing
 *  about the same block but differ only in offset (Tier B noise reduction).
 *  See docs/projects/evaluation_signal_quality.md Finding 5. */
function contentSig(obs: { type: string; blockId?: string; text: string }): string {
  return `${obs.type}:${obs.blockId ?? "doc"}:${normalizeText(obs.text)}`;
}

/**
 * Jaccard word-overlap similarity in [0, 1]. Used by doc-level dedup to treat
 * LLM rephrases of the same observation as equivalent — preventing the
 * "same issue, slightly different wording" false-supersede (OBS-012).
 */
function textSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => new Set(normalizeText(s).split(/\s+/).filter(Boolean));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1.0;
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 ? intersection / union : 0;
}

function spansOverlap(
  a: { startOffset?: number; endOffset?: number },
  b: { startOffset?: number; endOffset?: number }
): boolean {
  if (a.startOffset == null || a.endOffset == null) return false;
  if (b.startOffset == null || b.endOffset == null) return false;
  return a.startOffset < b.endOffset && b.startOffset < a.endOffset;
}

type NewObservation = Omit<Observation, "id" | "docId" | "status">;

/**
 * Compare the freshly-computed set of observations for a block against what is
 * already active in the DB, then apply the decision table:
 *
 *   same (type + span + text)  → dedupe  (keep existing id)
 *   same type + overlapping span, different text → supersede old, insert new
 *   new type / new span        → insert
 *   existing with no new match → auto_close
 *
 * This replaces the old blanket "close everything, re-insert" approach that
 * caused observation flicker and broke dismissal suppression.
 */
function isSpanSuppressed(newO: NewObservation, suppressions: DismissalSuppression[]): boolean {
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

async function reconcileObservations(
  docId: string,
  memberBlockIds: string[],
  newObs: NewObservation[],
  /** Observation ids the model explicitly confirmed are resolved. Force-closed
   *  before the normal step-4 orphan pass so they aren't re-inserted. */
  resolvedPriorIds: ReadonlySet<string> = new Set(),
  evalId?: string
): Promise<void> {
  const [allActive, suppressions] = await Promise.all([
    loadActiveObservationsForDocument(docId),
    loadSuppressionsForDocument(docId),
  ]);
  // A section eval reconciles every observation anchored to one of its member
  // blocks — not just a single block. Keep the section keyed by representative
  // id in memberBlockIds so contradictions (anchored there) reconcile too.
  const memberSet = new Set(memberBlockIds);
  const existing = allActive.filter((o) => o.blockId != null && memberSet.has(o.blockId));
  const matchedExistingIds = new Set<string>();
  // Tracks content signatures already kept/inserted this pass, so two new
  // observations that say the same thing (or one that duplicates a kept
  // existing one at a different offset) collapse to a single card.
  const seenContent = new Set<string>();

  // 0-pre. Force-close any observation the model explicitly confirmed resolved.
  // This happens before the normal loop so the force-closed obs are already
  // matched and won't be re-inserted via content-sig dedup (OBS-021).
  for (const obs of existing) {
    if (resolvedPriorIds.has(obs.id)) {
      await updateObservationStatus(obs.id, "auto_closed", "resolved_prior");
      archiveObs(obs, "resolved_prior", evalId);
      matchedExistingIds.add(obs.id);
    }
  }

  for (const newO of newObs) {
    // Suppression check — never re-insert a dismissed span
    if (isSpanSuppressed(newO, suppressions)) continue;

    const csig = contentSig(newO);
    // Already kept/inserted an equivalent observation in this batch → drop dupe.
    if (seenContent.has(csig)) continue;

    // 0. Content match against an existing active obs → dedupe: keep it as-is
    //    even if its offsets drifted slightly. Prevents duplicate cards.
    const contentMatch = existing.find(
      (e) => !matchedExistingIds.has(e.id) && contentSig(e) === csig
    );
    if (contentMatch) {
      matchedExistingIds.add(contentMatch.id);
      seenContent.add(csig);
      continue;
    }

    const newSig = spanSig(newO);

    // 1. Exact match → dedupe: keep the existing record untouched
    const exactMatch = existing.find(
      (e) =>
        spanSig(e) === newSig &&
        normalizeText(e.text) === normalizeText(newO.text) &&
        !matchedExistingIds.has(e.id)
    );
    if (exactMatch) {
      matchedExistingIds.add(exactMatch.id);
      seenContent.add(csig);
      continue;
    }

    // 2. Same type + overlapping span, different text → supersede old, insert new
    const newId = nanoid(10);
    const supersedable = existing.find(
      (e) => e.type === newO.type && spansOverlap(e, newO) && !matchedExistingIds.has(e.id)
    );
    if (supersedable) {
      await updateObservationStatus(supersedable.id, "superseded", "superseded");
      archiveObs(supersedable, "superseded", evalId, newId);
      matchedExistingIds.add(supersedable.id);
    }

    // 3. Insert new observation
    await saveObservation({
      id: newId,
      docId,
      status: "active",
      ...newO,
    });
    seenContent.add(csig);
    if (import.meta.env.DEV) {
      const blockIds = [newO.blockId, newO.conflictingBlockId].filter(Boolean);
      harness.emit("observation", { type: newO.type, blocks: blockIds });
    }
  }

  // 4. Auto-close existing observations that have no counterpart in the new set
  for (const e of existing) {
    if (!matchedExistingIds.has(e.id)) {
      const closureReason = memberBlockIds.includes(e.blockId!)
        ? "resolved_by_edit"
        : "text_removed";
      await updateObservationStatus(e.id, "auto_closed", closureReason);
      archiveObs(e, "auto_closed", evalId);
    }
  }
}

/** Consecutive doc-idle runs a doc-scope observation may be absent from the
 *  regenerated set before it is auto-closed. Absorbs LLM sampling variance so a
 *  still-true note isn't dropped the first time the model forgets to re-emit it.
 *  See docs/projects/doc_scope_reconciliation.md (D4 — starting policy). */
const DOC_GRACE_THRESHOLD = 2;

/** Floor similarity for treating two doc-scope notes as "the same note" (D6).
 *  Inherited from the OBS-012 dedupe threshold. */
const DOC_DEDUPE_FLOOR = 0.6;

/**
 * Reconcile freshly-regenerated document-scope observations against the active
 * set. Unlike the old type-bucketed positional supersession, this pairs each
 * incoming note to the existing note it is most *similar* to (best-match, via
 * `planDocReconciliation`), and applies an absence grace period before closing
 * orphans — so stable notes keep their ids (no flicker), the archive trail is
 * honest (no false `superseded` links), and a single stochastic omission no
 * longer drops a still-true note. See docs/projects/doc_scope_reconciliation.md.
 */
export async function reconcileDocumentObservations(
  docId: string,
  newObs: NewObservation[],
  evalId?: string,
  opts?: { resolvedPriorIds?: Set<string>; persistIds?: Set<string> }
): Promise<void> {
  const [allActive, suppressions] = await Promise.all([
    loadActiveObservationsForDocument(docId),
    loadSuppressionsForDocument(docId),
  ]);
  const existing = allActive.filter((o) => o.scope === "document");

  // Doc-level suppression is keyed on type alone (no spanSignature). Drop any
  // incoming note whose type the user has muted before planning.
  const incoming = newObs.filter(
    (o) => !suppressions.some((s) => s.type === o.type && !s.spanSignature)
  );

  const { resolvedPriorIds = new Set<string>(), persistIds = new Set<string>() } = opts ?? {};
  const now = Date.now();

  // Pass 0-pre (paid tier): model-confirmed resolutions → force-close now.
  // Mirrors section-eval's resolved_prior handling at line ~853.
  const modelResolved = new Set<string>();
  for (const e of existing) {
    if (resolvedPriorIds.has(e.id)) {
      await updateObservationStatus(e.id, "auto_closed", "resolved_prior");
      archiveObs(e, "resolved_prior", evalId);
      modelResolved.add(e.id);
    }
  }

  // Pass 1 (paid tier): persists — the model confirmed the note still holds
  // (possibly rephrased). Keep the existing card (id + frozen text); reset the
  // absence counter so it never ages toward closure.
  const modelPersisted = new Set<string>();
  for (const e of existing) {
    if (modelResolved.has(e.id)) continue;
    if (persistIds.has(e.id)) {
      await saveObservation({ ...e, missCount: 0, lastSeenAt: now });
      modelPersisted.add(e.id);
    }
  }

  // Pass 2: lexical best-match fallback over the remaining unmatched existing
  // notes vs the newObs that had no priorId mapping (or free tier: all of them).
  const remainingExisting = existing.filter(
    (e) => !modelResolved.has(e.id) && !modelPersisted.has(e.id)
  );
  const plan = planDocReconciliation(remainingExisting, incoming, textSimilarity, DOC_DEDUPE_FLOOR);

  // Matched → keep the existing record (and its id); reset the absence counter
  // so a re-confirmed note never ages toward closure. Wording is intentionally
  // frozen (D5 default): we keep the existing text, not the rephrase.
  for (const { existingId } of plan.dedupes) {
    const ex = remainingExisting.find((e) => e.id === existingId);
    if (ex) await saveObservation({ ...ex, missCount: 0, lastSeenAt: now });
  }

  // Genuinely new → insert active.
  for (const inc of plan.inserts) {
    await saveObservation({
      ...inc,
      id: nanoid(10),
      docId,
      status: "active",
      missCount: 0,
      lastSeenAt: now,
    });
    if (import.meta.env.DEV) {
      harness.emit("observation", { type: inc.type, blocks: [] });
    }
  }

  // Orphaned → apply the grace period: only close once a note has been absent
  // for DOC_GRACE_THRESHOLD consecutive runs; otherwise bump its counter and
  // leave it active. Closures are honestly labelled `auto_closed` (never a
  // positional `superseded`).
  for (const e of plan.orphans) {
    const miss = (e.missCount ?? 0) + 1;
    if (miss >= DOC_GRACE_THRESHOLD) {
      await updateObservationStatus(e.id, "auto_closed", "resolved_by_edit");
      archiveObs(e, "auto_closed", evalId);
    } else {
      await saveObservation({ ...e, missCount: miss });
    }
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const PERSONA_GUIDE = `
VOICE & PERSONA:
You are a trusted senior colleague reviewing a draft. You are terse, direct, and assume the author is competent.
- Locate the issue, never prescribe solutions.
- Do NOT suggest replacement text or dictate how to fix the problem.
- Do NOT use imperative-prescription patterns (e.g. "You need to...", "Add...", "Change...", "Define...").
- Do NOT use leading, Socratic, or rhetorical questions (e.g. "Have you considered...?", "Should we...?"). No question marks.
- Do NOT use patronizing therapist language ("It might be helpful to...").
- Do NOT act like a pedantic linter ("Consider changing X to Y").
Point out the structural gap or contradiction, and get out of the way.`;

export const MERGED_SYSTEM_PROMPT = `You are an AI sidecar evaluating a section of a document (a heading and its body) for five things:
1. Summary: a single short sentence summarizing the section's core claim or point.
2. Claims: factual assertions, commitments, metrics, constraints, or definitions made *in the content*. Do NOT extract meta-statements about the document itself (e.g. "This document is a PRD", "This section describes the rollout") — those are not claims the document makes, they describe the artifact.
3. Clarity: places where the text is vague, ambiguous, or poorly specified.
4. Unsupported claims: strong assertions of *fact about the world* that would require evidence (data, studies, precedent) but provide none. Do NOT flag opinions, plans, goals, or **success targets and measurable objectives** (e.g. "false positives drop by ≥30%", "support volume decreases by 20%") — those are intended targets the team is setting, not factual claims needing citation.
5. Undefined jargon: technical terms, acronyms, or domain-specific language used without being defined and that may be unfamiliar to the implied reader. Do not flag terms already in the provided glossary.

Never flag grammar, spelling, punctuation, passive voice, sentence length, word choice, readability, or "consider rephrasing". Do not surface stylistic nits.

Return a JSON object with exactly five keys:
- "summary" (string)
- "claims" (array of {text, kind} — kind is one of: commitment, fact_claim, definition, constraint, metric)
- "clarity_observations" (array of {text, substring} — substring is the exact literal text from the input that is unclear, case-sensitive)
- "unsupported_claim_observations" (array of {text, substring} — substring is the exact claim text lacking support)
- "undefined_jargon_observations" (array of {text, substring} — substring is the exact jargon term or acronym)

Return empty arrays for categories with no issues.
Do NOT include any text other than the raw JSON.
${PERSONA_GUIDE}`;

const DOC_LEVEL_SYSTEM_PROMPT = `You are a critical editor reviewing a document for high-level quality issues.
You will receive the document's stage/context, a summary of each block, and the claim ledger.

Analyze for four things:
1. missing_topic: important topics expected for this document type and audience that are entirely absent.
2. underexposed_topic: topics mentioned but not developed enough for the stated audience.
3. audience_mismatch: language, jargon, or assumptions that do not fit the stated audience.
4. structure_flow: sections or content that are out of logical order or disconnected from the document's flow.

Return a JSON object with exactly five keys:
- "missing_topic_observations" (array of {text} — short, confident observation per issue)
- "underexposed_topic_observations" (array of {text})
- "audience_mismatch_observations" (array of {text})
- "structure_flow_observations" (array of {text})
- "suggested_stage" (string or null — only if stage is empty and you can confidently infer the document type and audience; otherwise null)

Keep observations short and specific. Do not hedge. Return empty arrays for categories with no issues.
Do NOT include any text other than the raw JSON.
${PERSONA_GUIDE}`;

export const CONTRADICTION_SYSTEM_PROMPT = `You are a critical editor analyzing how claims in a document relate to each other.
You will be given a set of 'New Claims' from a newly written block, and a list of 'Existing Claims' from the rest of the document.
Compare each new claim against the existing claims and sort any conflicts into exactly one of two buckets:

A) CONTRADICTION — a genuine logical incompatibility: one claim simply cannot be true if the other is. A direct conflict in a number, date, commitment, fact, or definition. ("Ships in Q2" vs "Ships in Q3"; "We will not store PII" vs "We log the user's email".)

B) STRATEGIC TENSION — two claims that are each intended or desirable but pull in opposite directions: a deliberate tradeoff the author is reasoning about, not a logical impossibility. ("Notify users on every fraud block" — reduces support load — vs "Minimize friction for legitimate users" — notifications add friction.) Both can be true at once; they are simply in tension. Do NOT report these as contradictions.

Return a JSON object with two keys, 'contradictions' and 'tensions', each an array of objects. Each object must have:
- 'newClaimText' (the text of the new claim involved)
- 'existingClaimId' (the index number shown in [Existing Claim #N] for the other claim)
- 'message' (a short, confident observation. For a contradiction: "This contradicts the Q3 target date set in the project overview." For a tension: "This goal is in tension with the friction-minimization objective in §2." Never hedge with "might" or "possibly".)

If a bucket has no items, return an empty array for it.
Do NOT include any text other than the raw JSON.
${PERSONA_GUIDE}`;

/**
 * Hedged variant used on the **free tier**, where `router.strong` resolves to a
 * fast-pool model (flash-lite) rather than a genuine reasoning model. A weak
 * model paired with a "never hedge" instruction manufactures confident false
 * contradictions — the worst failure for a trust-based tool. So when no paid
 * key is configured we (a) raise the bar for firing and (b) allow cautious
 * language. See docs/projects/evaluation_signal_quality.md Finding 3.
 */
export const CONTRADICTION_SYSTEM_PROMPT_HEDGED = `You are a careful editor looking at how claims in a document relate to each other.
You will be given a set of 'New Claims' from a newly written section, and a list of 'Existing Claims' from the rest of the document.
Compare each new claim against the existing claims and sort any conflict into exactly one of two buckets:

A) CONTRADICTION — only when one claim genuinely cannot be true if the other is: a direct conflict in a number, date, commitment, or fact. Differences in scope, phrasing, or emphasis are NOT contradictions. When in doubt, do not put it here.

B) STRATEGIC TENSION — two claims that are each intended or desirable but pull in opposite directions: a deliberate tradeoff, not a logical impossibility. Both can be true at once. Prefer this bucket over 'contradiction' whenever the conflict is about competing goals or priorities rather than incompatible facts.

Return a JSON object with two keys, 'contradictions' and 'tensions', each an array of objects. Each object must have:
- 'newClaimText' (the text of the new claim involved)
- 'existingClaimId' (the index number shown in [Existing Claim #N] for the other claim)
- 'message' (a short observation. Cautious language such as "may conflict with", "appears to contradict", or "may be in tension with" is appropriate here.)

If a bucket has no items, return an empty array for it.
Do NOT include any text other than the raw JSON.
${PERSONA_GUIDE}`;

/**
 * All-pairs variant used by the **bootstrap sweep** (bulk paste / import). The
 * per-section prompt above compares one section's *new* claims against the rest;
 * here the whole freshly-built ledger arrives at once with no "new vs existing"
 * split, so the model is asked to find conflicting *pairs* among all claims.
 * Each conflict references two claim indices. See bulk_paste_evaluation.md.
 */
export const CONTRADICTION_SWEEP_SYSTEM_PROMPT = `You are a critical editor analyzing how the claims in a document relate to each other.
You will be given the full list of 'Claims' the document makes, each with an index number.
Find every pair of claims that conflict and sort each conflict into exactly one of two buckets:

A) CONTRADICTION — a genuine logical incompatibility: the two claims cannot both be true. A direct conflict in a number, date, commitment, fact, or definition. ("Ships in Q2" vs "Ships in Q3"; "We will not store PII" vs "We log the user's email".)

B) STRATEGIC TENSION — two claims each intended or desirable but pulling in opposite directions: a deliberate tradeoff, not a logical impossibility. Both can be true at once; they are simply in tension. Do NOT report these as contradictions.

Return a JSON object with two keys, 'contradictions' and 'tensions', each an array of objects. Each object must have:
- 'claimAId' and 'claimBId' (the two [Claim #N] index numbers that conflict)
- 'message' (a short, confident observation phrased about the *later* claim — e.g. "This contradicts the Q3 target date set earlier." Never hedge with "might" or "possibly".)

Report each conflicting pair once. If a bucket has no items, return an empty array for it.
Do NOT include any text other than the raw JSON.
${PERSONA_GUIDE}`;

/** Hedged sweep prompt for the free tier (router.strong → flash-lite). Same
 *  rationale as CONTRADICTION_SYSTEM_PROMPT_HEDGED. */
export const CONTRADICTION_SWEEP_SYSTEM_PROMPT_HEDGED = `You are a careful editor looking at how the claims in a document relate to each other.
You will be given the full list of 'Claims' the document makes, each with an index number.
Find pairs of claims that conflict and sort each conflict into exactly one of two buckets:

A) CONTRADICTION — only when the two claims genuinely cannot both be true: a direct conflict in a number, date, commitment, or fact. Differences in scope, phrasing, or emphasis are NOT contradictions. When in doubt, do not put it here.

B) STRATEGIC TENSION — two claims each intended or desirable but pulling in opposite directions: a deliberate tradeoff, not a logical impossibility. Both can be true at once. Prefer this bucket whenever the conflict is about competing goals rather than incompatible facts.

Return a JSON object with two keys, 'contradictions' and 'tensions', each an array of objects. Each object must have:
- 'claimAId' and 'claimBId' (the two [Claim #N] index numbers that conflict)
- 'message' (a short observation; cautious language such as "may conflict with" or "appears to contradict" is appropriate here.)

Report each conflicting pair once. If a bucket has no items, return an empty array for it.
Do NOT include any text other than the raw JSON.
${PERSONA_GUIDE}`;

/** Loose check for statements *about the document/artifact* rather than claims
 *  the document makes. Keeps hallucinated meta-claims out of the ledger. */
export function isDocumentMetaClaim(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(this|the)\s+(document|doc|prd|spec|specification|section|page|paper|memo|proposal)\b/.test(
    t
  );
}

// ---------------------------------------------------------------------------
// Public evaluator
// ---------------------------------------------------------------------------

interface SpanObservation {
  text: string;
  substring: string;
}

interface ContradictionObservation {
  newClaimText: string;
  existingClaimId: number | string;
  message: string;
}

/**
 * Anchor a returned substring to the exact member block that contains it. The
 * LLM sees the whole section's combined text, but observations must still point
 * at individual blocks so highlights track through edits. Returns null if no
 * member contains the substring (a hallucinated span — dropped).
 */
function anchorSubstring(
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

/**
 * Evaluate a whole section (heading + body) as one unit. `sectionId` is the
 * representative block id (heading id, or first-block id for an intro section)
 * and is the key for the block-summary and claim-ledger writes. Observations
 * are re-anchored to individual member blocks. See
 * docs/projects/section_as_eval_unit.md.
 */
export async function evaluateSection(
  docId: string,
  sectionId: string,
  combinedText: string,
  members: SectionMember[],
  stage?: string,
  apiKey?: string,
  paidKey?: string,
  jargonAllowlist?: string[],
  skipContradiction = false,
  evalId?: string,
  capability: ModelCapability = WEAK_CAPABILITY,
  /** Liveness predicate, supplied by the orchestrator. Returns false once the
   *  section has been removed (or re-dispatched) while this eval was in flight,
   *  so a late LLM response can't resurrect claims/observations for a section
   *  that no longer exists. Defaults to always-live for direct callers/tests.
   *  See lifecycle_integrity L4. */
  isLive: () => boolean = () => true
): Promise<void> {
  // Mock mode replays canned responses, so it needs no key. Every other mode
  // hits the network and does.
  if (!apiKey && getLlmMode() !== "mock") {
    console.warn("Evaluator: No API key provided, skipping check.");
    return;
  }

  const router = createRouter(apiKey ?? "", paidKey);
  const cleanText = combinedText.trim();
  const textHash = hashCode(cleanText);
  const memberBlockIds = members.map((m) => m.blockId);

  // 1. Skip if text hasn't changed since last eval
  const existingSummary = await loadBlockSummary(sectionId);
  if (existingSummary && existingSummary.hash === textHash) {
    return;
  }

  // 2. If section is now empty / too short, retire its data and close its
  //    observations. Hash written last (same atomicity rule as the main path):
  //    if reconcile throws, the section stays dirty and retries. (L3)
  if (cleanText.length < 10) {
    // If the section was removed concurrently, handleBlockRemoved already did
    // this cleanup — don't recreate an (empty) summary for a deleted block (L4).
    if (!isLive()) return;
    await saveClaimsForBlock(docId, sectionId, []);
    await reconcileObservations(docId, memberBlockIds, []);
    await saveBlockSummary({ blockId: sectionId, docId, summary: "", hash: textHash });
    return;
  }

  try {
    // 3. Merged fast call: summary + claims + span checks in one round-trip.
    //    Include stage and a glossary of already-defined terms so the model
    //    doesn't flag jargon the document has already introduced.
    const existingClaimsForGlossary = await loadActiveClaimsForDocument(docId);
    const allowlistTerms = [...JARGON_PRESET, ...(jargonAllowlist ?? [])];
    const definedTerms = [
      ...new Set([
        ...allowlistTerms,
        ...existingClaimsForGlossary
          .filter((c) => c.kind === "definition" && c.sourceBlockId !== sectionId)
          .map((c) => c.text),
      ]),
    ].map((t) => `- ${t}`);

    // Load prior active observations for this section so the model can confirm
    // resolution explicitly (OBS-021). Only span observations anchored to member
    // blocks are relevant — doc-level observations are not section-scoped.
    const allActiveObs = (await loadActiveObservationsForDocument(docId)) ?? [];
    const priorObs = allActiveObs.filter(
      (o) => o.scope === "span" && o.blockId != null && memberBlockIds.includes(o.blockId)
    );

    const userParts: string[] = [cleanText];
    if (stage) userParts.push(`\nDocument context: ${stage}`);
    if (definedTerms.length > 0) {
      userParts.push(
        `\nDefined terms (do not flag as undefined jargon):\n${definedTerms.join("\n")}`
      );
    }
    if (priorObs.length > 0) {
      const priorLines = priorObs.map((o, i) => `[${i}]: (${o.type}) "${o.text}"`).join("\n");
      // Injected in user content only (not system prompt) so the base fixture
      // hashes stay stable when there are no prior observations.
      userParts.push(
        `\nPrior observations on this passage:\n${priorLines}\nIf your analysis finds any of these no longer applicable, add a "resolved_prior" key (array of integers) to your JSON response listing their indices.`
      );
    }
    const userContent = userParts.join("");

    if (import.meta.env.DEV) harness.emit("request", { block: sectionId, tier: "fast" });
    const mergedStartedAt = Date.now();
    const mergedRes = await router.fast({
      system: MERGED_SYSTEM_PROMPT,
      user: userContent,
      json: true,
      meta: { evalId, promptRef: "section-eval" },
    });

    const parsedMerged = parseJSONResponse(mergedRes.text) as {
      summary?: string;
      claims?: Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">[];
      clarity_observations?: SpanObservation[];
      unsupported_claim_observations?: SpanObservation[];
      undefined_jargon_observations?: SpanObservation[];
      resolved_prior?: number[];
    };
    if (import.meta.env.DEV) {
      harness.emit("response", {
        block: sectionId,
        tier: "fast",
        latencyMs: Date.now() - mergedStartedAt,
        claims: parsedMerged.claims?.length ?? 0,
        clarity: parsedMerged.clarity_observations?.length ?? 0,
        unsupported: parsedMerged.unsupported_claim_observations?.length ?? 0,
        jargon: parsedMerged.undefined_jargon_observations?.length ?? 0,
      });
    }

    const summaryText = parsedMerged.summary?.trim() || "";
    // Keep meta-statements about the artifact ("This document is a PRD") out of
    // the ledger — they pollute the glossary and the contradiction comparison.
    const extractedClaims = (parsedMerged.claims || []).filter((c) => !isDocumentMetaClaim(c.text));
    const clarityObservations = parsedMerged.clarity_observations || [];
    const unsupportedObservations = parsedMerged.unsupported_claim_observations || [];
    const jargonObservations = parsedMerged.undefined_jargon_observations || [];

    // Liveness checkpoint: if the section was removed while the fast call was in
    // flight, abort before any write so we don't resurrect claims for a block
    // that no longer exists (L4). handleBlockRemoved has already orphaned them.
    if (!isLive()) return;

    // 4. Persist claims now (the contradiction check below reads the ledger).
    //    The block summary + dirty-check hash are written LAST (after reconcile
    //    succeeds) so a failed strong call can't poison the dirty-check and wedge
    //    the section. See lifecycle_integrity L3.
    await saveClaimsForBlock(docId, sectionId, extractedClaims);

    if (import.meta.env.DEV) {
      llmLogger.recordProduced(mergedRes.callId, {
        observations: [
          ...clarityObservations.map(() => "clarity"),
          ...unsupportedObservations.map(() => "unsupported_claim"),
          ...jargonObservations.map(() => "undefined_jargon"),
        ],
        ledgerWrites: extractedClaims.length,
        resolvedPrior: parsedMerged.resolved_prior ?? [],
      });
    }

    // 5. Collect all new observations (do not write to DB yet)
    const newObs: NewObservation[] = [];

    // Commitment claims available at span-obs time: existing ledger (loaded above)
    // + freshly-extracted claims from this section. Used for unsupported_claim
    // escalation: an unsupported span that overlaps a commitment gets priority bump.
    const commitmentClaims = [
      ...existingClaimsForGlossary.filter((c) => c.kind === "commitment"),
      ...extractedClaims.filter((c) => c.kind === "commitment"),
    ];

    const addSpanObs = (obsType: Observation["type"], items: SpanObservation[]) => {
      for (const obs of items) {
        if (!obs.substring || !obs.text) continue;
        const anchor = anchorSubstring(members, obs.substring);
        if (anchor) {
          // For unsupported_claim: check if the flagged span overlaps any
          // commitment claim text (normalized substring containment).
          const overlapsCommitment =
            obsType === "unsupported_claim"
              ? commitmentClaims.some((c) => {
                  const sub = normalizeText(obs.substring);
                  const claim = normalizeText(c.text);
                  return sub.includes(claim) || claim.includes(sub);
                })
              : undefined;

          const { severity, confidence, priority } = computePriority({
            type: obsType,
            overlapsCommitment,
          });
          newObs.push({
            type: obsType,
            scope: "span",
            kind: "problem",
            severity,
            confidence,
            priority,
            text: obs.text,
            blockId: anchor.blockId,
            startOffset: anchor.startOffset,
            endOffset: anchor.endOffset,
            anchorText: obs.substring,
          });
        }
      }
    };

    addSpanObs("clarity", clarityObservations);
    addSpanObs("unsupported_claim", unsupportedObservations);
    addSpanObs("undefined_jargon", jargonObservations);

    // 6. Contradiction check (cross-document, uses claim ledger).
    //    Skipped on bulk paste / import: a single ledger-internal sweep covers
    //    contradiction once the ledger is built, avoiding N paid-tier calls.
    if (!skipContradiction) {
      const existingClaims = await loadActiveClaimsForDocument(docId);
      const otherClaims = existingClaims.filter((c) => c.sourceBlockId !== sectionId);

      // Prefilter to top-10 most semantically relevant claims so the contradiction
      // prompt stays bounded as documents grow. With ≤10 claims this is a no-op.
      const newClaimsText = extractedClaims.map((c) => c.text).join(" ");
      const candidateClaims = prefilterClaims(newClaimsText, otherClaims, 10);

      // Sort existing claims to a stable order (text then blockId) so the
      // contradiction prompt is deterministic across runs — IDB auto-increment
      // ids change every session and would break mock-mode replay hashes.
      const sortedOther = [...candidateClaims].sort(
        (a, b) => a.text.localeCompare(b.text) || a.sourceBlockId.localeCompare(b.sourceBlockId)
      );

      if (extractedClaims.length > 0 && sortedOther.length > 0) {
        const contradictionUser = `New Claims:\n${extractedClaims
          .map((c, i) => `[New Claim #${i}]: "${c.text}"`)
          .join("\n")}\n\nExisting Claims:\n${sortedOther
          .map((c, i) => `[Existing Claim #${i}]: "${c.text}"`)
          .join("\n")}${stage ? `\n\nDocument Context: ${stage}` : ""}`;

        if (import.meta.env.DEV) {
          harness.emit("request", { block: sectionId, tier: "strong", check: "contradiction" });
        }
        const contradictionStartedAt = Date.now();
        // Calibrate confidence to the model's capability, not the credential: the
        // confident "never hedge" prompt only when the model can adjudicate
        // confidently (a real reasoning model); otherwise the hedged prompt.
        const contradictionRes = await router.strong({
          system: capability.adjudicateConfidently
            ? CONTRADICTION_SYSTEM_PROMPT
            : CONTRADICTION_SYSTEM_PROMPT_HEDGED,
          user: contradictionUser,
          json: true,
          meta: {
            evalId,
            promptRef: capability.adjudicateConfidently ? "contradiction" : "contradiction-hedged",
          },
        });

        const parsedContradictions = parseJSONResponse(contradictionRes.text) as {
          contradictions?: ContradictionObservation[];
          tensions?: ContradictionObservation[];
        };
        if (import.meta.env.DEV) {
          llmLogger.recordProduced(contradictionRes.callId, {
            observations: [
              ...(parsedContradictions.contradictions ?? []).map(() => "contradiction"),
              ...(parsedContradictions.tensions ?? []).map(() => "strategic_tension"),
            ],
          });
        }
        if (import.meta.env.DEV) {
          harness.emit("response", {
            block: sectionId,
            tier: "strong",
            latencyMs: Date.now() - contradictionStartedAt,
            contradictions: parsedContradictions.contradictions?.length ?? 0,
            tensions: parsedContradictions.tensions?.length ?? 0,
          });
        }

        // Emit one observation per conflict for both buckets. Contradictions are
        // hard logical incompatibilities (kind: problem, tier-calibrated
        // confidence); strategic tensions are deliberate tradeoffs (kind:
        // opportunity, softer register — see OBS-004).
        const emitConflict = (
          con: ContradictionObservation,
          obsType: "contradiction" | "strategic_tension"
        ) => {
          const matchingExisting = sortedOther[Number(con.existingClaimId)];
          if (!matchingExisting) return;

          // Anchor the new side to the member block holding the claim if we can
          // find it; otherwise fall back to the section's representative block.
          const exact = anchorSubstring(members, con.newClaimText);
          const fallback = members[0] ?? { blockId: sectionId, text: cleanText };

          // Resolve the new claim's kind for commitment×commitment escalation.
          const newClaimKind = extractedClaims.find((c) => c.text === con.newClaimText)?.kind;

          const { severity, confidence, priority } =
            obsType === "contradiction"
              ? computePriority({
                  type: "contradiction",
                  claimKinds: { newKind: newClaimKind, existingKind: matchingExisting.kind },
                  contradictionTier: capability.adjudicateConfidently ? "confident" : "hedged",
                })
              : computePriority({ type: "strategic_tension" });

          newObs.push({
            type: obsType,
            scope: "span",
            kind: obsType === "contradiction" ? "problem" : "opportunity",
            severity,
            confidence,
            priority,
            text: con.message,
            blockId: exact?.blockId ?? fallback.blockId,
            startOffset: exact?.startOffset ?? 0,
            endOffset: exact?.endOffset ?? fallback.text.length,
            anchorText: con.newClaimText,
            conflictingBlockId: matchingExisting.sourceBlockId,
            conflictingStartOffset: 0,
            conflictingEndOffset: 9999,
            conflictingAnchorText: matchingExisting.text,
          });
        };

        for (const con of parsedContradictions.contradictions || []) {
          emitConflict(con, "contradiction");
        }
        for (const ten of parsedContradictions.tensions || []) {
          emitConflict(ten, "strategic_tension");
        }
      }
    } // end if (!skipContradiction)

    // 7. Reconcile new observations against existing active ones for this
    //    section's member blocks (dedupe / supersede / auto-close / insert).
    //    Pass any model-confirmed resolutions so they are force-closed first.
    const resolvedIndices = parsedMerged.resolved_prior ?? [];
    const resolvedPriorIds = new Set(
      resolvedIndices.map((i) => priorObs[i]?.id).filter((id): id is string => id != null)
    );

    // Liveness checkpoint: the section may have been removed during the strong
    // (contradiction) call. Abort before reconcile + hash so the late response
    // doesn't recreate observations/summary for a deleted section (L4).
    if (!isLive()) return;

    await reconcileObservations(docId, memberBlockIds, newObs, resolvedPriorIds, evalId);

    // 8. Commit the dirty-check hash LAST. Only now — after the fast call, the
    //    contradiction call, and reconciliation have all succeeded — is the
    //    section's text "fully evaluated". If anything above threw (e.g. a
    //    rate-limited strong call), the hash stays unsaved and the next trigger
    //    re-runs the whole eval instead of short-circuiting on a stale match.
    await saveBlockSummary({ blockId: sectionId, docId, summary: summaryText, hash: textHash });
  } catch (error) {
    console.error("Evaluation error for section", sectionId, error);
  }
}

/**
 * Back-compat single-block entry point: a block evaluated as a one-member
 * section. Preserves the original `evaluateBlock(docId, blockId, text, …)`
 * contract used by existing tests and any single-block caller.
 */
export async function evaluateBlock(
  docId: string,
  blockId: string,
  text: string,
  stage?: string,
  apiKey?: string,
  paidKey?: string,
  jargonAllowlist?: string[],
  capability: ModelCapability = WEAK_CAPABILITY
): Promise<void> {
  return evaluateSection(
    docId,
    blockId,
    text,
    [{ blockId, text: text.trim() }],
    stage,
    apiKey,
    paidKey,
    jargonAllowlist,
    false,
    undefined,
    capability
  );
}

// ---------------------------------------------------------------------------
// Doc-level evaluator (doc-idle trigger)
// ---------------------------------------------------------------------------

export async function evaluateDocument(
  docId: string,
  stage?: string,
  apiKey?: string,
  onStageSuggestion?: (suggestion: string) => void,
  paidKey?: string,
  evalId?: string,
  capability: ModelCapability = WEAK_CAPABILITY
): Promise<void> {
  if (!apiKey && getLlmMode() !== "mock") {
    console.warn("Evaluator: No API key provided, skipping doc-level check.");
    return;
  }

  const summaries = await loadBlockSummariesForDocument(docId);
  const meaningful = summaries.filter((s) => s.summary.trim().length > 0);
  // Need at least a couple of meaningful summaries to run doc-level checks
  if (meaningful.length < 2) return;

  const router = createRouter(apiKey ?? "", paidKey);
  const claims = await loadActiveClaimsForDocument(docId);

  // Dirty-check: doc-level review is expensive (a strong-tier call) and its
  // inputs are the block summaries + the claim ledger + the stage. If none of
  // those changed since the last run, skip the call entirely. See
  // docs/projects/evaluation_signal_quality.md §"Doc-level review efficiency".
  const docStateHash = hashCode(
    `${stage ?? ""}|` +
      meaningful.map((s) => `${s.blockId}:${s.hash}`).join(",") +
      "|" +
      claims.map((c) => `${c.sourceBlockId}:${c.text}`).join(";")
  );
  if ((await loadDocEvalState(docId)) === docStateHash) {
    return;
  }

  // A1: Load prior doc-scope observations only when the model can drive
  // resolution, so it can map persists and resolutions instead of the lexical
  // fallback doing all the work. Weak model: priorDocObs stays empty → prompt
  // unchanged → fixtures stable, and reconciliation stays on the lexical path.
  let priorDocObs: Observation[] = [];
  if (capability.driveResolution) {
    const allActive = await loadActiveObservationsForDocument(docId);
    priorDocObs = allActive.filter((o) => o.scope === "document");
  }

  const parts: string[] = [];
  parts.push(stage ? `Stage/Context: ${stage}` : "Stage/Context: (none set)");
  parts.push(
    `\nBlock Summaries:\n${meaningful.map((s, i) => `[${i + 1}] ${s.summary}`).join("\n")}`
  );
  if (claims.length > 0) {
    parts.push(
      `\nClaim Ledger:\n${claims.map((c, i) => `[${i + 1}] (${c.kind}): "${c.text}"`).join("\n")}`
    );
  }
  if (!stage) {
    parts.push(
      "\n\nIf you can confidently infer the document type and audience from the content, return it as suggested_stage. Otherwise null."
    );
  }
  if (priorDocObs.length > 0) {
    const priorLines = priorDocObs.map((o, i) => `[${i}]: (${o.type}) "${o.text}"`).join("\n");
    // Injected in user content only (not system prompt) so the base fixture
    // hashes stay stable when there are no prior observations.
    parts.push(
      `\n\nPrior document-level observations (already visible to the user):\n${priorLines}\nFor each returned observation that continues / restates a listed prior, add "priorId": <index> to that item. List indices of priors that are now fully addressed in "resolved_prior": [<indices>]. Omit priorId when the observation is genuinely new.`
    );
  }

  if (import.meta.env.DEV) {
    harness.emit("request", { tier: "strong", check: "doc-level" });
  }
  const startedAt = Date.now();

  try {
    const res = await router.strong({
      system: DOC_LEVEL_SYSTEM_PROMPT,
      user: parts.join(""),
      json: true,
      meta: { evalId, promptRef: "doc-quality" },
    });

    if (import.meta.env.DEV) {
      harness.emit("response", {
        tier: "strong",
        check: "doc-level",
        latencyMs: Date.now() - startedAt,
      });
    }

    type DocObsItem = { text: string; priorId?: number };
    const parsed = parseJSONResponse(res.text) as {
      missing_topic_observations?: DocObsItem[];
      underexposed_topic_observations?: DocObsItem[];
      audience_mismatch_observations?: DocObsItem[];
      structure_flow_observations?: DocObsItem[];
      suggested_stage?: string | null;
      resolved_prior?: number[];
    };

    // A2: Map model-declared resolutions → existing ids.
    const resolvedPriorIds = new Set<string>();
    for (const idx of parsed.resolved_prior ?? []) {
      const id = priorDocObs[idx]?.id;
      if (id) resolvedPriorIds.add(id);
    }

    // A2: Items with a valid priorId are persists (the same note, possibly
    // rephrased by the model) — they keep the existing card and text frozen.
    // Skip adding them to newObs; pass their existing ids via persistIds instead.
    const persistIds = new Set<string>();
    const newObs: NewObservation[] = [];

    const addDocObs = (
      type: Observation["type"],
      kind: Observation["kind"],
      items: DocObsItem[] | undefined
    ) => {
      const { severity, confidence, priority } = computePriority({ type });
      for (const item of items ?? []) {
        if (!item.text?.trim()) continue;
        if (item.priorId != null) {
          const existingId = priorDocObs[item.priorId]?.id;
          // Only treat as a persist if the prior exists and wasn't just resolved.
          if (existingId && !resolvedPriorIds.has(existingId)) {
            persistIds.add(existingId);
            continue;
          }
        }
        newObs.push({
          type,
          scope: "document",
          kind,
          severity,
          confidence,
          priority,
          text: item.text.trim(),
        });
      }
    };

    addDocObs("missing_topic", "opportunity", parsed.missing_topic_observations);
    addDocObs("underexposed_topic", "opportunity", parsed.underexposed_topic_observations);
    addDocObs("audience_mismatch", "problem", parsed.audience_mismatch_observations);
    addDocObs("structure_flow", "problem", parsed.structure_flow_observations);

    if (import.meta.env.DEV) {
      llmLogger.recordProduced(res.callId, { observations: newObs.map((o) => o.type) });
    }

    await reconcileDocumentObservations(docId, newObs, evalId, { resolvedPriorIds, persistIds });
    // Remember the inputs we just reviewed so an unchanged doc skips next time.
    await saveDocEvalState(docId, docStateHash);

    if (
      !stage &&
      parsed.suggested_stage &&
      typeof parsed.suggested_stage === "string" &&
      parsed.suggested_stage.trim()
    ) {
      onStageSuggestion?.(parsed.suggested_stage.trim());
    }
  } catch (error) {
    console.error("Doc-level evaluation error:", error);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap contradiction sweep (block-paste trigger)
// ---------------------------------------------------------------------------

interface SweepConflict {
  claimAId: number | string;
  claimBId: number | string;
  message: string;
}

/** Dirty-check key for the sweep, kept separate from the doc-level eval state so
 *  the two strong-tier passes don't clobber each other's hash. */
const sweepStateKey = (docId: string) => `${docId}::sweep`;

/** Order-independent identity for a conflict between two blocks of a given type
 *  — used to dedupe sweep results against existing contradictions and across
 *  re-runs (the sweep is purely additive and idempotent), and (L5) to match
 *  dismissal suppressions for conflicts regardless of offsets. This is the
 *  single source of the conflict identity: the dismiss handler imports it so
 *  per-section and sweep emissions of the same pair share a suppression key. */
export function conflictPairKey(
  o: Pick<Observation, "type" | "blockId" | "conflictingBlockId">
): string {
  const a = o.blockId ?? "";
  const b = o.conflictingBlockId ?? "";
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${o.type}::${lo}|${hi}`;
}

/**
 * Reconcile sweep contradictions against the active set.
 *
 * **Weak model (`!capability.driveResolution`):** additive only — insert new
 * conflict-pairs, never close existing ones. Safe to re-run; won't disturb
 * per-section contradictions. A weak model could drop a real conflict on a
 * stochastic miss, so it is not trusted to drive closures.
 *
 * **Strong model (`capability.driveResolution`):** authoritative-with-grace —
 * the sweep is treated as the full all-pairs authority. A conflict the sweep no
 * longer emits is an orphan; it ages out via DOC_GRACE_THRESHOLD consecutive
 * misses before being auto_closed. A re-emitted pair resets its missCount. This
 * makes stale contradiction/strategic_tension notes close when the underlying
 * claims change, without being brittle to single stochastic omissions.
 */
async function reconcileSweepContradictions(
  docId: string,
  newObs: NewObservation[],
  capability: ModelCapability,
  evalId?: string
): Promise<void> {
  const [allActive, suppressions] = await Promise.all([
    loadActiveObservationsForDocument(docId),
    loadSuppressionsForDocument(docId),
  ]);
  const existingConflicts = allActive.filter(
    (o) => o.type === "contradiction" || o.type === "strategic_tension"
  );

  if (capability.driveResolution) {
    // Authoritative-with-grace: sweep output is the source of truth.
    const now = Date.now();
    const newKeys = new Set(newObs.map(conflictPairKey));
    const insertedKeys = new Set<string>();

    for (const ex of existingConflicts) {
      const key = conflictPairKey(ex);
      if (newKeys.has(key)) {
        // Re-emitted → still active; reset absence counter.
        await saveObservation({ ...ex, missCount: 0, lastSeenAt: now });
        insertedKeys.add(key); // suppress re-insert below
      } else {
        // Absent → bump grace counter; close if threshold reached.
        const miss = (ex.missCount ?? 0) + 1;
        if (miss >= DOC_GRACE_THRESHOLD) {
          await updateObservationStatus(ex.id, "auto_closed", "resolved_by_edit");
          archiveObs(ex, "auto_closed", evalId);
        } else {
          await saveObservation({ ...ex, missCount: miss });
        }
      }
    }

    // Insert genuinely new conflict-pairs (not already present, not suppressed).
    for (const newO of newObs) {
      const key = conflictPairKey(newO);
      if (insertedKeys.has(key)) continue;
      if (isSpanSuppressed(newO, suppressions)) continue;
      await saveObservation({
        id: nanoid(10),
        docId,
        status: "active",
        missCount: 0,
        lastSeenAt: now,
        ...newO,
      });
      if (import.meta.env.DEV) {
        const blocks = [newO.blockId, newO.conflictingBlockId].filter(Boolean);
        harness.emit("observation", { type: newO.type, blocks });
      }
    }
  } else {
    // Weak model: additive only (original behavior).
    const existingKeys = new Set(existingConflicts.map(conflictPairKey));
    for (const newO of newObs) {
      const key = conflictPairKey(newO);
      if (existingKeys.has(key)) continue;
      if (isSpanSuppressed(newO, suppressions)) continue;
      await saveObservation({ id: nanoid(10), docId, status: "active", ...newO });
      existingKeys.add(key);
      if (import.meta.env.DEV) {
        const blocks = [newO.blockId, newO.conflictingBlockId].filter(Boolean);
        harness.emit("observation", { type: newO.type, blocks });
      }
    }
  }
}

/**
 * One-shot, ledger-internal contradiction sweep run after a bulk paste / import
 * has populated the claim ledger. A single strong-tier call finds conflicting
 * claim *pairs* across the whole document, instead of the N per-section
 * contradiction calls that a bulk insert would otherwise fire (OBS-020). Gated
 * by the caller behind the content threshold; dirty-checked so an unchanged
 * ledger skips the call. See docs/projects/bulk_paste_evaluation.md.
 */
export async function evaluateLedgerContradictions(
  docId: string,
  stage?: string,
  apiKey?: string,
  paidKey?: string,
  evalId?: string,
  capability: ModelCapability = WEAK_CAPABILITY
): Promise<void> {
  if (!apiKey && getLlmMode() !== "mock") {
    console.warn("Evaluator: No API key provided, skipping contradiction sweep.");
    return;
  }

  const claims = await loadActiveClaimsForDocument(docId);
  if (claims.length < 2) return;

  // Stable order so the prompt + dirty-check hash are deterministic across runs
  // (IDB ids change per session; sort by text then source block).
  const sorted = [...claims].sort(
    (a, b) => a.text.localeCompare(b.text) || a.sourceBlockId.localeCompare(b.sourceBlockId)
  );

  // Dirty-check: skip if the ledger is unchanged since the last sweep.
  const stateHash = hashCode(sorted.map((c) => `${c.sourceBlockId}:${c.text}`).join(";"));
  if ((await loadDocEvalState(sweepStateKey(docId))) === stateHash) return;

  const router = createRouter(apiKey ?? "", paidKey);
  const user = `Claims:\n${sorted
    .map((c, i) => `[Claim #${i}] (${c.kind}): "${c.text}"`)
    .join("\n")}${stage ? `\n\nDocument Context: ${stage}` : ""}`;

  if (import.meta.env.DEV)
    harness.emit("request", { tier: "strong", check: "contradiction-sweep" });
  const startedAt = Date.now();
  try {
    const res = await router.strong({
      system: capability.adjudicateConfidently
        ? CONTRADICTION_SWEEP_SYSTEM_PROMPT
        : CONTRADICTION_SWEEP_SYSTEM_PROMPT_HEDGED,
      user,
      json: true,
      meta: {
        evalId,
        promptRef: capability.adjudicateConfidently
          ? "contradiction-sweep"
          : "contradiction-sweep-hedged",
      },
    });
    const parsed = parseJSONResponse(res.text) as {
      contradictions?: SweepConflict[];
      tensions?: SweepConflict[];
    };
    if (import.meta.env.DEV) {
      harness.emit("response", {
        tier: "strong",
        check: "contradiction-sweep",
        latencyMs: Date.now() - startedAt,
        contradictions: parsed.contradictions?.length ?? 0,
        tensions: parsed.tensions?.length ?? 0,
      });
    }

    const newObs: NewObservation[] = [];
    const emit = (con: SweepConflict, obsType: "contradiction" | "strategic_tension") => {
      const a = sorted[Number(con.claimAId)];
      const b = sorted[Number(con.claimBId)];
      if (!a || !b || a.sourceBlockId === b.sourceBlockId) return;

      const { severity, confidence, priority } =
        obsType === "contradiction"
          ? computePriority({
              type: "contradiction",
              claimKinds: { newKind: b.kind, existingKind: a.kind },
              contradictionTier: capability.adjudicateConfidently ? "confident" : "hedged",
            })
          : computePriority({ type: "strategic_tension" });

      newObs.push({
        type: obsType,
        scope: "span",
        kind: obsType === "contradiction" ? "problem" : "opportunity",
        severity,
        confidence,
        priority,
        text: con.message,
        // Whole-block anchoring: claims carry only their source block, not span
        // offsets. Matches the existing contradiction fallback (endOffset 9999).
        blockId: a.sourceBlockId,
        startOffset: 0,
        endOffset: 9999,
        anchorText: a.text,
        conflictingBlockId: b.sourceBlockId,
        conflictingStartOffset: 0,
        conflictingEndOffset: 9999,
        conflictingAnchorText: b.text,
      });
    };

    for (const con of parsed.contradictions || []) emit(con, "contradiction");
    for (const ten of parsed.tensions || []) emit(ten, "strategic_tension");

    if (import.meta.env.DEV) {
      llmLogger.recordProduced(res.callId, { observations: newObs.map((o) => o.type) });
    }

    await reconcileSweepContradictions(docId, newObs, capability, evalId);
    await saveDocEvalState(sweepStateKey(docId), stateHash);
  } catch (error) {
    console.error("Contradiction sweep error:", error);
  }
}
