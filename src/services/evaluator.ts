import { createGeminiRouter } from "../model/gemini";
import {
  saveBlockSummary,
  loadBlockSummary,
  saveClaimsForBlock,
  loadActiveClaimsForDocument,
  saveObservation,
  loadActiveObservationsForDocument,
  updateObservationStatus,
  type ClaimLedgerEntry,
} from "../store/db";
import { nanoid } from "nanoid";

function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

export function parseJSONResponse(text: string): unknown {
  const cleaned = text.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract JSON from markdown code block
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        // fallback
      }
    }
    // Try finding the first '[' or '{' and last ']' or '}'
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch {
        // fallback
      }
    }
    throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}...`);
  }
}

export async function evaluateBlock(
  docId: string,
  blockId: string,
  text: string,
  stage?: string,
  apiKey?: string
): Promise<void> {
  if (!apiKey) {
    console.warn("Evaluator: No API key provided, skipping check.");
    return;
  }

  const router = createGeminiRouter(apiKey);
  const textHash = hashCode(text);

  // 1. Check if the block has changed compared to its last summary
  const existingSummary = await loadBlockSummary(blockId);
  if (existingSummary && existingSummary.hash === textHash) {
    // Text has not changed, skip evaluation
    return;
  }

  // 2. Auto-close / archive existing active observations related to this block before running new checks
  const activeObservations = await loadActiveObservationsForDocument(docId);
  const relatedObs = activeObservations.filter(
    (o) => o.blockId === blockId || o.conflictingBlockId === blockId
  );
  for (const obs of relatedObs) {
    await updateObservationStatus(obs.id, "auto_closed");
  }

  // If text is empty or too short, retire its summary/claims and stop
  const cleanText = text.trim();
  if (cleanText.length < 10) {
    await saveBlockSummary({
      blockId,
      docId,
      summary: "",
      hash: textHash,
    });
    await saveClaimsForBlock(docId, blockId, []);
    return;
  }

  try {
    // 3. Re-summarize the block, extract claims, and run clarity checks in a single call
    const mergedPromptSystem = `You are an AI assistant sidecar evaluating a specific text block for three things:
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

    const mergedRes = await router.fast({
      system: mergedPromptSystem,
      user: cleanText,
      json: true,
    });

    interface ClarityObservation {
      text: string;
      substring: string;
    }

    const parsedMerged = parseJSONResponse(mergedRes.text) as {
      summary?: string;
      claims?: Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">[];
      clarity_observations?: ClarityObservation[];
    };

    const summaryText = parsedMerged.summary?.trim() || "";
    const extractedClaims = parsedMerged.claims || [];
    const clarityObservations = parsedMerged.clarity_observations || [];

    // Save summary
    await saveBlockSummary({
      blockId,
      docId,
      summary: summaryText,
      hash: textHash,
    });

    // Save claims
    await saveClaimsForBlock(docId, blockId, extractedClaims);

    // Save clarity observations
    for (const obs of clarityObservations) {
      if (!obs.substring || !obs.text) continue;

      const startOffset = cleanText.indexOf(obs.substring);
      if (startOffset !== -1) {
        const endOffset = startOffset + obs.substring.length;

        await saveObservation({
          id: nanoid(10),
          docId,
          type: "clarity",
          scope: "span",
          nature: "defect",
          text: obs.text,
          status: "active",
          blockId,
          startOffset,
          endOffset,
        });
      }
    }

    // 6. Run contradiction check (cross-document check)
    const existingClaims = await loadActiveClaimsForDocument(docId);
    // Exclude claims from the current block
    const otherClaims = existingClaims.filter((c) => c.sourceBlockId !== blockId);

    if (extractedClaims.length > 0 && otherClaims.length > 0) {
      const contradictionPromptSystem = `You are a critical editor detecting logical contradictions or conflicts in a document. 
You will be given a set of 'New Claims' from a newly written block, and a list of 'Existing Claims' from the rest of the document.
Compare each new claim against the existing claims. If a new claim contradicts, conflicts with, or directly opposes an existing claim, identify the contradiction.

Return a JSON object with a key 'contradictions', which is an array of objects. Each object must have:
- 'newClaimText' (the text of the new claim that has the conflict)
- 'existingClaimId' (the numeric ID of the conflicting existing claim)
- 'message' (a short message explaining the contradiction, e.g., 'This contradicts the Q3 target date set in the project overview.')

If no contradictions are found, return an empty array for 'contradictions'.
Do NOT include any text other than the raw JSON.`;

      const userContent = `New Claims:
${extractedClaims.map((c, i) => `[New Claim #${i}]: "${c.text}"`).join("\n")}

Existing Claims:
${otherClaims.map((c) => `[Existing Claim ID ${c.id}]: "${c.text}"`).join("\n")}

${stage ? `Document Context: ${stage}` : ""}`;

      const contradictionRes = await router.strong({
        system: contradictionPromptSystem,
        user: userContent,
        json: true,
      });

      interface ContradictionObservation {
        newClaimText: string;
        existingClaimId: number | string;
        message: string;
      }
      const parsedContradictions = parseJSONResponse(contradictionRes.text) as {
        contradictions?: ContradictionObservation[];
      };
      const contradictionsList = parsedContradictions.contradictions || [];

      for (const con of contradictionsList) {
        const matchingExisting = otherClaims.find((c) => c.id === Number(con.existingClaimId));
        if (!matchingExisting) continue;

        // Try to locate which new claim triggered it to get the approximate span offset
        const newClaimIndex = extractedClaims.findIndex((c) => c.text === con.newClaimText);
        const startOffset = 0;
        const endOffset = cleanText.length;

        if (newClaimIndex !== -1) {
          // Find if the claim text shares keywords with the original text to highlight
          // For now, default to the entire block range, as claims are synthesized statements
          // and may not match raw text substrings directly.
        }

        await saveObservation({
          id: nanoid(10),
          docId,
          type: "contradiction",
          scope: "span",
          nature: "defect",
          text: con.message,
          status: "active",
          blockId,
          startOffset,
          endOffset,
          conflictingBlockId: matchingExisting.sourceBlockId,
          // Highlight the whole conflicting block by default
          conflictingStartOffset: 0,
          conflictingEndOffset: 9999, // default to end of block
        });
      }
    }
  } catch (error) {
    console.error("Evaluation error for block", blockId, error);
  }
}
