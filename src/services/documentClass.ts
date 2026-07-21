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
 * The three non-PRD *work* genres that carry an explicit genre label in their
 * calibration block. `prd_spec` is the strict anchor (no block, hash-stable);
 * `unknown` is NOT in this set but since OBS-036 it emits its own *softened
 * cold-open* block (see `sectionCalibrationBlock`/`docCalibrationBlock`) — so
 * "relaxed genre" (labelled) and "emits a calibration block" are no longer the
 * same thing. Only `prd_spec` leaves request hashes unchanged now.
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
 * Section-tier (`unsupported_claim`) calibration block.
 *
 * `prd_spec` returns "" (full strictness — the strict anchor, hash-stable). The
 * three relaxed genres each get a genre-labelled block. `unknown` gets a
 * softened cold-open block (OBS-036): an un-staged doc classifies as `unknown`
 * and, before the doc-idle inference has a chance to set a stage, used to get
 * full PRD strictness on the very first pass — flagging a rhetorical apprehension
 * in a cold essay as `unsupported_claim`. Since the un-staged cold-open is the
 * *common* case, `unknown` now leans toward the essay/comms floor on
 * `unsupported_claim` until a class is confirmed, while keeping
 * `contradiction`/`clarity`/`undefined_jargon` fully on. Instructions ride in
 * user content, not the static system prompt.
 *
 * OBS-037 (Lever 1): the relaxed genres AND `unknown` also carry an *extraction*
 * rule — rhetorical/hyperbolic emphasis and narrative color are not claims of any
 * kind. Keeping hyperbole ("a HUGE thing", "the tipping point") out of the ledger
 * starves the downstream false-`unsupported_claim` + regenerating-false-tension
 * cascade of its fuel. `prd_spec` stays untouched (hash-stable strict anchor); the
 * rule grows the block for relaxed/`unknown` sections, so their recorded request
 * hashes shift and are re-keyed byte-identically offline (responses unchanged).
 * See docs/projects/document_type_calibration.md § Extraction & tension
 * calibration for rhetoric.
 */
export function sectionCalibrationBlock(c: DocumentClass): string {
  if (c === "prd_spec") return "";
  if (c === "unknown") {
    return `\nDocument-type calibration — the document type is not yet identified. Until it is, do not assume this is a PRD or spec: apply unsupported_claim ONLY to hard, checkable external-fact assertions (statistics, claims about the current state of the world). Do NOT flag opinions, first-person reflection, rhetorical or narrative framing, or genre-normal statements as unsupported. Also do NOT extract rhetorical or hyperbolic emphasis, narrative color, or evaluative flourishes ("X was a HUGE thing", "the tipping point for the revolution") as claims of any kind — extract only assertions the author is genuinely committing to, constrained by, or would cite. Contradiction, clarity, and undefined-jargon checks are unchanged.`;
  }
  return `\nDocument-type calibration — this is ${CLASS_LABELS[c]}, not a PRD or spec. Apply unsupported_claim ONLY to hard, checkable external-fact assertions (statistics, claims about the current state of the world). Do NOT flag opinions, first-person reflection, rhetorical or narrative framing, or genre-normal statements as unsupported. Also do NOT extract rhetorical or hyperbolic emphasis, narrative color, or evaluative flourishes ("X was a HUGE thing", "the tipping point for the revolution") as claims of any kind — extract only assertions the author is genuinely committing to, constrained by, or would cite. Contradiction, clarity, and undefined-jargon checks are unchanged.`;
}

/**
 * Doc-tier (`missing_topic` / `structure_flow`) calibration block. `prd_spec`
 * returns "" (hash-stable); the relaxed genres and `unknown` (OBS-036 cold-open,
 * until a class is confirmed) suppress PRD-structural expectations.
 */
export function docCalibrationBlock(c: DocumentClass): string {
  if (c === "prd_spec") return "";
  if (c === "unknown") {
    return `\nDocument-type calibration — the document type is not yet identified. Until it is, do not raise missing_topic or structure_flow for the absence of PRD sections (objective, scope, success metrics, timeline, risks); those are PRD constructs, not omissions in an unknown document type. Contradiction and clarity are unchanged.`;
  }
  return `\nDocument-type calibration — this is ${CLASS_LABELS[c]}, not a PRD or spec. Do NOT raise missing_topic or structure_flow for the absence of PRD sections (objective, scope, success metrics, timeline, risks); those are PRD constructs, not omissions here. Judge structure by the norms of this genre. Contradiction and clarity are unchanged.`;
}

/**
 * The same calibration policy, addressed to a **connected agent** (OBS-039).
 *
 * Why this exists rather than concatenating the two blocks above: those are written for
 * our own two-stage pipeline and spend most of their words on what to *extract into the
 * claim ledger*. An external agent has no extraction stage and no ledger — it reads the
 * document and posts observations in one pass — so that half is not merely redundant to
 * it, it describes machinery it cannot see. What transfers is the policy: which checks
 * relax off-genre, and which stay fully on.
 *
 * Both tiers are folded into one block because an agent does both in a single pass.
 * `prd_spec` returns "" for the same reason it does above — it is the strict baseline, and
 * the snapshot says so rather than sending an empty-looking instruction. This is the only
 * calibration a BYOA review ever receives: the boundary validates taxonomy and register,
 * but a PRD-strict observation on a personal essay is register-clean and taxonomy-valid,
 * so it is accepted. Nothing downstream can catch a miscalibrated card.
 */
export function agentCalibrationBlock(c: DocumentClass): string {
  if (c === "prd_spec") return "";
  const subject =
    c === "unknown"
      ? "The document type is not yet identified, so do not assume this is a PRD or spec."
      : `This is ${CLASS_LABELS[c]}, not a PRD or spec.`;
  return `${subject} Raise unsupported_claim ONLY for hard, checkable external-fact assertions — statistics, or claims about the current state of the world. Opinions, first-person reflection, rhetorical or narrative framing, hyperbolic emphasis, and genre-normal statements are not unsupported claims here, and neither are they strategic tensions. Do not raise missing_topic or structure_flow for the absence of PRD sections (objective, scope, success metrics, timeline, risks) — those are PRD constructs, not omissions in this genre; judge structure by the norms of this kind of writing. Contradiction, clarity, and undefined_jargon are unchanged and fully in play.`;
}
