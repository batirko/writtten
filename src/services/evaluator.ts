import { createRouter } from "../model/factory";
import { getLlmMode } from "../model/mock";
import {
  saveBlockSummary,
  loadBlockSummary,
  saveClaimsForBlock,
  loadActiveClaimsForDocument,
  saveObservation,
  loadActiveObservationsForDocument,
  updateObservationStatus,
  type ClaimLedgerEntry,
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
async function reconcileObservations(
  docId: string,
  blockId: string,
  newObs: NewObservation[],
): Promise<void> {
  const allActive = await loadActiveObservationsForDocument(docId);
  const existing = allActive.filter((o) => o.blockId === blockId);
  const matchedExistingIds = new Set<string>();

  for (const newO of newObs) {
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

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const MERGED_SYSTEM_PROMPT = `You are an AI assistant sidecar evaluating a specific text block for three things:
1. A summary: Summarize the block in a single, short sentence. Focus on the core claim, point, or commitment made.
2. Claims: Extract any assertions, commitments, metric goals, constraints, or definitions.
3. Clarity: Analyze the text for clarity, vagueness, or ambiguity. Do not edit or suggest a rewrite. Focus only on observing where the text is unclear or poorly specified.

Return a JSON object with exactly three keys:
- 'summary' (a string)
- 'claims' (an array of objects, each with 'text' and 'kind'. 'kind' must be one of: 'commitment', 'fact_claim', 'definition', 'constraint', 'metric')
- 'clarity_observations' (an array of objects, each with 'text' for the observation message and 'substring' for the exact literal text from the input that is unclear. It must match the original text exactly, case-sensitive.)

If there are no claims, return an empty array for 'claims'.
If the text is clear, return an empty array for 'clarity_observations'.
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

interface ClarityObservation {
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
): Promise<void> {
  // Mock mode replays canned responses, so it needs no key. Every other mode
  // hits the network and does.
  if (!apiKey && getLlmMode() !== "mock") {
    console.warn("Evaluator: No API key provided, skipping check.");
    return;
  }

  const router = createRouter(apiKey ?? "");
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
    // 3. Merged fast call: summary + claims + clarity in one round-trip
    //    Include stage in user content so the model can calibrate jargon / tone.
    const userContent = stage
      ? `${cleanText}\n\nDocument context: ${stage}`
      : cleanText;

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
      clarity_observations?: ClarityObservation[];
    };
    if (import.meta.env.DEV) {
      harness.emit("response", {
        block: blockId,
        tier: "fast",
        latencyMs: Date.now() - mergedStartedAt,
        claims: parsedMerged.claims?.length ?? 0,
        clarity: parsedMerged.clarity_observations?.length ?? 0,
      });
    }

    const summaryText = parsedMerged.summary?.trim() || "";
    const extractedClaims = parsedMerged.claims || [];
    const clarityObservations = parsedMerged.clarity_observations || [];

    // 4. Persist summary and claims first — observations may reference ledger IDs
    await saveBlockSummary({ blockId, docId, summary: summaryText, hash: textHash });
    await saveClaimsForBlock(docId, blockId, extractedClaims);

    // 5. Collect all new observations (do not write to DB yet)
    const newObs: NewObservation[] = [];

    for (const obs of clarityObservations) {
      if (!obs.substring || !obs.text) continue;
      const startOffset = cleanText.indexOf(obs.substring);
      if (startOffset !== -1) {
        newObs.push({
          type: "clarity",
          scope: "span",
          nature: "defect",
          text: obs.text,
          blockId,
          startOffset,
          endOffset: startOffset + obs.substring.length,
        });
      }
    }

    // 6. Contradiction check (cross-document, uses claim ledger)
    const existingClaims = await loadActiveClaimsForDocument(docId);
    const otherClaims = existingClaims.filter((c) => c.sourceBlockId !== blockId);

    // Sort existing claims to a stable order (text then blockId) so the
    // contradiction prompt is deterministic across runs — IDB auto-increment
    // ids change every session and would break mock-mode replay hashes.
    const sortedOther = [...otherClaims].sort(
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
