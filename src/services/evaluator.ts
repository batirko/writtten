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
import type { SectionMember } from "./types";

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
      } catch { /* fallback */ }
    }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch { /* fallback */ }
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
  return `${obs.type}:${obs.blockId ?? "doc"}:${normalizeText(obs.text).slice(0, 60)}`;
}

function spansOverlap(
  a: { startOffset?: number; endOffset?: number },
  b: { startOffset?: number; endOffset?: number },
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
function isSpanSuppressed(
  newO: NewObservation,
  suppressions: DismissalSuppression[],
): boolean {
  const spanKey = newO.blockId != null
    ? `${newO.blockId}:${newO.startOffset ?? ""}:${newO.endOffset ?? ""}`
    : undefined;
  return suppressions.some((s) => {
    if (s.type !== newO.type) return false;
    if (s.spanSignature) return s.spanSignature === spanKey;
    // doc-level suppression (no spanSignature) should not affect span obs
    return false;
  });
}

async function reconcileObservations(
  docId: string,
  memberBlockIds: string[],
  newObs: NewObservation[],
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

  for (const newO of newObs) {
    // Suppression check — never re-insert a dismissed span
    if (isSpanSuppressed(newO, suppressions)) continue;

    const csig = contentSig(newO);
    // Already kept/inserted an equivalent observation in this batch → drop dupe.
    if (seenContent.has(csig)) continue;

    // 0. Content match against an existing active obs → dedupe: keep it as-is
    //    even if its offsets drifted slightly. Prevents duplicate cards.
    const contentMatch = existing.find(
      (e) => !matchedExistingIds.has(e.id) && contentSig(e) === csig,
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
        !matchedExistingIds.has(e.id),
    );
    if (exactMatch) {
      matchedExistingIds.add(exactMatch.id);
      seenContent.add(csig);
      continue;
    }

    // 2. Same type + overlapping span, different text → supersede old, insert new
    const supersedable = existing.find(
      (e) =>
        e.type === newO.type &&
        spansOverlap(e, newO) &&
        !matchedExistingIds.has(e.id),
    );
    if (supersedable) {
      await updateObservationStatus(supersedable.id, "superseded");
      matchedExistingIds.add(supersedable.id);
    }

    // 3. Insert new observation
    await saveObservation({
      id: nanoid(10),
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
      await updateObservationStatus(e.id, "auto_closed");
    }
  }
}

async function reconcileDocumentObservations(
  docId: string,
  newObs: NewObservation[],
): Promise<void> {
  const [allActive, suppressions] = await Promise.all([
    loadActiveObservationsForDocument(docId),
    loadSuppressionsForDocument(docId),
  ]);
  const existing = allActive.filter((o) => o.scope === "document");
  const matchedExistingIds = new Set<string>();

  for (const newO of newObs) {
    // Doc-level suppression: keyed on type alone (no spanSignature)
    const suppressed = suppressions.some(
      (s) => s.type === newO.type && !s.spanSignature,
    );
    if (suppressed) continue;

    // Exact match → dedupe
    const exactMatch = existing.find(
      (e) =>
        e.type === newO.type &&
        normalizeText(e.text) === normalizeText(newO.text) &&
        !matchedExistingIds.has(e.id),
    );
    if (exactMatch) {
      matchedExistingIds.add(exactMatch.id);
      continue;
    }

    // Same type, different text → supersede
    const supersedable = existing.find(
      (e) => e.type === newO.type && !matchedExistingIds.has(e.id),
    );
    if (supersedable) {
      await updateObservationStatus(supersedable.id, "superseded");
      matchedExistingIds.add(supersedable.id);
    }

    await saveObservation({
      id: nanoid(10),
      docId,
      status: "active",
      ...newO,
    });
    if (import.meta.env.DEV) {
      harness.emit("observation", { type: newO.type, blocks: [] });
    }
  }

  // Auto-close orphaned doc-level observations
  for (const e of existing) {
    if (!matchedExistingIds.has(e.id)) {
      await updateObservationStatus(e.id, "auto_closed");
    }
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const MERGED_SYSTEM_PROMPT = `You are an AI sidecar evaluating a section of a document (a heading and its body) for five things:
1. Summary: a single short sentence summarizing the section's core claim or point.
2. Claims: factual assertions, commitments, metrics, constraints, or definitions made *in the content*. Do NOT extract meta-statements about the document itself (e.g. "This document is a PRD", "This section describes the rollout") — those are not claims the document makes, they describe the artifact.
3. Clarity: places where the text is vague, ambiguous, or poorly specified.
4. Unsupported claims: strong assertions of *fact about the world* that would require evidence (data, studies, precedent) but provide none. Do NOT flag opinions, plans, goals, or **success targets and measurable objectives** (e.g. "false positives drop by ≥30%", "support volume decreases by 20%") — those are intended targets the team is setting, not factual claims needing citation.
5. Undefined jargon: technical terms, acronyms, or domain-specific language used without being defined and that may be unfamiliar to the implied reader. Do not flag terms already in the provided glossary.

Return a JSON object with exactly five keys:
- "summary" (string)
- "claims" (array of {text, kind} — kind is one of: commitment, fact_claim, definition, constraint, metric)
- "clarity_observations" (array of {text, substring} — substring is the exact literal text from the input that is unclear, case-sensitive)
- "unsupported_claim_observations" (array of {text, substring} — substring is the exact claim text lacking support)
- "undefined_jargon_observations" (array of {text, substring} — substring is the exact jargon term or acronym)

Return empty arrays for categories with no issues.
Do NOT include any text other than the raw JSON.`;

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
Do NOT include any text other than the raw JSON.`;

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
Do NOT include any text other than the raw JSON.`;

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
Do NOT include any text other than the raw JSON.`;

/** Loose check for statements *about the document/artifact* rather than claims
 *  the document makes. Keeps hallucinated meta-claims out of the ledger. */
export function isDocumentMetaClaim(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(this|the)\s+(document|doc|prd|spec|specification|section|page|paper|memo|proposal)\b/.test(
    t,
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
  substring: string,
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

  // 2. If section is now empty / too short, retire its data and close its observations
  if (cleanText.length < 10) {
    await saveBlockSummary({ blockId: sectionId, docId, summary: "", hash: textHash });
    await saveClaimsForBlock(docId, sectionId, []);
    await reconcileObservations(docId, memberBlockIds, []);
    return;
  }

  try {
    // 3. Merged fast call: summary + claims + span checks in one round-trip.
    //    Include stage and a glossary of already-defined terms so the model
    //    doesn't flag jargon the document has already introduced.
    const existingClaimsForGlossary = await loadActiveClaimsForDocument(docId);
    const allowlistTerms = [
      ...JARGON_PRESET,
      ...(jargonAllowlist ?? []),
    ];
    const definedTerms = [
      ...new Set([
        ...allowlistTerms,
        ...existingClaimsForGlossary
          .filter((c) => c.kind === "definition" && c.sourceBlockId !== sectionId)
          .map((c) => c.text),
      ]),
    ].map((t) => `- ${t}`);

    const userParts: string[] = [cleanText];
    if (stage) userParts.push(`\nDocument context: ${stage}`);
    if (definedTerms.length > 0) {
      userParts.push(`\nDefined terms (do not flag as undefined jargon):\n${definedTerms.join("\n")}`);
    }
    const userContent = userParts.join("");

    if (import.meta.env.DEV) harness.emit("request", { block: sectionId, tier: "fast" });
    const mergedStartedAt = Date.now();
    const mergedRes = await router.fast({
      system: MERGED_SYSTEM_PROMPT,
      user: userContent,
      json: true,
    });

    const parsedMerged = parseJSONResponse(mergedRes.text) as {
      summary?: string;
      claims?: Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">[];
      clarity_observations?: SpanObservation[];
      unsupported_claim_observations?: SpanObservation[];
      undefined_jargon_observations?: SpanObservation[];
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
    const extractedClaims = (parsedMerged.claims || []).filter(
      (c) => !isDocumentMetaClaim(c.text),
    );
    const clarityObservations = parsedMerged.clarity_observations || [];
    const unsupportedObservations = parsedMerged.unsupported_claim_observations || [];
    const jargonObservations = parsedMerged.undefined_jargon_observations || [];

    // 4. Persist summary and claims first — observations may reference ledger IDs
    await saveBlockSummary({ blockId: sectionId, docId, summary: summaryText, hash: textHash });
    await saveClaimsForBlock(docId, sectionId, extractedClaims);

    // 5. Collect all new observations (do not write to DB yet)
    const newObs: NewObservation[] = [];

    // Commitment claims available at span-obs time: existing ledger (loaded above)
    // + freshly-extracted claims from this section. Used for unsupported_claim
    // escalation: an unsupported span that overlaps a commitment gets priority bump.
    const commitmentClaims = [
      ...existingClaimsForGlossary.filter((c) => c.kind === "commitment"),
      ...extractedClaims.filter((c) => c.kind === "commitment"),
    ];

    const addSpanObs = (
      obsType: Observation["type"],
      items: SpanObservation[],
    ) => {
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
          });
        }
      }
    };

    addSpanObs("clarity", clarityObservations);
    addSpanObs("unsupported_claim", unsupportedObservations);
    addSpanObs("undefined_jargon", jargonObservations);

    // 6. Contradiction check (cross-document, uses claim ledger)
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
      (a, b) => a.text.localeCompare(b.text) || a.sourceBlockId.localeCompare(b.sourceBlockId),
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
      // Calibrate confidence to the tier actually running the check: the
      // confident "never hedge" prompt only when a paid key routes to a real
      // reasoning model; otherwise the hedged prompt (free tier → flash-lite).
      const contradictionRes = await router.strong({
        system: paidKey ? CONTRADICTION_SYSTEM_PROMPT : CONTRADICTION_SYSTEM_PROMPT_HEDGED,
        user: contradictionUser,
        json: true,
      });

      const parsedContradictions = parseJSONResponse(contradictionRes.text) as {
        contradictions?: ContradictionObservation[];
        tensions?: ContradictionObservation[];
      };
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
        obsType: "contradiction" | "strategic_tension",
      ) => {
        const matchingExisting = sortedOther[Number(con.existingClaimId)];
        if (!matchingExisting) return;

        // Anchor the new side to the member block holding the claim if we can
        // find it; otherwise fall back to the section's representative block.
        const exact = anchorSubstring(members, con.newClaimText);
        const fallback = members[0] ?? { blockId: sectionId, text: cleanText };

        // Resolve the new claim's kind for commitment×commitment escalation.
        const newClaimKind = extractedClaims.find(
          (c) => c.text === con.newClaimText,
        )?.kind;

        const { severity, confidence, priority } =
          obsType === "contradiction"
            ? computePriority({
                type: "contradiction",
                claimKinds: { newKind: newClaimKind, existingKind: matchingExisting.kind },
                contradictionTier: paidKey ? "confident" : "hedged",
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
          conflictingBlockId: matchingExisting.sourceBlockId,
          conflictingStartOffset: 0,
          conflictingEndOffset: 9999,
        });
      };

      for (const con of parsedContradictions.contradictions || []) {
        emitConflict(con, "contradiction");
      }
      for (const ten of parsedContradictions.tensions || []) {
        emitConflict(ten, "strategic_tension");
      }
    }

    // 7. Reconcile new observations against existing active ones for this
    //    section's member blocks (dedupe / supersede / auto-close / insert)
    await reconcileObservations(docId, memberBlockIds, newObs);
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
      claims.map((c) => `${c.sourceBlockId}:${c.text}`).join(";"),
  );
  if ((await loadDocEvalState(docId)) === docStateHash) {
    return;
  }

  const parts: string[] = [];
  parts.push(stage ? `Stage/Context: ${stage}` : "Stage/Context: (none set)");
  parts.push(
    `\nBlock Summaries:\n${meaningful.map((s, i) => `[${i + 1}] ${s.summary}`).join("\n")}`,
  );
  if (claims.length > 0) {
    parts.push(
      `\nClaim Ledger:\n${claims.map((c, i) => `[${i + 1}] (${c.kind}): "${c.text}"`).join("\n")}`,
    );
  }
  if (!stage) {
    parts.push(
      "\n\nIf you can confidently infer the document type and audience from the content, return it as suggested_stage. Otherwise null.",
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
    });

    if (import.meta.env.DEV) {
      harness.emit("response", {
        tier: "strong",
        check: "doc-level",
        latencyMs: Date.now() - startedAt,
      });
    }

    const parsed = parseJSONResponse(res.text) as {
      missing_topic_observations?: { text: string }[];
      underexposed_topic_observations?: { text: string }[];
      audience_mismatch_observations?: { text: string }[];
      structure_flow_observations?: { text: string }[];
      suggested_stage?: string | null;
    };

    const newObs: NewObservation[] = [];

    const addDocObs = (
      type: Observation["type"],
      kind: Observation["kind"],
      items: { text: string }[] | undefined,
    ) => {
      const { severity, confidence, priority } = computePriority({ type });
      for (const item of items ?? []) {
        if (item.text?.trim()) {
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
      }
    };

    addDocObs("missing_topic", "opportunity", parsed.missing_topic_observations);
    addDocObs("underexposed_topic", "opportunity", parsed.underexposed_topic_observations);
    addDocObs("audience_mismatch", "problem", parsed.audience_mismatch_observations);
    addDocObs("structure_flow", "problem", parsed.structure_flow_observations);

    await reconcileDocumentObservations(docId, newObs);
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
