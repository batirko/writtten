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
  loadActiveObservationsForDocument,
  type ClaimLedgerEntry,
  type Observation,
} from "../store/db";
import { harness } from "../debug/harness";
import { llmLogger } from "../model/logger";
import type { SectionMember } from "./types";
import { type ModelCapability, WEAK_CAPABILITY } from "../model/capability";

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
  type NewObservation,
} from "./evaluatorAnchoring";
import {
  reconcileObservations,
  reconcileDocumentObservations,
  reconcileSweepContradictions,
} from "./evaluatorReconcile";

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
