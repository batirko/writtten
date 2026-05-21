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
    // 3. Re-summarize the block
    const summaryRes = await router.fast({
      system:
        "You are a writing assistant sidecar. Summarize the following block of text in a single, short sentence. Focus on the core claim, point, or commitment made.",
      user: cleanText,
    });
    const summaryText = summaryRes.text.trim();

    // Save summary
    await saveBlockSummary({
      blockId,
      docId,
      summary: summaryText,
      hash: textHash,
    });

    // 4. Extract claims from block
    const claimsPromptSystem = `You are an AI extracting commitments and assertions from text. 
Analyze the text and extract any assertions, commitments, metric goals, constraints, or definitions. 
Return a JSON object with a single key 'claims' which is an array of objects. 
Each claim object must have:
- 'text' (a normalized, self-contained statement of the claim, e.g. 'The product will support offline mode')
- 'kind' (one of: 'commitment', 'fact_claim', 'definition', 'constraint', 'metric')

If no claims are found, return an empty array for 'claims'.
Do NOT include any text other than the raw JSON.`;

    const claimsRes = await router.fast({
      system: claimsPromptSystem,
      user: cleanText,
      json: true,
    });

    const parsedClaims = parseJSONResponse(claimsRes.text) as {
      claims?: Omit<ClaimLedgerEntry, "id" | "docId" | "sourceBlockId" | "status">[];
    };
    const extractedClaims = parsedClaims.claims || [];

    await saveClaimsForBlock(docId, blockId, extractedClaims);

    // 5. Run clarity check (span check)
    const clarityPromptSystem = `You are a critical reader analyzing a specific text block for clarity, vagueness, or ambiguity. 
Do not edit or suggest a rewrite. Focus only on observing where the text is unclear or poorly specified. 
Return a JSON object with a key 'observations', containing an array of objects. Each object must have:
- 'text' (the observation message, observing the issue without fixing it, e.g., 'This section is vague about when the feature launches.')
- 'substring' (the exact substring from the input text that is unclear. It must match the original text exactly, case-sensitive.)

If the text is clear, return an empty array for 'observations'.
Do NOT include any text other than the raw JSON.`;

    const clarityRes = await router.fast({
      system: clarityPromptSystem,
      user: cleanText,
      json: true,
    });

    interface ClarityObservation {
      text: string;
      substring: string;
    }
    const parsedClarity = parseJSONResponse(clarityRes.text) as {
      observations?: ClarityObservation[];
    };
    const clarityObservations = parsedClarity.observations || [];

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
