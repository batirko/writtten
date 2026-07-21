// ---------------------------------------------------------------------------
// The external-observation boundary.
//
// One entry point — `submitExternalObservation` — through which every
// observation from a connected agent session must pass. Pure: no transport, no
// DB, no UI. Everything it needs arrives in `ctx`; everything it decides comes
// back in the return value. The caller (the bridge client) owns the socket and
// the persistence.
//
// WHY THIS MODULE EXISTS, stated plainly: the product's one principle is
// "provoke, don't prescribe", and a general-purpose external agent cannot be
// held to it by prose. So we do not hold the *agent* to it — we hold the
// *boundary* to it. The agent is untrusted network input. Fixed taxonomy,
// register discipline, and locally-resolved anchoring are enforced here, in
// code the agent cannot negotiate with, argue past, or ask to elevate.
//
// What this boundary CANNOT enforce is insight quality. A dull, wrong, or
// merely surface-level observation phrased in clean declarative register will
// pass. That is the trust model's problem — the per-card source chip is the
// containment, and it is why external observations are visibly second-party in
// origin. Said honestly here rather than implied to be airtight.
//
// See docs/projects/agent_connected_eval.md § The boundary (the spec this
// implements, including the frozen rejection-code set).
// ---------------------------------------------------------------------------

import type { DismissalSuppression, Observation, ObservationSource } from "../store/db";
import type { SectionMember } from "./types";
import type { RegisterViolation } from "./registerLint";
import { lintRegister } from "./registerLint";
import { computePriority, KIND_BY_TYPE } from "./priority";
import { DOC_DEDUPE_FLOOR } from "./docReconcile";
import {
  anchorSubstring,
  isSpanSuppressed,
  spansOverlap,
  textSimilarity,
  type NewObservation,
} from "./evaluatorAnchoring";

// ---------------------------------------------------------------------------
// Constants (provisional — decision (e) of the 2026-07-19 design session;
// tune in PR3 if dogfooding argues)
// ---------------------------------------------------------------------------

/** Maximum simultaneously-active observations from a single source session. */
export const SOURCE_ACTIVE_BUDGET = 25;

/** Minimum spacing between submissions from one source, in milliseconds. */
export const MIN_SUBMISSION_SPACING_MS = 500;

/** Display names are attribution, not identity — kept short enough to sit in a chip. */
export const MAX_SOURCE_NAME_LENGTH = 32;

/** A lens label names a search; it is not a second body of prose on the card
 *  face. 60 clears the spec's own example labels with room to spare.
 *
 *  Note the cap governs STORED data, not what is visible: the feed column is
 *  320px, so the card header shows roughly the first 26 characters and
 *  ellipsizes the rest (full label on `title`). Measured against the real card
 *  at feed width during the 2026-07-21 prototype review; the owner chose the
 *  inline treatment with that tradeoff on the table. */
export const MAX_LENS_LABEL_LENGTH = 60;

/** Mirrors `registerLint`'s length cap, which is private to that module. Used
 *  only to phrase the rejection hint; the enforcement is the lint's own rule. */
const EXTERNAL_TEXT_CAP = 240;

/** The fixed taxonomy (invariant 2). All ten types are admissible to external
 *  sources. The cross-claim ones may carry a second quote (`conflictingAnchorText`,
 *  § _Both sides of a conflict_) but stay exempt from the evaluator's conflict
 *  lifecycle — that exemption keys on `isEvaluatorOwned`, not on the absence of
 *  `conflictingBlockId`, so the two are independent. */
const OBSERVATION_TYPES: ReadonlySet<string> = new Set<Observation["type"]>([
  "clarity",
  "contradiction",
  "strategic_tension",
  "unsupported_claim",
  "undefined_jargon",
  "underexposed_topic",
  "missing_topic",
  "structure_flow",
  "audience_mismatch",
  "user_lens",
]);

/**
 * Types only a connected agent can produce — the built-in evaluator has no
 * prompt for them and no path to them.
 *
 * This is one named concept with two consumers, and both matter:
 *   - `evalScorer`'s `PRECISION_FLOORS` subtracts it, so the eval ratchet never
 *     reports an agent-only type as a corpus "coverage gap" it owes work on.
 *   - `externalObservations.invariant.test.ts` asserts no built-in eval path can
 *     emit one, which turns "writtten never volunteers style critique" into a
 *     fact about the code rather than a claim about intent.
 *
 * The boundary is what makes a type agent-only, so the set lives here.
 */
export const AGENT_ONLY_TYPES = new Set<Observation["type"]>(["user_lens"]);

/** Types whose finding is defined by a user-supplied lens label rather than by
 *  the type itself. Required iff the type is in this set, rejected otherwise. */
const LENS_TYPES: ReadonlySet<string> = new Set<Observation["type"]>(["user_lens"]);

const SCOPES: ReadonlySet<string> = new Set<Observation["scope"]>(["span", "document"]);

const CONFIDENCES: ReadonlySet<string> = new Set<Observation["confidence"]>([
  "low",
  "medium",
  "high",
]);

/** The complete accepted field set. Anything else is `malformed` — an agent
 *  inventing `suggestedFix:` must hear a no, not have it silently dropped. */
const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  "type",
  "scope",
  "anchorText",
  "conflictingAnchorText",
  "text",
  "confidence",
  "lens",
]);

/** The two types whose finding is a *relationship between two passages*, and so
 *  the only ones for which a second quote means anything. Naming them here
 *  rather than testing `kind` keeps the rule readable at the rejection site. */
const CONFLICT_TYPES: ReadonlySet<string> = new Set<Observation["type"]>([
  "contradiction",
  "strategic_tension",
]);

/** The self-correction move for each register rule, so a rejected agent knows
 *  what to do differently rather than just that it failed. */
const RULE_HINTS: Record<RegisterViolation["rule"], string> = {
  question:
    "State the observation as a declarative sentence. Questions hand the thinking back as a prompt; name what you see instead.",
  prescriptive:
    "Locate the problem, do not prescribe the fix. Describe what is unclear or in tension; the author decides what to change.",
  hedge: "Drop the hedge and state the observation directly.",
  evaluative:
    "Name the structural fact, not a quality verdict. Say what the text does, not how good it is.",
  "claim-index":
    "Quote the document's own words instead of referring to a claim or block by an index number the author cannot see.",
  "section-number":
    "Refer to the section by its heading or subject; the document does not use the section numbering you invented.",
  length: `Say one thing. Split a multi-part observation into separate submissions, each at most ${EXTERNAL_TEXT_CAP} characters.`,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The frozen rejection vocabulary. Every code is machine-readable and paired
 *  with a `hint` describing the self-correction move, so a well-behaved agent
 *  can retry without a human in the loop. */
export type RejectionCode =
  | "malformed"
  | "unknown_type"
  | "invalid_scope"
  | "register_violation"
  | "anchor_unresolved"
  | "duplicate_suppressed"
  | "duplicate_active"
  | "source_budget_exceeded"
  | "rate_limited";

/** Everything the boundary needs, injected — so the module stays transport-free
 *  and unit-testable. The caller reads live state; the boundary only decides. */
export interface ExternalSubmissionContext {
  /** The live document's blocks, **in document order** (multi-match anchoring
   *  resolves to the first match, so order is load-bearing). */
  members: SectionMember[];
  /** Currently-active observations, all sources — the duplicate and budget bases. */
  activeObservations: Observation[];
  /** Dismissal suppressions for this document. Never disclosed to the agent. */
  suppressions: DismissalSuppression[];
  /** Who is submitting. `name` should already be through `sanitizeSourceName`. */
  source: ObservationSource;
  /** Current time (ms epoch), injected for determinism. */
  now: number;
  /** When this source last submitted (ms epoch), or undefined for its first. */
  lastSubmissionAt?: number;
}

export type SubmissionVerdict =
  | {
      ok: true;
      /** Ready to persist: anchored, priced, and stamped with its source.
       *  The caller assigns `id`/`docId`/`status`. */
      observation: NewObservation;
    }
  | {
      ok: false;
      code: RejectionCode;
      /** Present on `register_violation` — the lint's own rule id. */
      rule?: RegisterViolation["rule"];
      /** What to do differently. Written for the agent, not for a log. */
      hint: string;
      /** Present on `duplicate_active` — the existing card that already covers
       *  this, so the agent knows the ground is taken rather than that it erred. */
      observationId?: string;
    };

/** The submission payload, once it has survived the shape check. */
interface ParsedSubmission {
  type: Observation["type"];
  scope: Observation["scope"];
  text: string;
  anchorText?: string;
  /** The counterpart passage, for conflict types only. Optional: an agent that
   *  cannot quote the other side submits single-anchor, exactly as before. */
  conflictingAnchorText?: string;
  confidence?: Observation["confidence"];
  /** The user's own words for the search. Present iff `type` is a lens type;
   *  already sanitized and capped by `parseSubmission`. */
  lens?: string;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Validate one agent-submitted observation and, if it survives, return the
 * observation to persist.
 *
 * `input` is typed `unknown` on purpose: this is the trust boundary, and stage 1
 * is the parse. Nothing upstream of here is believed.
 *
 * Stage order follows the spec (§ The boundary 1–8) and is part of the frozen
 * contract, because it determines which code an agent sees when a submission
 * fails several stages at once. Note the consequence: the source-level gates
 * (budget, rate) run *last*, so a flooding agent still gets specific feedback on
 * a malformed payload rather than a bare `rate_limited`. That is deliberate —
 * the caps exist to bound damage, not to punish, and precise feedback is what
 * lets an agent self-correct instead of retrying blind.
 */
export function submitExternalObservation(
  input: unknown,
  ctx: ExternalSubmissionContext
): SubmissionVerdict {
  // --- 1. malformed ---------------------------------------------------------
  const parsed = parseSubmission(input);
  if (!parsed.ok) return parsed.verdict;
  const sub = parsed.value;

  // --- 2. unknown_type ------------------------------------------------------
  if (!OBSERVATION_TYPES.has(sub.type)) {
    return {
      ok: false,
      code: "unknown_type",
      hint: `"${sub.type}" is not an observation type. The taxonomy is fixed and closed — use one of: ${[...OBSERVATION_TYPES].join(", ")}. If what you noticed fits none of them, it is not an observation this product surfaces.`,
    };
  }

  // --- 3. invalid_scope -----------------------------------------------------
  if (!SCOPES.has(sub.scope)) {
    return {
      ok: false,
      code: "invalid_scope",
      hint: `"${sub.scope}" is not a scope. Use "span" for an observation about a specific passage (with anchorText), or "document" for one about the document as a whole.`,
    };
  }
  if (sub.scope === "span" && (sub.anchorText == null || sub.anchorText.trim() === "")) {
    return {
      ok: false,
      code: "invalid_scope",
      hint: 'A "span" submission needs anchorText: the verbatim passage it is about. Either supply it, or use scope "document".',
    };
  }
  if (sub.scope === "document" && sub.anchorText != null) {
    return {
      ok: false,
      code: "invalid_scope",
      hint: 'A "document" submission must not carry anchorText. If the observation is about a specific passage, submit it with scope "span" instead.',
    };
  }
  // The second quote is meaningful only where the finding IS a relationship
  // between two passages. Rejected rather than ignored elsewhere, per the
  // no-silent-drop rule that governs every unknown field: an agent attaching a
  // counterpart to a `clarity` card has misunderstood the type, and hearing so
  // is what corrects it.
  if (sub.conflictingAnchorText != null) {
    if (!CONFLICT_TYPES.has(sub.type)) {
      return {
        ok: false,
        code: "invalid_scope",
        hint: `conflictingAnchorText names the passage a finding conflicts WITH, so it applies only to ${[...CONFLICT_TYPES].join(" and ")}. A "${sub.type}" observation is about one passage; drop the second quote.`,
      };
    }
    if (sub.scope !== "span") {
      return {
        ok: false,
        code: "invalid_scope",
        hint: 'A conflict between two passages is a "span" observation anchored on the first of them, with conflictingAnchorText naming the second. Supply anchorText and scope "span", or drop conflictingAnchorText.',
      };
    }
  }

  // --- 4. register_violation ------------------------------------------------
  // Every rule is hard here, INCLUDING `length`, which the internal prompt
  // ratchet treats as soft. The asymmetry is intentional: our own model output
  // is reviewed against a fixture corpus and can earn an over-long
  // contradiction that names both anchors; an unratcheted external source has
  // no such standing, and the 240-char bound is the cheapest available proxy
  // for "one observation is one thought".
  // Passing `{ type }` is required — the claim-index and section-number rules
  // are type-gated and silently no-op without it.
  const violations = lintRegister(sub.text, { type: sub.type });
  if (violations.length > 0) {
    const v = violations[0];
    return {
      ok: false,
      code: "register_violation",
      rule: v.rule,
      hint: `${RULE_HINTS[v.rule]} (${v.detail})`,
    };
  }

  // --- 5. anchor_unresolved -------------------------------------------------
  // Resolved locally, against the live document. The agent supplies a quote and
  // never learns block identity or offsets — a snapshot API cannot become a
  // handle on the document's internals.
  let blockId: string | undefined;
  let startOffset: number | undefined;
  let endOffset: number | undefined;
  let anchorQuote: string | undefined;

  if (sub.scope === "span") {
    const anchored = resolveQuote(ctx, sub.anchorText as string);
    if (!anchored) {
      // Hard reject rather than degrading to document scope: silent degradation
      // would teach the agent that sloppy anchoring works.
      return {
        ok: false,
        code: "anchor_unresolved",
        hint: "anchorText does not appear in the document. Quote at least ~6 consecutive words verbatim — exact characters, including case and punctuation — copied from the snapshot.",
      };
    }
    blockId = anchored.blockId;
    startOffset = anchored.startOffset;
    endOffset = anchored.endOffset;
    anchorQuote = anchored.sourceSlice;
  }

  // The counterpart side. Same machinery, same hard-reject rule — and the
  // symmetry is the point: half a resolved conflict rendered as a single
  // highlight is exactly the defect this field exists to fix (UX-037), so
  // accepting it silently would reintroduce the bug and hide the cause.
  //
  // Rejection is affordable here precisely because the field is OPTIONAL. An
  // agent that cannot quote the other side omits it and gets the old
  // single-anchor card; one that supplied it opted in, has the document in
  // front of it, and can retry within the same pass.
  let conflictingBlockId: string | undefined;
  let conflictingStartOffset: number | undefined;
  let conflictingEndOffset: number | undefined;
  let conflictingQuote: string | undefined;

  if (sub.conflictingAnchorText != null) {
    const other = resolveQuote(ctx, sub.conflictingAnchorText);
    if (!other) {
      return {
        ok: false,
        code: "anchor_unresolved",
        hint: "conflictingAnchorText does not appear in the document. Quote at least ~6 consecutive words verbatim from the passage this one conflicts with — or omit the field and submit the observation with a single anchor.",
      };
    }
    // Both quotes landing on the same characters means the agent named one
    // passage twice; there is no second side to show, and rendering it would
    // draw one highlight while claiming two. Same block is fine — a paragraph
    // can contradict itself — but the same span is not.
    if (
      other.blockId === blockId &&
      other.startOffset === startOffset &&
      other.endOffset === endOffset
    ) {
      return {
        ok: false,
        code: "anchor_unresolved",
        hint: "anchorText and conflictingAnchorText resolved to the same passage. Quote the two different passages that are in tension; if the tension is within one statement, submit it with a single anchor.",
      };
    }
    conflictingBlockId = other.blockId;
    conflictingStartOffset = other.startOffset;
    conflictingEndOffset = other.endOffset;
    conflictingQuote = other.sourceSlice;
  }

  const { severity, confidence, priority } = computePriority({
    type: sub.type,
    externalConfidence: sub.confidence,
  });

  const candidate: NewObservation = {
    type: sub.type,
    scope: sub.scope,
    kind: KIND_BY_TYPE[sub.type],
    severity,
    confidence,
    priority,
    text: sub.text,
    ...(blockId != null ? { blockId, startOffset, endOffset } : {}),
    ...(sub.anchorText != null ? { anchorText: sub.anchorText } : {}),
    ...(anchorQuote != null ? { anchorQuote } : {}),
    // Stored as the document's own words, not the agent's rendering of them —
    // the same rule `anchorQuote` follows for the primary side. The highlighter
    // and the archive card both read `conflictingAnchorText`, so it must be the
    // slice that re-anchors, not the submitted paraphrase.
    ...(conflictingBlockId != null
      ? {
          conflictingBlockId,
          conflictingStartOffset,
          conflictingEndOffset,
          conflictingAnchorText: conflictingQuote,
        }
      : {}),
    source: ctx.source,
    // Names WHICH SEARCH THE USER ASKED FOR, on lens cards only. See the card
    // face in SidecarFeed.tsx for why this is not the source chip returning.
    ...(sub.lens != null ? { lens: sub.lens } : {}),
  };

  // --- 6. duplicate_suppressed ---------------------------------------------
  // Runs after anchoring because the check keys off the resolved span. The
  // suppression list is never exposed to the agent — not the matched entry, not
  // its scope, not a count. Handing an agent the list of what the user has
  // dismissed would invite it to self-censor whole categories, which is exactly
  // the sycophancy that flattery-resistant dismissal (G1) exists to prevent.
  // Symmetric with the built-in evaluator, which also never sees suppressions.
  if (isSpanSuppressed(candidate, ctx.suppressions)) {
    return {
      ok: false,
      code: "duplicate_suppressed",
      hint: "The author has already dismissed this observation. Do not resubmit it or a rephrasing of it.",
    };
  }

  // --- 7. duplicate_active --------------------------------------------------
  const duplicate = findActiveDuplicate(candidate, ctx.activeObservations);
  if (duplicate) {
    return {
      ok: false,
      code: "duplicate_active",
      observationId: duplicate.id,
      hint: "An active observation already covers this. No action needed — it is in the feed.",
    };
  }

  // --- 8. source_budget_exceeded / rate_limited -----------------------------
  const activeFromSource = ctx.activeObservations.filter(
    (o) => o.source?.sessionId === ctx.source.sessionId
  ).length;
  if (activeFromSource >= SOURCE_ACTIVE_BUDGET) {
    return {
      ok: false,
      code: "source_budget_exceeded",
      hint: `You have ${activeFromSource} active observations, the maximum of ${SOURCE_ACTIVE_BUDGET}. The feed competes for a reader's attention; submit again once some are addressed or dismissed.`,
    };
  }
  if (
    ctx.lastSubmissionAt != null &&
    ctx.now - ctx.lastSubmissionAt < MIN_SUBMISSION_SPACING_MS
  ) {
    return {
      ok: false,
      code: "rate_limited",
      hint: `Submissions must be at least ${MIN_SUBMISSION_SPACING_MS}ms apart. Wait and retry.`,
    };
  }

  return { ok: true, observation: candidate };
}

/**
 * Normalize an agent's self-reported display name for use as attribution.
 * Strips control characters, collapses whitespace, and truncates. Never throws
 * and never returns empty — a source always has something to show in its chip.
 */
export function sanitizeSourceName(raw: unknown): string {
  if (typeof raw !== "string") return "Agent";
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SOURCE_NAME_LENGTH)
    .trim();
  return cleaned === "" ? "Agent" : cleaned;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ParseResult =
  | { ok: true; value: ParsedSubmission }
  | { ok: false; verdict: Extract<SubmissionVerdict, { ok: false }> };

function malformed(hint: string): ParseResult {
  return { ok: false, verdict: { ok: false, code: "malformed", hint } };
}

/**
 * Resolve one agent-supplied quote against the live document.
 *
 * Shared by both sides of a conflict so they cannot drift: if the primary
 * anchor tolerates trailing punctuation and falls back to case-insensitive
 * matching, the counterpart must too, or an agent would face two different
 * standards for two quotes lifted the same way out of the same document.
 *
 * `sourceSlice` is the document's own characters for the resolved range, which
 * may differ in case from what the agent sent. Cards quote the document, never
 * the agent's rendering of it.
 */
function resolveQuote(
  ctx: ExternalSubmissionContext,
  quote: string
): { blockId: string; startOffset: number; endOffset: number; sourceSlice?: string } | null {
  // Same trailing-punctuation tolerance the evaluator's own claim anchoring
  // uses (anchorClaimsToMembers), for a quote lifted out of mid-sentence.
  const anchored =
    anchorSubstring(ctx.members, quote) ??
    anchorSubstring(ctx.members, quote.replace(/[.,;:!?]+$/, ""));
  if (!anchored) return null;
  const member = ctx.members.find((m) => m.blockId === anchored.blockId);
  return {
    blockId: anchored.blockId,
    startOffset: anchored.startOffset,
    endOffset: anchored.endOffset,
    sourceSlice: member?.text.slice(anchored.startOffset, anchored.endOffset),
  };
}

function parseSubmission(input: unknown): ParseResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return malformed("A submission must be a JSON object.");
  }
  const raw = input as Record<string, unknown>;

  const unknownFields = Object.keys(raw).filter((k) => !ALLOWED_FIELDS.has(k));
  if (unknownFields.length > 0) {
    return malformed(
      `Unknown field(s): ${unknownFields.join(", ")}. A submission carries only ${[...ALLOWED_FIELDS].join(", ")}. There is no field for proposing an edit, a fix, or replacement text — the protocol has no such message, by design.`
    );
  }

  if (typeof raw.type !== "string") return malformed('"type" is required and must be a string.');
  if (typeof raw.scope !== "string") return malformed('"scope" is required and must be a string.');
  if (typeof raw.text !== "string") return malformed('"text" is required and must be a string.');
  if (raw.text.trim() === "") return malformed('"text" must not be empty.');

  if (raw.anchorText !== undefined && typeof raw.anchorText !== "string") {
    return malformed('"anchorText" must be a string when present.');
  }
  if (raw.conflictingAnchorText !== undefined) {
    if (typeof raw.conflictingAnchorText !== "string") {
      return malformed('"conflictingAnchorText" must be a string when present.');
    }
    if (raw.conflictingAnchorText.trim() === "") {
      return malformed(
        '"conflictingAnchorText" must not be empty. Omit the field entirely if you are not naming a second passage.'
      );
    }
  }
  if (raw.confidence !== undefined) {
    if (typeof raw.confidence !== "string" || !CONFIDENCES.has(raw.confidence)) {
      return malformed('"confidence" must be one of: low, medium, high.');
    }
  }

  // The lens label is what parameterizes `user_lens`, so its presence rule is a
  // field-presence rule conditional on `type` — exactly what `malformed`
  // already covers. Handled here rather than as a new stage so the frozen
  // 8-stage order and the frozen `RejectionCode` vocabulary stay untouched.
  //
  // Note this runs BEFORE the stage-2 taxonomy check, so an unrecognized type
  // carrying a lens still gets `unknown_type` — the more useful message.
  const isLensType = LENS_TYPES.has(raw.type);
  let lens: string | undefined;
  if (raw.lens !== undefined) {
    if (!isLensType) {
      return malformed(
        `"lens" names the user-requested search a finding came from, so it applies only to ${[...LENS_TYPES].join(" and ")}. A "${raw.type}" observation is one of writtten's own checks; drop the lens label.`
      );
    }
    if (typeof raw.lens !== "string") return malformed('"lens" must be a string when present.');
    lens = sanitizeLensLabel(raw.lens);
    if (lens === "") {
      return malformed(
        '"lens" must not be empty. It is the user\'s own words for what they asked you to look for.'
      );
    }
  } else if (isLensType) {
    return malformed(
      `A "${raw.type}" submission needs "lens": the user's own words for what they asked you to look for, verbatim — not your paraphrase and not a category you invented. Without it there is no way to show the author which search this came from.`
    );
  }

  return {
    ok: true,
    value: {
      // Narrowed against the taxonomy at stage 2, not here — an unknown type
      // deserves its own code, not a shape error.
      type: raw.type as Observation["type"],
      scope: raw.scope as Observation["scope"],
      text: raw.text,
      ...(raw.anchorText !== undefined ? { anchorText: raw.anchorText as string } : {}),
      ...(raw.conflictingAnchorText !== undefined
        ? { conflictingAnchorText: raw.conflictingAnchorText as string }
        : {}),
      ...(raw.confidence !== undefined
        ? { confidence: raw.confidence as Observation["confidence"] }
        : {}),
      ...(lens !== undefined ? { lens } : {}),
    },
  };
}

/**
 * Normalize a user-supplied lens label for display on a card face.
 *
 * Same treatment as `sanitizeSourceName` — strip control characters, collapse
 * whitespace, truncate — with one deliberate difference: this returns "" rather
 * than a fallback string when nothing survives. A source with no name can
 * honestly be called "Agent"; a lens with no label cannot be invented, because
 * the label is the user's own words and inventing one would put text on the card
 * face that the user never wrote. The caller rejects the submission instead.
 */
function sanitizeLensLabel(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_LENS_LABEL_LENGTH)
      .trim()
  );
}

/**
 * Is an active card already covering this? Span submissions collide on
 * (type, block, overlapping span) — `spansOverlap` deliberately ignores
 * blockId, so it is compared here. Doc-scope submissions collide on near-
 * identical wording, at the same threshold the doc-scope reconciler uses, so an
 * agent's rephrasing of a note already in the feed is caught the same way the
 * evaluator's own rephrasing is.
 */
function findActiveDuplicate(
  candidate: NewObservation,
  active: Observation[]
): Observation | undefined {
  return active.find((o) => {
    if (o.type !== candidate.type) return false;
    if (candidate.scope === "span") {
      return o.blockId != null && o.blockId === candidate.blockId && spansOverlap(o, candidate);
    }
    return o.scope === "document" && textSimilarity(o.text, candidate.text) >= DOC_DEDUPE_FLOOR;
  });
}
