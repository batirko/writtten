import { createRouter } from "../model/factory";
import { getLlmMode } from "../model/mock";
import { prefilterClaims } from "./prefilter";
import {
  saveBlockSummary,
  loadBlockSummary,
  saveClaimsForBlock,
  loadActiveClaimsForDocument,
  loadBlockSummariesForDocument,
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
  blockId: string,
  newObs: NewObservation[],
): Promise<void> {
  const [allActive, suppressions] = await Promise.all([
    loadActiveObservationsForDocument(docId),
    loadSuppressionsForDocument(docId),
  ]);
  const existing = allActive.filter((o) => o.blockId === blockId);
  const matchedExistingIds = new Set<string>();

  for (const newO of newObs) {
    // Suppression check — never re-insert a dismissed span
    if (isSpanSuppressed(newO, suppressions)) continue;

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

const MERGED_SYSTEM_PROMPT = `You are an AI sidecar evaluating a text block for five things:
1. Summary: a single short sentence summarizing the block's core claim or point.
2. Claims: factual assertions, commitments, metrics, constraints, or definitions made in the text.
3. Clarity: places where the text is vague, ambiguous, or poorly specified.
4. Unsupported claims: strong factual assertions made in the block that lack supporting evidence or grounding within the block itself. Only flag assertions of fact that would require evidence (data, studies, precedent) but provide none — not opinions, plans, or goals.
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

const CONTRADICTION_SYSTEM_PROMPT = `You are a critical editor detecting logical contradictions or conflicts in a document.
You will be given a set of 'New Claims' from a newly written block, and a list of 'Existing Claims' from the rest of the document.
Compare each new claim against the existing claims. If a new claim contradicts, conflicts with, or directly opposes an existing claim, identify the contradiction.

Return a JSON object with a key 'contradictions', which is an array of objects. Each object must have:
- 'newClaimText' (the text of the new claim that has the conflict)
- 'existingClaimId' (the index number shown in [Existing Claim #N] for the conflicting existing claim)
- 'message' (a short, confident observation explaining the contradiction — e.g. "This contradicts the Q3 target date set in the project overview." Never hedge with "might" or "possibly".)

If no contradictions are found, return an empty array for 'contradictions'.
Do NOT include any text other than the raw JSON.`;

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

export async function evaluateBlock(
  docId: string,
  blockId: string,
  text: string,
  stage?: string,
  apiKey?: string,
  paidKey?: string,
): Promise<void> {
  // Mock mode replays canned responses, so it needs no key. Every other mode
  // hits the network and does.
  if (!apiKey && getLlmMode() !== "mock") {
    console.warn("Evaluator: No API key provided, skipping check.");
    return;
  }

  const router = createRouter(apiKey ?? "", paidKey);
  const cleanText = text.trim();
  const textHash = hashCode(cleanText);

  // 1. Skip if text hasn't changed since last eval
  const existingSummary = await loadBlockSummary(blockId);
  if (existingSummary && existingSummary.hash === textHash) {
    return;
  }

  // 2. If block is now empty / too short, retire its data and close its observations
  if (cleanText.length < 10) {
    await saveBlockSummary({ blockId, docId, summary: "", hash: textHash });
    await saveClaimsForBlock(docId, blockId, []);
    await reconcileObservations(docId, blockId, []);
    return;
  }

  try {
    // 3. Merged fast call: summary + claims + span checks in one round-trip.
    //    Include stage and a glossary of already-defined terms so the model
    //    doesn't flag jargon the document has already introduced.
    const existingClaimsForGlossary = await loadActiveClaimsForDocument(docId);
    const definedTerms = existingClaimsForGlossary
      .filter((c) => c.kind === "definition" && c.sourceBlockId !== blockId)
      .map((c) => `- ${c.text}`);

    const userParts: string[] = [cleanText];
    if (stage) userParts.push(`\nDocument context: ${stage}`);
    if (definedTerms.length > 0) {
      userParts.push(`\nDefined terms (do not flag as undefined jargon):\n${definedTerms.join("\n")}`);
    }
    const userContent = userParts.join("");

    if (import.meta.env.DEV) harness.emit("request", { block: blockId, tier: "fast" });
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
        block: blockId,
        tier: "fast",
        latencyMs: Date.now() - mergedStartedAt,
        claims: parsedMerged.claims?.length ?? 0,
        clarity: parsedMerged.clarity_observations?.length ?? 0,
        unsupported: parsedMerged.unsupported_claim_observations?.length ?? 0,
        jargon: parsedMerged.undefined_jargon_observations?.length ?? 0,
      });
    }

    const summaryText = parsedMerged.summary?.trim() || "";
    const extractedClaims = parsedMerged.claims || [];
    const clarityObservations = parsedMerged.clarity_observations || [];
    const unsupportedObservations = parsedMerged.unsupported_claim_observations || [];
    const jargonObservations = parsedMerged.undefined_jargon_observations || [];

    // 4. Persist summary and claims first — observations may reference ledger IDs
    await saveBlockSummary({ blockId, docId, summary: summaryText, hash: textHash });
    await saveClaimsForBlock(docId, blockId, extractedClaims);

    // 5. Collect all new observations (do not write to DB yet)
    const newObs: NewObservation[] = [];

    const addSpanObs = (
      obsType: Observation["type"],
      items: SpanObservation[],
    ) => {
      for (const obs of items) {
        if (!obs.substring || !obs.text) continue;
        const startOffset = cleanText.indexOf(obs.substring);
        if (startOffset !== -1) {
          newObs.push({
            type: obsType,
            scope: "span",
            nature: "defect",
            text: obs.text,
            blockId,
            startOffset,
            endOffset: startOffset + obs.substring.length,
          });
        }
      }
    };

    addSpanObs("clarity", clarityObservations);
    addSpanObs("unsupported_claim", unsupportedObservations);
    addSpanObs("undefined_jargon", jargonObservations);

    // 6. Contradiction check (cross-document, uses claim ledger)
    const existingClaims = await loadActiveClaimsForDocument(docId);
    const otherClaims = existingClaims.filter((c) => c.sourceBlockId !== blockId);

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
        harness.emit("request", { block: blockId, tier: "strong", check: "contradiction" });
      }
      const contradictionStartedAt = Date.now();
      const contradictionRes = await router.strong({
        system: CONTRADICTION_SYSTEM_PROMPT,
        user: contradictionUser,
        json: true,
      });

      const parsedContradictions = parseJSONResponse(contradictionRes.text) as {
        contradictions?: ContradictionObservation[];
      };
      if (import.meta.env.DEV) {
        harness.emit("response", {
          block: blockId,
          tier: "strong",
          latencyMs: Date.now() - contradictionStartedAt,
          contradictions: parsedContradictions.contradictions?.length ?? 0,
        });
      }

      for (const con of parsedContradictions.contradictions || []) {
        const matchingExisting = sortedOther[Number(con.existingClaimId)];
        if (!matchingExisting) continue;

        newObs.push({
          type: "contradiction",
          scope: "span",
          nature: "defect",
          text: con.message,
          blockId,
          startOffset: 0,
          endOffset: cleanText.length,
          conflictingBlockId: matchingExisting.sourceBlockId,
          conflictingStartOffset: 0,
          conflictingEndOffset: 9999,
        });
      }
    }

    // 7. Reconcile new observations against existing active ones for this block
    //    (dedupe / supersede / auto-close / insert — no blanket clear)
    await reconcileObservations(docId, blockId, newObs);
  } catch (error) {
    console.error("Evaluation error for block", blockId, error);
  }
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
      nature: Observation["nature"],
      items: { text: string }[] | undefined,
    ) => {
      for (const item of items ?? []) {
        if (item.text?.trim()) {
          newObs.push({ type, scope: "document", nature, text: item.text.trim() });
        }
      }
    };

    addDocObs("missing_topic", "opportunity", parsed.missing_topic_observations);
    addDocObs("underexposed_topic", "opportunity", parsed.underexposed_topic_observations);
    addDocObs("audience_mismatch", "defect", parsed.audience_mismatch_observations);
    addDocObs("structure_flow", "defect", parsed.structure_flow_observations);

    await reconcileDocumentObservations(docId, newObs);

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
