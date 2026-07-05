/**
 * Document-type calibration — coarse document classes derived from the free-text
 * "Document Context / Stage" value, used to dial evaluator strictness by genre.
 *
 * Pure module: no DB, no LLM, no side effects. The class is derived synchronously
 * from the stage string at eval time (no schema/storage change), so calibration
 * is a pure consumer of a value the product already has.
 *
 * The lever is calibration, NOT new observation types (invariant #2). Only the
 * two checks that misfire off-genre are dialed — `unsupported_claim` (section
 * tier) and `missing_topic` / structural expectations (doc tier). The
 * conservative policy keeps `contradiction`, `clarity`, and `undefined_jargon`
 * fully on for every class.
 *
 * Design: docs/projects/document_type_calibration.md.
 */

export type DocumentClass =
  | "prd_spec"
  | "comms_announcement"
  | "memo_email"
  | "essay_personal"
  | "unknown";

/**
 * Classes whose non-PRD register relaxes `unsupported_claim` / `missing_topic`.
 * `prd_spec` (full strictness — the anchor) and `unknown` (conservative default,
 * behaves PRD-ish + the always-on OBS-028 opinion carve-out) are NOT relaxed, so
 * they inject no calibration block and leave request hashes unchanged.
 */
const RELAXED_CLASSES: ReadonlySet<DocumentClass> = new Set<DocumentClass>([
  "comms_announcement",
  "memo_email",
  "essay_personal",
]);

export function isRelaxedClass(c: DocumentClass): boolean {
  return RELAXED_CLASSES.has(c);
}

/** Human-readable genre label for the calibration prompt block. */
export const CLASS_LABELS: Record<DocumentClass, string> = {
  prd_spec: "a PRD, spec, or decision document",
  comms_announcement: "a stakeholder communication, announcement, or blog post",
  memo_email: "a work memo or email",
  essay_personal: "a personal or reflective essay",
  unknown: "a document",
};

/**
 * Deterministic keyword classifier over the free-text stage/context value.
 *
 * Order is deliberate: `prd_spec` keywords win (the strict anchor case — a "PRD
 * for the launch blog" is still a PRD), then the low-formality genres. Anything
 * unmatched → `unknown` (conservative default). No LLM; pure and synchronous.
 */
export function classifyDocumentClass(stage?: string | null): DocumentClass {
  if (!stage) return "unknown";
  const s = stage.toLowerCase();
  if (
    /\b(prd|spec|specification|requirements?|product requirements?|decision doc(?:ument)?|design doc(?:ument)?|rfc|one[- ]?pager|technical doc(?:ument)?)\b/.test(
      s
    )
  ) {
    return "prd_spec";
  }
  if (/\b(essay|personal|reflect(?:ion|ive)?|memoir|diary|journal|op-?ed|opinion piece)\b/.test(s)) {
    return "essay_personal";
  }
  if (
    /\b(announce(?:ment)?|blog|comms|communication|newsletter|press release|press|public|launch post|marketing|narrative)\b/.test(
      s
    )
  ) {
    return "comms_announcement";
  }
  if (/\b(memo|e-?mail|note to|update to|status update)\b/.test(s)) {
    return "memo_email";
  }
  return "unknown";
}

/**
 * Section-tier (`unsupported_claim`) calibration block for a relaxed class.
 * Returns "" for non-relaxed classes so the prompt (and its hash) is unchanged.
 * Instructions ride in user content, not the static system prompt, so only
 * relaxed-class sections change their request hash.
 */
export function sectionCalibrationBlock(c: DocumentClass): string {
  if (!isRelaxedClass(c)) return "";
  return `\nDocument-type calibration — this is ${CLASS_LABELS[c]}, not a PRD or spec. Apply unsupported_claim ONLY to hard, checkable external-fact assertions (statistics, claims about the current state of the world). Do NOT flag opinions, first-person reflection, rhetorical or narrative framing, or genre-normal statements as unsupported. Contradiction, clarity, and undefined-jargon checks are unchanged.`;
}

/**
 * Doc-tier (`missing_topic` / `structure_flow`) calibration block for a relaxed
 * class. Returns "" for non-relaxed classes (hash-stable).
 */
export function docCalibrationBlock(c: DocumentClass): string {
  if (!isRelaxedClass(c)) return "";
  return `\nDocument-type calibration — this is ${CLASS_LABELS[c]}, not a PRD or spec. Do NOT raise missing_topic or structure_flow for the absence of PRD sections (objective, scope, success metrics, timeline, risks); those are PRD constructs, not omissions here. Judge structure by the norms of this genre. Contradiction and clarity are unchanged.`;
}
