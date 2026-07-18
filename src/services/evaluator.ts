import { createRouter } from "../model/factory";
import { getLlmMode } from "../model/mock";
import { selectContradictionCandidates } from "./prefilter";
import { computePriority, docGapKind } from "./priority";
import type { MaturityLevel } from "./documentMaturity";
import { JARGON_PRESET } from "./jargonPreset";
import {
  classifyDocumentClass,
  sectionCalibrationBlock,
  docCalibrationBlock,
} from "./documentClass";
import {
  saveBlockSummary,
  loadBlockSummary,
  saveClaimsForBlock,
  loadActiveClaimsForDocument,
  loadBlockSummariesForDocument,
  loadDocument,
  saveDocEvalState,
  loadDocEvalState,
  loadActiveObservationsForDocument,
  loadObservation,
  reactivateObservation,
  updateObservationStatus,
  type ClaimLedgerEntry,
  type Observation,
} from "../store/db";
import { harness } from "../debug/harness";
import { llmLogger } from "../model/logger";
import type { SectionMember } from "./types";
import { type ModelCapability, WEAK_CAPABILITY } from "../model/capability";
import {
  buildCandidateSnapshot,
  isMaterialDelta,
  parseDocPassSnapshot,
  serializeDocPassSnapshot,
  SUBFLOOR_FLUSH_STREAK,
} from "./docPassMateriality";

import {
  MERGED_SYSTEM_PROMPT,
  DOC_LEVEL_SYSTEM_PROMPT,
  CONTRADICTION_SYSTEM_PROMPT,
  CONTRADICTION_SYSTEM_PROMPT_HEDGED,
  CONTRADICTION_SWEEP_SYSTEM_PROMPT,
  CONTRADICTION_SWEEP_SYSTEM_PROMPT_HEDGED,
  isDocumentMetaClaim,
  parseJSONResponse,
} from "./evaluatorPrompts";
import {
  hashCode,
  anchorSubstring,
  anchorClaimsToMembers,
  firstBodyMember,
  normalizeText,
  conflictPairKey,
  type NewObservation,
} from "./evaluatorAnchoring";
import {
  reconcileObservations,
  reconcileConflictCardsOnEdit,
  reconcileDocumentObservations,
  reconcileSweepContradictions,
  archiveObs,
  type ConfirmConflictFn,
} from "./evaluatorReconcile";
import {
  snapshotKey,
  getSectionSnapshot,
  setSectionSnapshot,
  type SectionSnapshot,
} from "./evalSnapshot";

// ---------------------------------------------------------------------------
// Re-exports — preserve the public API so callers don't need to change their
// import paths (App.tsx, orchestrator.ts, signal-quality.test.ts, etc.).
// ---------------------------------------------------------------------------
export {
  parseJSONResponse,
  isDocumentMetaClaim,
  MERGED_SYSTEM_PROMPT,
  CONTRADICTION_SYSTEM_PROMPT,
  CONTRADICTION_SYSTEM_PROMPT_HEDGED,
  CONTRADICTION_SWEEP_SYSTEM_PROMPT,
  CONTRADICTION_SWEEP_SYSTEM_PROMPT_HEDGED,
} from "./evaluatorPrompts";
export { conflictPairKey } from "./evaluatorAnchoring";
export { reconcileDocumentObservations } from "./evaluatorReconcile";

// ---------------------------------------------------------------------------
// Local types — used only inside the evaluate* functions below.
// ---------------------------------------------------------------------------

// Char budget for the OBS-027 "Established elsewhere" sibling-claim context.
// Summaries are always included (one-liners); claim texts are truncated/capped
// to this budget so token growth stays bounded on large documents.
const CONTEXT_CLAIM_BUDGET_CHARS = 1200;

// Audience-relative jargon calibration (OBS-003/OBS-005). The prompt now judges
// terms against the doc's inferred audience and flags each once, but that is a
// soft instruction — this caps the emitted volume per settle after doc-wide
// dedup. Above this, a technical section becomes the "wall of flags" V1 Run 1
// measured (21–53/doc); dropping the tail is the point. See
// docs/projects/document_type_calibration.md § Audience-relative jargon calibration.
const JARGON_SECTION_CAP = 3;

interface SpanObservation {
  text: string;
  substring: string;
}

interface ContradictionObservation {
  newClaimText: string;
  existingClaimId: number | string;
  message: string;
}

// ---------------------------------------------------------------------------
// Revert-aware evaluation — Mechanism 2 (see evalSnapshot.ts + step 1b below).
// ---------------------------------------------------------------------------

/**
 * Restore a section to a previously-evaluated (membership, text) state:
 * reactivate the cached cards by their original id (no new id → no feed
 * flicker), close any stray active observation on these blocks that isn't
 * part of the restored state (a real artifact of the transient window, not a
 * false closure), and re-save the claims + block summary the cached state
 * produced — all without a model call. See docs/projects/revert_aware_evaluation.md.
 */
async function restoreSectionFromSnapshot(
  docId: string,
  sectionId: string,
  memberBlockIds: string[],
  cleanText: string,
  textHash: string,
  snapshot: SectionSnapshot
): Promise<void> {
  const restoreIds = new Set(snapshot.observationIds);
  const now = Date.now();

  for (const id of snapshot.observationIds) {
    const obs = await loadObservation(id);
    if (obs && obs.status !== "active") {
      await reactivateObservation(id, now);
    }
  }

  const memberSet = new Set(memberBlockIds);
  const active = await loadActiveObservationsForDocument(docId);
  for (const o of active) {
    if (o.blockId != null && memberSet.has(o.blockId) && !restoreIds.has(o.id)) {
      await updateObservationStatus(o.id, "auto_closed", "resolved_by_edit");
      archiveObs(o, "auto_closed");
    }
  }

  // Pass members so a restore under a *different* representative id than the one
  // captured retires the old-id claims instead of duplicating them (the snapshot
  // key is membership+text, so the current rep id may differ from capture time).
  await saveClaimsForBlock(docId, sectionId, snapshot.claims, memberBlockIds);
  await saveBlockSummary({ blockId: sectionId, docId, summary: snapshot.summary, hash: textHash });

  if (import.meta.env.DEV) {
    harness.emit("restore", {
      sectionId,
      restored: snapshot.observationIds.length,
      textLength: cleanText.length,
    });
  }
}

// ---------------------------------------------------------------------------
// Public evaluator
// ---------------------------------------------------------------------------

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
  isLive: () => boolean = () => true,
  /** Called with the model's inferred document type/audience when no stage is
   *  set (the fast call is asked for a `suggested_stage` key — see the prompt
   *  build below). Threaded from `EvalContext.onStageSuggestion` by the
   *  orchestrator; surfaces as the confirm chip in `DocumentContext`. */
  onStageSuggestion?: (suggestion: string) => void,
  /** Candidate-selection strategy for the cross-document contradiction check.
   *  `"prefilter"` (default) keeps today's Jaccard top-10 lexical prefilter;
   *  `"all-pairs"` bypasses it and hands the adjudicator every candidate claim.
   *  A DEV/eval-only bypass seam — field_validation V3's prefilter A/B toggles
   *  this to isolate how much hero-recall loss is candidate SELECTION (the
   *  prefilter dropping a true pair before the adjudicator ever sees it — the
   *  "Q2"/"the second quarter" class) vs adjudication. The default path is
   *  byte-identical to prior behaviour, so no recorded fixture hash shifts.
   *  See docs/projects/field_validation.md § V3. */
  contradictionCandidates: "prefilter" | "all-pairs" = "prefilter"
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

  // 1b. Revert-aware restore (Mechanism 2, revert_aware_evaluation.md): a
  //     section's membership can transiently resize (a paragraph<->heading
  //     toggle) with no debounce of its own, so the block-summary hash above
  //     can miss even when this *exact* (membership, text) combination was
  //     already evaluated under a different representative sectionId. Key the
  //     snapshot on membership+text, not sectionId, so a toggle->revert (or a
  //     Ctrl-Z back to prior text) restores the prior observations by id
  //     instead of re-running the model and re-deriving new ones.
  const snapKey = snapshotKey(memberBlockIds, textHash);
  const snapshot = getSectionSnapshot(docId, snapKey);
  if (snapshot) {
    if (!isLive()) return;
    await restoreSectionFromSnapshot(
      docId,
      sectionId,
      memberBlockIds,
      cleanText,
      textHash,
      snapshot
    );
    return;
  }

  // 2. If section is now empty / too short, or is a bodyless heading, retire its
  //    data and close its observations. A heading with no body text must never
  //    reach the model — a long-enough heading clears the length guard, and the
  //    model then fabricates a whole section (invented claims that pollute the
  //    ledger and drive a paid contradiction call). See OBS-029 /
  //    docs/projects/section_eval_precision.md. `isHeading` is set by
  //    resolveSections; an unmarked member falls back to "body" so hand-built
  //    fixtures still evaluate. Hash written last (same atomicity rule as the
  //    main path): if reconcile throws, the section stays dirty and retries. (L3)
  // A table is eval-inert (canvas_content_types.md): its cell text is already
  // excluded from combinedText, so it must not count as body here either — a
  // heading + table (no prose) section stays bodyless and skips the model,
  // rather than sending a body-less heading and re-triggering the OBS-029
  // hallucination. `isTable` may be undefined on hand-built fixtures → treated
  // as not-a-table.
  const hasBody = members.some((m) => !m.isHeading && !m.isTable && m.text.trim().length > 0);
  if (cleanText.length < 10 || !hasBody) {
    // If the section was removed concurrently, handleBlockRemoved already did
    // this cleanup — don't recreate an (empty) summary for a deleted block (L4).
    if (!isLive()) return;
    await saveClaimsForBlock(docId, sectionId, [], memberBlockIds);
    await reconcileObservations(docId, memberBlockIds, []);
    // The section was wiped: no claims survive, so any conflict card touching it on
    // either side is resolved → smart-immediate closes it (empty extract + empty
    // block text ⇒ "gone"). No B on this path (no fresh claim to re-confirm against).
    await reconcileConflictCardsOnEdit(
      docId,
      members,
      [],
      new Set<string>(),
      capability,
      undefined,
      evalId,
      isLive
    );
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
    // No stage set → ask the fast call for a document-type guess alongside its
    // normal output. The doc-level pass also infers a stage, but a single-section
    // (e.g. headingless) doc never reaches it — its summary count stays below
    // evaluateDocument's ≥2 gate — and even sectioned docs used to wait out
    // doc-idle for their first suggestion (OBS-036 facet 1). Riding the existing
    // fast call costs zero extra requests. Gated on !stage so staged requests
    // keep byte-identical hashes for mock replay (same rule as the OBS-027 block
    // below); the schema addition rides user content, not the system prompt,
    // mirroring resolved_prior.
    else
      userParts.push(
        // Wording note (2026-07-13): a stricter "only if unmistakable … when in
        // doubt, return null" bar was tried and reverted — live probes showed the
        // weak fast-tier model returning null even for an unambiguous proposal
        // paragraph, zeroing the feature on the tier most users run. "Confidently
        // infer" (the doc-tier prompt's long-standing wording) gives a correct
        // guess there; re-offer nagging is handled by App-side dismissal damping.
        `\nNo document context is set. If you can confidently infer the document type and intended audience from the content, add a "suggested_stage" key (string — a short description of what this document is and who it is for) to your JSON response; otherwise set it to null.`
      );
    // Document-type calibration (OBS-023/OBS-028): on non-PRD genres, relax
    // unsupported_claim to hard external-fact assertions only. Empty (hash-stable)
    // for prd_spec / unknown. See documentClass.ts.
    const sectionCalib = sectionCalibrationBlock(classifyDocumentClass(stage));
    if (sectionCalib) userParts.push(sectionCalib);
    if (definedTerms.length > 0) {
      userParts.push(
        `\nDefined terms (do not flag as undefined jargon):\n${definedTerms.join("\n")}`
      );
    }

    // OBS-027: give the model the context of what SIBLING sections already
    // establish, so reference-resolving span checks (clarity / undefined_jargon /
    // unsupported_claim) don't false-positive on terms, references, or claims
    // that other sections define or assert. Reuses artifacts already in memory
    // (block summaries + the active ledger) — no extra model call. Gated on
    // sibling content so single-section fixtures keep stable hashes (mirrors the
    // priorObs gate below). See docs/projects/section_eval_precision.md (OBS-027).
    const siblingSummaries = (await loadBlockSummariesForDocument(docId))
      .filter((s) => s.blockId !== sectionId && s.summary.trim().length > 0)
      .map((s) => s.summary.trim());
    // Broaden past the glossary (which uses only `definition` claims) to sibling
    // assertions/commitments/metrics/constraints so `unsupported_claim` resolves
    // against what other sections assert. `definition` claims are excluded here —
    // they already surface via the "Defined terms" glossary above (dedup).
    const siblingClaims = existingClaimsForGlossary
      .filter((c) => !memberBlockIds.includes(c.sourceBlockId) && c.kind !== "definition")
      .map((c) => c.text.trim())
      .filter((t) => t.length > 0);
    // Bound token growth on large documents: summaries are one-liners (kept whole),
    // claim texts are truncated and capped to a char budget.
    const cappedClaims: string[] = [];
    let claimBudget = CONTEXT_CLAIM_BUDGET_CHARS;
    for (const t of siblingClaims) {
      const line = t.length > 200 ? `${t.slice(0, 197)}…` : t;
      if (claimBudget - line.length < 0) break;
      cappedClaims.push(line);
      claimBudget -= line.length;
    }
    if (siblingSummaries.length > 0 || cappedClaims.length > 0) {
      const contextParts: string[] = [];
      if (siblingSummaries.length > 0) {
        contextParts.push(`Other sections:\n${siblingSummaries.map((s) => `- ${s}`).join("\n")}`);
      }
      if (cappedClaims.length > 0) {
        contextParts.push(`Established claims:\n${cappedClaims.map((c) => `- ${c}`).join("\n")}`);
      }
      // Instructions ride with the (gated) block rather than the static system
      // prompt so single-section fixtures keep stable request hashes for mock
      // replay — only sections that actually have sibling context change.
      userParts.push(
        `\nEstablished elsewhere in this document — CONTEXT ONLY, not part of the section under review. Other sections already define/assert the following. Do NOT flag a term, reference, or claim as undefined, unclear, or unsupported when it is resolved here; do not generate observations about this context block. Still flag a reference this block does not actually resolve — loose topical overlap is not a definition. Also treat the section heading as governing intent: items under "Out of scope"/"Non-goals"/"Future" headings are deliberate exclusions, not omissions.\n${contextParts.join(
          "\n"
        )}`
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
      suggested_stage?: string | null;
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
    // Resolve each claim to the member block + offsets that actually contain its
    // text, so contradictions/tensions anchor to the real clause (not the section
    // heading). A claim the LLM reworded won't be a verbatim substring → no anchor
    // → whole-block fallback at emit. See docs/mechanics/evaluation-triggers.md.
    const extractedClaims = anchorClaimsToMembers(
      members,
      (parsedMerged.claims || []).filter((c) => !isDocumentMetaClaim(c.text))
    );
    if (import.meta.env.DEV && extractedClaims.length > 0) {
      // Paraphrase residual: claims that weren't a verbatim substring and fell
      // back to the whole **body** block (OBS-032). `anchorExact === false` marks
      // them — every approximate claim still carries an `anchorBlockId` now, so
      // the old `!anchorBlockId` count would read zero.
      const unanchored = extractedClaims.filter((c) => c.anchorExact === false).length;
      if (unanchored > 0) {
        // Gauge before investing in an extraction-quote prompt change.
        console.debug(
          `[anchor] section ${sectionId}: ${unanchored}/${extractedClaims.length} claims unanchored (paraphrase fallback)`
        );
      }
    }
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
    await saveClaimsForBlock(docId, sectionId, extractedClaims, memberBlockIds);

    // Surface the model's document-type guess (requested only when no stage is
    // set — see the prompt build above). Same guards as evaluateDocument's
    // suggested_stage handling; the App-side confirm chip does the rest.
    if (
      !stage &&
      parsedMerged.suggested_stage &&
      typeof parsedMerged.suggested_stage === "string" &&
      parsedMerged.suggested_stage.trim()
    ) {
      onStageSuggestion?.(parsedMerged.suggested_stage.trim());
    }

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
                  const sub = obs.substring.trim().toLowerCase();
                  const claim = c.text.trim().toLowerCase();
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

    // Audience-relative jargon calibration (OBS-003/OBS-005): the prompt judges
    // each term against the doc's inferred audience and asks for one flag per
    // distinct term, but the guarantee is code. (1) Doc-wide once-per-term
    // dedup: drop a term already flagged by an ACTIVE jargon card ELSEWHERE in
    // the doc (first card wins) — `allActiveObs` is already loaded above, no new
    // read. The "elsewhere" filter is deliberate: this section's own re-emitted
    // terms must still flow to reconcileObservations so their existing cards keep
    // their grace/re-emit lifecycle. (2) In-batch dedup: one flag per distinct
    // term within this response. (3) Per-section cap in document order.
    const activeJargonTerms = new Set(
      allActiveObs
        .filter(
          (o) =>
            o.type === "undefined_jargon" &&
            o.scope === "span" &&
            o.anchorText != null &&
            o.blockId != null &&
            !memberBlockIds.includes(o.blockId)
        )
        .map((o) => normalizeText(o.anchorText as string))
    );
    const seenJargonTerms = new Set<string>();
    const rankedJargon = jargonObservations
      .filter((obs) => {
        if (!obs.substring) return false;
        const key = normalizeText(obs.substring);
        if (activeJargonTerms.has(key) || seenJargonTerms.has(key)) return false;
        seenJargonTerms.add(key);
        return true;
      })
      // Anchor now so the cap can order by document position deterministically
      // (mock replay depends on it); addSpanObs re-anchors the survivors.
      .map((obs) => ({ obs, anchor: anchorSubstring(members, obs.substring) }))
      .filter((x) => x.anchor != null)
      .sort((a, b) => {
        const ai = memberBlockIds.indexOf(a.anchor!.blockId);
        const bi = memberBlockIds.indexOf(b.anchor!.blockId);
        return ai - bi || a.anchor!.startOffset - b.anchor!.startOffset;
      })
      .slice(0, JARGON_SECTION_CAP)
      .map((x) => x.obs);
    addSpanObs("undefined_jargon", rankedJargon);

    // 6. Contradiction check (cross-document, uses claim ledger).
    //    Skipped on bulk paste / import: a single ledger-internal sweep covers
    //    contradiction once the ledger is built, avoiding N paid-tier calls.
    if (!skipContradiction) {
      const existingClaims = await loadActiveClaimsForDocument(docId);
      // Mechanism A (contradiction_coverage.md — OBS-033/UX-018): also compare the
      // new claims against SAME-section pairs, not just other sections'. A
      // single-section doc's conflicting pair is extracted in one batch and keyed
      // under the same section representative id, so the old
      // `sourceBlockId !== sectionId` filter dropped all intra-section pairs
      // wholesale — a blatant contradiction then surfaced (if at all) only as a
      // weak `clarity` nit, never as a `contradiction`, unless it arrived via the
      // paste sweep.
      //
      // The same-section pool is taken from the in-memory `extractedClaims` (this
      // settle's own freshly-extracted claims), NOT from re-reading the ledger:
      // `saveClaimsForBlock` above just wrote them, and on the FIRST settle those
      // rows are not reliably visible to this read yet (IndexedDB read-after-write),
      // so a DB-based fold fired the intra-section contradiction only on a *later*
      // settle — flaky exactly on the type-it-once hero path. `extractedClaims`
      // are guaranteed present here and carry the same text/kind/anchor offsets.
      //
      // Fold them in ONLY when the section has ≥2 claims (an intra-section pair is
      // actually possible). A lone section claim can't self-contradict, and adding
      // it would just be a self-dup that perturbs every single-claim section's
      // contradiction prompt (and its recorded hash) for zero coverage gain — so
      // the common case stays byte-identical. A claim vs its own copy is a self-pair,
      // rejected at emit (same guard as the sweep), and A×B/B×A duplicates coalesce
      // via `conflictPairKey`. No new call cadence: this widens the candidate set of
      // a strong call that already fires per settle and is not maturity-gated
      // (resolving UX-016's intra-section case).
      const crossSectionClaims = existingClaims.filter((c) => c.sourceBlockId !== sectionId);
      const sameSectionPool: ClaimLedgerEntry[] =
        extractedClaims.length >= 2
          ? extractedClaims.map((c) => ({ id: 0, docId, status: "active", sourceBlockId: sectionId, ...c }))
          : [];
      const otherClaims = [...crossSectionClaims, ...sameSectionPool];

      // Select the candidate claims the adjudicator compares against, kept bounded as
      // documents grow. `selectContradictionCandidates` does per-claim retrieval +
      // near-duplicate dedup (OBS-038: the old whole-section blob query let a compatible
      // near-duplicate crowd the contradictory claim out of the top-K, so the true pair
      // never co-occurred — candidate selection, not adjudication). On a small candidate
      // set it degrades to "all candidates", keeping small-doc prompts byte-identical.
      // The `"all-pairs"` bypass (V3 measurement only) hands over every candidate
      // unfiltered so the selection cost stays measurable — leave it untouched.
      const candidateClaims =
        contradictionCandidates === "all-pairs"
          ? otherClaims
          : selectContradictionCandidates(extractedClaims, otherClaims, { perClaimK: 5, totalCap: 15 });

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
        //
        // Mechanism A widened the candidate pool to include same-section claims, so
        // a claim can now appear on both sides (New + Existing). Two guards keep
        // that clean: reject a self-pair (a claim vs its own persisted copy — same
        // guard the sweep applies at ~L983) and coalesce A×B/B×A duplicates by the
        // order-independent `conflictPairKey`.
        const seenConflictKeys = new Set<string>();
        const emitConflict = (
          con: ContradictionObservation,
          obsType: "contradiction" | "strategic_tension"
        ) => {
          const matchingExisting = sortedOther[Number(con.existingClaimId)];
          if (!matchingExisting) return;

          // Self-pair: the model matched a new claim against its own freshly-saved
          // copy (identical text). Not a contradiction — skip before anchoring.
          if (normalizeText(con.newClaimText) === normalizeText(matchingExisting.text)) return;

          // Anchor the new side to the member block holding the claim if we can
          // find it; otherwise fall back to the section's first **body** block —
          // never `members[0]`, which is the heading (OBS-032). A bare heading
          // must never be the sole highlighted span for a body-originating claim.
          const exact = anchorSubstring(members, con.newClaimText);
          const fallback = firstBodyMember(members) ?? { blockId: sectionId, text: cleanText };

          // UX-008: verbatim excerpt for the card — the exact source slice at the
          // resolved offsets, only when we anchored precisely. Absent on the
          // whole-body-block fallback (the card then quotes the normalized claim).
          const exactMember = exact ? members.find((m) => m.blockId === exact.blockId) : undefined;
          const newAnchorQuote = exactMember?.text.slice(exact!.startOffset, exact!.endOffset);

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

          const blockId = exact?.blockId ?? fallback.blockId;
          const conflictingBlockId =
            matchingExisting.anchorBlockId ?? matchingExisting.sourceBlockId;

          // Coalesce A×B / B×A: with same-section pairs in the pool both directions
          // can come back. `conflictPairKey` is order-independent, so the second
          // direction (and any re-run of the same pair) collapses onto the first.
          const pairKey = conflictPairKey({ type: obsType, blockId, conflictingBlockId });
          if (seenConflictKeys.has(pairKey)) return;
          seenConflictKeys.add(pairKey);

          newObs.push({
            type: obsType,
            scope: "span",
            kind: obsType === "contradiction" ? "problem" : "opportunity",
            severity,
            confidence,
            priority,
            text: con.message,
            blockId,
            startOffset: exact?.startOffset ?? 0,
            // 9999 sentinel, not fallback.text.length: matches the whole-block
            // convention `reanchorOffset` relies on (isWholeBlockSentinel) — a
            // real length here gets misread as a vanished exact anchor and the
            // highlight is wrongly suppressed on the next re-anchor.
            endOffset: exact?.endOffset ?? 9999,
            anchorText: con.newClaimText,
            anchorQuote: newAnchorQuote,
            // Conflicting side: anchor to the existing claim's precise block +
            // offsets when resolved at extraction; else its section block + whole-block.
            conflictingBlockId,
            conflictingStartOffset: matchingExisting.anchorStartOffset ?? 0,
            conflictingEndOffset: matchingExisting.anchorEndOffset ?? 9999,
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

    // 7b. Edit-scoped conflict-card resolution (either side). The pair keys emitted
    //     this settle tell the arm which conflicts still hold; the fresh claims + live
    //     member text tell it which have been resolved (smart-immediate close). A
    //     strong-tier 2-claim confirm (B) disambiguates a reworded-but-present card,
    //     capped at one/settle and skipped on the weak tier (V1: weak-tier contradiction
    //     adjudication is untrustworthy). See docs/projects/contradiction_resolution.md.
    const freshPairKeys = new Set(
      newObs
        .filter((o) => o.type === "contradiction" || o.type === "strategic_tension")
        .map((o) => conflictPairKey(o))
    );
    const confirmConflict: ConfirmConflictFn | undefined = capability.adjudicateConfidently
      ? async (newClaimText, existingClaimText) => {
          const user = `New Claims:\n[New Claim #0]: "${newClaimText}"\n\nExisting Claims:\n[Existing Claim #0]: "${existingClaimText}"${
            stage ? `\n\nDocument Context: ${stage}` : ""
          }`;
          const res = await router.strong({
            system: CONTRADICTION_SYSTEM_PROMPT,
            user,
            json: true,
            meta: { evalId, promptRef: "contradiction-reconfirm" },
          });
          const parsed = parseJSONResponse(res.text) as {
            contradictions?: unknown[];
            tensions?: unknown[];
          };
          return (parsed.contradictions?.length ?? 0) > 0 || (parsed.tensions?.length ?? 0) > 0;
        }
      : undefined;
    await reconcileConflictCardsOnEdit(
      docId,
      members,
      extractedClaims,
      freshPairKeys,
      capability,
      confirmConflict,
      evalId,
      isLive
    );

    // 8. Commit the dirty-check hash LAST. Only now — after the fast call, the
    //    contradiction call, and reconciliation have all succeeded — is the
    //    section's text "fully evaluated". If anything above threw (e.g. a
    //    rate-limited strong call), the hash stays unsaved and the next trigger
    //    re-runs the whole eval instead of short-circuiting on a stale match.
    await saveBlockSummary({ blockId: sectionId, docId, summary: summaryText, hash: textHash });

    // 9. Snapshot this (membership, text) state so a later return to it — a
    //    toggle reverted, a Ctrl-Z, deleting and retyping the same sentence —
    //    can restore rather than re-evaluate. See step 1b / Mechanism 2.
    const settledActive = await loadActiveObservationsForDocument(docId);
    const memberSet = new Set(memberBlockIds);
    const observationIds = settledActive
      .filter((o) => o.blockId != null && memberSet.has(o.blockId))
      .map((o) => o.id);
    setSectionSnapshot(docId, snapKey, {
      sectionId,
      summary: summaryText,
      claims: extractedClaims,
      observationIds,
    });
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

/**
 * Ordered top-level blockIds from the persisted TipTap JSON (document order,
 * top→bottom). Mirrors what `editor/section.ts` `topLevelBlocks` reads off the
 * live PMNode, but walks the persisted `DocumentRecord.content` because the
 * doc-level evaluator has no live editor handle. Used only to order the
 * doc-level prompt's positional `[N]` input — see OBS-035. A blockId absent from
 * the content (e.g. content not yet re-persisted this tick) simply isn't ranked;
 * the caller falls it back to the tail, preserving the prior alphabetical order.
 */
function orderedBlockIdsFromContent(content: unknown): string[] {
  const nodes = (content as { content?: Array<{ attrs?: { blockId?: unknown } }> } | null | undefined)
    ?.content;
  if (!Array.isArray(nodes)) return [];
  const ids: string[] = [];
  for (const node of nodes) {
    const id = node?.attrs?.blockId;
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return ids;
}

/**
 * Ordered heading texts from the persisted TipTap JSON (document order). Feeds
 * the materiality floor's structure-delta clause (a heading renamed/reordered
 * with no body change is otherwise invisible to the summary/claim deltas). Walks
 * the same persisted content `orderedBlockIdsFromContent` reads. A non-persisted
 * document (e.g. the keyless demo, loaded via `setContent`) yields `[]` — the
 * floor there is a no-op because such docs never re-fire it. See OBS-035 for why
 * the doc-level pass has the persisted content at hand.
 */
function orderedHeadingsFromContent(content: unknown): string[] {
  const nodes = (content as { content?: Array<{ type?: unknown }> } | null | undefined)?.content;
  if (!Array.isArray(nodes)) return [];
  const collectText = (node: unknown): string => {
    const n = node as { text?: unknown; content?: unknown[] } | null | undefined;
    if (!n) return "";
    if (typeof n.text === "string") return n.text;
    if (Array.isArray(n.content)) return n.content.map(collectText).join("");
    return "";
  };
  const headings: string[] = [];
  for (const node of nodes) {
    if ((node as { type?: unknown })?.type !== "heading") continue;
    headings.push(collectText(node).trim());
  }
  return headings;
}

export async function evaluateDocument(
  docId: string,
  stage?: string,
  apiKey?: string,
  onStageSuggestion?: (suggestion: string) => void,
  paidKey?: string,
  evalId?: string,
  capability: ModelCapability = WEAK_CAPABILITY,
  maturity?: MaturityLevel,
  /** The doc's full combinedText when it resolves to exactly ONE section
   *  (headingless prose, or one heading owning everything) — supplied by the
   *  editor via `EvalContext.singleSectionText`. Enables the single-section doc
   *  pass: raw text inlined in place of the summary list (heading-cliff facet 3,
   *  probe-validated 2026-07-14 at both tiers). Undefined → multi-section
   *  summary-list path only, exactly as before. */
  singleSectionText?: string
): Promise<void> {
  if (!apiKey && getLlmMode() !== "mock") {
    console.warn("Evaluator: No API key provided, skipping doc-level check.");
    return;
  }

  const summaries = await loadBlockSummariesForDocument(docId);
  // Stable, content-based order for both the dirty-check hash and the prompt
  // below, so the same document produces the same doc-level request every run —
  // independent of the (session-random) block ids and the order section evals
  // happened to finish in. Mirrors the contradiction sweep, which sorts its
  // claims for exactly this reason; without it the doc-level prompt (hence its
  // request hash) is nondeterministic, so the pass can't be mocked/replayed and
  // the dirty-check is fragile across sessions.
  const meaningful = summaries
    .filter((s) => s.summary.trim().length > 0)
    .sort((a, b) => a.summary.localeCompare(b.summary));
  // The summaries gate. Historically "at least a couple of meaningful
  // summaries" — written 2026-06-02 when summaries were per-BLOCK (a content
  // threshold); section-as-eval-unit (2026-06-03) silently re-based it to
  // one-per-section, turning it into a heading requirement that starved
  // headingless docs of every doc-level check. Now: a doc that resolves to a
  // single section still earns the pass when the editor supplied its raw text —
  // the text is inlined in place of the summary list below (probe-validated:
  // register-clean, doc-scope observations at both tiers). The maturity gate at
  // the trigger (doc-idle arms only past "nascent") keeps Invariant #4; this
  // runs at doc-idle and is dirty-checked, so Invariant #3 holds too.
  const singleSectionPass = meaningful.length === 1 && !!singleSectionText?.trim();
  if (meaningful.length < 2 && !singleSectionPass) return;

  const router = createRouter(apiKey ?? "", paidKey);
  const claims = (await loadActiveClaimsForDocument(docId)).sort(
    (a, b) => a.text.localeCompare(b.text) || a.sourceBlockId.localeCompare(b.sourceBlockId)
  );

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

  // Tier 1 materiality floor: a *semantic* dirty-check layered behind the
  // byte-exact hash check above. The hash said some text changed; ask whether it
  // could change a doc-level conclusion (missing_topic / structure_flow / …)
  // before spending a strong-tier call — the pipeline's biggest unforced cost
  // leak against the binding ~20-RPD free-tier budget. This sits entirely before
  // prompt assembly and only ever *suppresses*; any pass that fires builds the
  // identical prompt, so mock-replay/ratchet fixtures are unaffected (no re-key).
  // docRecord is loaded here (rather than below) so heading texts are available
  // to the floor; it is reused for the OBS-035 document-ordered prompt input.
  // See docs/projects/trigger_rederivation.md § "Tier 1 — build spec".
  const docRecord = await loadDocument(docId);
  const floorKey = `${docId}::floor`;
  const nextSnapshot = buildCandidateSnapshot({
    stage,
    maturity,
    sectionCount: meaningful.length,
    headings: orderedHeadingsFromContent(docRecord?.content),
    summaries: meaningful,
    claims,
  });
  const prevSnapshot = parseDocPassSnapshot(await loadDocEvalState(floorKey));
  if (prevSnapshot) {
    const { material, reasons } = isMaterialDelta(prevSnapshot, nextSnapshot);
    if (!material) {
      const streak = prevSnapshot.subFloorDirtyStreak + 1;
      if (streak < SUBFLOOR_FLUSH_STREAK) {
        // Sub-floor: accumulate, don't discard. Bump the streak and leave
        // docStateHash unwritten (the doc stays hash-dirty so the next idle
        // re-asks against this same last-executed snapshot), spend no call.
        await saveDocEvalState(
          floorKey,
          serializeDocPassSnapshot({ ...prevSnapshot, subFloorDirtyStreak: streak })
        );
        if (import.meta.env.DEV) {
          harness.emit("settle", { trigger: "doc-idle-subfloor", reasons });
        }
        return;
      }
      // Flush: a long tail of sub-floor edits must never dead-end (the UX-016
      // failure shape in a new costume). At SUBFLOOR_FLUSH_STREAK the pass runs.
    }
  }
  // prevSnapshot == null (legacy / first pass) → fall through and run the pass.

  // OBS-035: the alphabetical sort above exists *only* for docStateHash
  // determinism (so the expensive doc-level call can be dirty-checked and
  // mocked/replayed). Feeding that same order to the model as its positional
  // `[1] … [2] …` input made `structure_flow`/ordering observations reason over
  // a scrambled sequence (the model correctly called "solution before problem"
  // on an alphabetised list). So the prompt's Block Summaries / Claim Ledger are
  // built from a *document-ordered* view instead, while the hash keeps using the
  // alphabetical order. Blocks/claims whose blockId isn't in the persisted
  // content (e.g. not yet re-persisted this tick) sort to the tail, preserving
  // the prior order for them — a graceful degrade to today's behaviour.
  const orderRank = new Map(
    orderedBlockIdsFromContent(docRecord?.content).map((id, i) => [id, i] as const)
  );
  const rankOf = (blockId: string) => orderRank.get(blockId) ?? Number.MAX_SAFE_INTEGER;
  // Stable sort: equal ranks (claims sharing a source block, or unranked blocks)
  // keep their incoming alphabetical order, so the request stays deterministic.
  const orderedSummaries = [...meaningful].sort((a, b) => rankOf(a.blockId) - rankOf(b.blockId));
  const orderedClaims = [...claims].sort(
    (a, b) => rankOf(a.sourceBlockId) - rankOf(b.sourceBlockId)
  );

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
  // Document-type calibration: on non-PRD genres, don't demand PRD structure
  // (missing_topic / structure_flow). Empty (hash-stable) for prd_spec / unknown.
  const docCalib = docCalibrationBlock(classifyDocumentClass(stage));
  if (docCalib) parts.push(docCalib);
  // Maturity voice switch (R2): frame structural gaps by how far along the
  // draft is — gentle, optional opportunities while forming; firm, located
  // warnings once mature. Register discipline still binds both (locate, don't
  // prescribe; no leading questions). Injected in user content (not the system
  // prompt) and only when maturity is provided, so the legacy path stays
  // hash-stable. Copy is provisional — owned long-term by emotional_register.md.
  if (maturity === "forming") {
    parts.push(
      "\n\nDraft maturity: FORMING (early). For the structural observations (missing_topic, underexposed_topic, structure_flow, audience_mismatch), frame each as a gentle, optional opportunity the author might consider later — never as a problem, never as a leading question. Locate the gap plainly; do not prescribe a fix. Defects and clarity issues are unaffected."
    );
  } else if (maturity === "mature") {
    parts.push(
      "\n\nDraft maturity: MATURE (substantially developed). For the structural observations (missing_topic, underexposed_topic, structure_flow, audience_mismatch), be firm and direct — a near-final draft warrants located warnings, not soft suggestions. Still locate, don't prescribe; no leading questions."
    );
  }
  if (singleSectionPass) {
    // Single-section doc: the summary list would be one line — too lossy to
    // judge the whole document by. Inline the raw text instead (≤ MAX_SECTION_CHARS
    // by construction — the editor caps combinedText) and say plainly what the
    // model is looking at, so structure_flow judges internal consistency rather
    // than hallucinating section ordering. Framing proven by the 2026-07-14
    // probe: specific, located, zero register-lint violations at both tiers.
    parts.push(
      `\nThe document is a single unbroken section (no headings). Full text:\n${singleSectionText!.trim()}`
    );
  } else {
    parts.push(
      `\nBlock Summaries:\n${orderedSummaries.map((s, i) => `[${i + 1}] ${s.summary}`).join("\n")}`
    );
  }
  if (orderedClaims.length > 0) {
    parts.push(
      `\nClaim Ledger:\n${orderedClaims.map((c, i) => `[${i + 1}] (${c.kind}): "${c.text}"`).join("\n")}`
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

    const addDocObs = (type: Observation["type"], items: DocObsItem[] | undefined) => {
      // R2: kind + severity are a function of document maturity for the gap
      // types. Undefined maturity (legacy path) reproduces today's fixed kinds
      // and un-escalated severities. See docs/projects/maturity_aware_severity.md.
      const kind = docGapKind(type, maturity);
      const { severity, confidence, priority } = computePriority({ type, maturity });
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

    addDocObs("missing_topic", parsed.missing_topic_observations);
    addDocObs("underexposed_topic", parsed.underexposed_topic_observations);
    addDocObs("audience_mismatch", parsed.audience_mismatch_observations);
    addDocObs("structure_flow", parsed.structure_flow_observations);

    if (import.meta.env.DEV) {
      llmLogger.recordProduced(res.callId, { observations: newObs.map((o) => o.type) });
    }

    await reconcileDocumentObservations(docId, newObs, evalId, {
      resolvedPriorIds,
      persistIds,
      maturity,
    });
    // Remember the inputs we just reviewed so an unchanged doc skips next time.
    // Write the fresh floor snapshot (streak reset) FIRST, then docStateHash —
    // both are atomic with reconcile (the L3 discipline: a thrown strong call
    // leaves neither written, so the next trigger re-runs the whole eval). Order
    // is load-bearing for signal-quality.test.ts, whose saveDocEvalState mock
    // captures the *last* write into one shared var regardless of key.
    await saveDocEvalState(
      floorKey,
      serializeDocPassSnapshot({ ...nextSnapshot, subFloorDirtyStreak: 0 })
    );
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
      // OBS-026 dropped the same-block guard so intra-block conflicts surface,
      // but a claim can't contradict itself: reject a self-pair (same claim
      // index returned twice) — it would render a card claiming a text
      // conflicts with itself. Same-block *distinct* claims (a !== b) still pass.
      if (!a || !b || a === b) return;
      // …and reject two *distinct* claim entries that are the same text in the
      // same block (a near-duplicate the extractor emitted twice): whole-block
      // anchoring makes both spans identical, so the card reads as a passage
      // conflicting with itself.
      if (a.sourceBlockId === b.sourceBlockId && normalizeText(a.text) === normalizeText(b.text))
        return;

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
        // Precise anchoring: claims resolved at extraction carry the block +
        // offsets where their text actually lives (anchorClaimsToMembers), so the
        // conflict marks the real clause rather than the section heading. Claims
        // the LLM reworded lack the anchor → whole-block fallback (endOffset 9999).
        blockId: a.anchorBlockId ?? a.sourceBlockId,
        startOffset: a.anchorStartOffset ?? 0,
        endOffset: a.anchorEndOffset ?? 9999,
        anchorText: a.text,
        // UX-008: the primary side's verbatim excerpt (set at extraction on a
        // precise anchor; absent on the paraphrase fallback → card quotes `text`).
        anchorQuote: a.anchorQuote,
        conflictingBlockId: b.anchorBlockId ?? b.sourceBlockId,
        conflictingStartOffset: b.anchorStartOffset ?? 0,
        conflictingEndOffset: b.anchorEndOffset ?? 9999,
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
