// ---------------------------------------------------------------------------
// Register lint + tone classifier — the emotional-register guard.
//
// Pure module: no DB, no network, no side effects. Two exports:
//
//   lintRegister(message, opts?) → RegisterViolation[]
//     The *structural* register rules, extracted verbatim from the inline block
//     that used to live in evalRatchet.test.ts. This is the single source of
//     truth the Tier-1 ratchet asserts against (every produced observation must
//     lint clean). Behaviour-identical to the old inline block so recordings
//     stay green. Enforces the Phase-4 G3 rules + the Phase-6 voice/copy guide
//     mechanical rules (docs/projects/emotional_register.md § Voice & copy guide).
//
//   classifyTone(message) → ToneLabel
//     The *felt-tone* classifier for the eval dimension. Richer feature
//     detection (adds praise / meta-commentary / emoji families on top of the
//     structural rules) that sorts a message into one of the four tone buckets.
//     `colleague` is the only passing value. Deterministic, quota-free — this is
//     what makes tone a *measured* dimension rather than an asserted one.
//     See docs/projects/emotional_register.md § Tone as an eval dimension.
// ---------------------------------------------------------------------------

import type { Observation } from "../store/db";
import type { ToneLabel } from "./eval-fixtures/tone-corpus";

export type { ToneLabel };

/** One register-rule violation found in a message. */
export interface RegisterViolation {
  /** Machine-readable rule id. */
  rule:
    | "question"
    | "prescriptive"
    | "hedge"
    | "evaluative"
    | "claim-index"
    | "section-number"
    | "length";
  /** Human-readable explanation, suitable for a test failure message. */
  detail: string;
  /**
   * `false` for a hard violation (the ratchet fails on it); `true` for a soft
   * warning that should be surfaced (via console.warn) but not fail — currently
   * only the 240-char length cap.
   */
  soft?: boolean;
}

// --- Shared lexicons -------------------------------------------------------
// Kept module-private so lintRegister and classifyTone can't drift apart.

/** Prescriptive / imperative "here's the fix" patterns (G3: locate, don't prescribe).
 *
 *  The `consider <verb>ing` and bare-imperative families were extended
 *  2026-07-19 while building the external-observation boundary
 *  (docs/projects/agent_connected_eval.md), which makes this lint a **hard
 *  reject** on untrusted input. Probing it with the most archetypal
 *  prescriptions an agent would send — "Change this to…", "Consider
 *  rewriting…", "Replace this with…" — found all of them passing: the list
 *  covered the *polite* prescriptions ("I suggest", "you should") but not the
 *  *imperative* ones, which are the more direct violation of the principle.
 *  The additions apply to our own model output too, which is correct — the
 *  evaluator should never emit these either. */
const PRESCRIPTIVE_PATTERNS = [
  "you need to",
  "you should",
  "we should",
  "consider changing",
  "consider adding",
  "consider rewriting",
  "consider revising",
  "consider rephrasing",
  "consider removing",
  "consider moving",
  "consider replacing",
  "consider clarifying",
  "it might be helpful",
  "it would be helpful",
  "i suggest",
  "i recommend",
  "change this to",
  "change it to",
  "replace this with",
  "rewrite this",
  "reword this",
];

/** Hedge / softener words (emotional register rule 4 — a sure colleague doesn't hedge). */
const HEDGE_WORDS = ["perhaps", "you may want to", "feels like", "i'd suggest", "i would suggest"];

/** Evaluative quality verdicts on the work (emotional register rule 5). */
const EVALUATIVE_PATTERNS = [
  "is weak",
  "is bad",
  "is poor",
  "is insufficient",
  "won't convince",
  "will not convince",
];

/**
 * Evaluator-internal bookkeeping-index leak into user-facing copy. Catches the
 * contradiction/tension `Claim #N` form (UX-017) AND the doc-level `claim [3]` /
 * `claims [1] and [2]` / `block [2]` bracket forms (OBS-034). Matches
 * claim(s)/block + optional `#`/`[` + digit; the bare phrase "the existing
 * claim" (no number) is ordinary English and does NOT match.
 */
const CLAIM_INDEX_RE = /\b(?:claims?|blocks?)\s*#?\s*\[?\s*\d+/i;

/**
 * A fabricated `§N` section reference (OBS-034). The doc-level model receives a
 * numbered `[N]` summary list, not the document's own section numbers, so any
 * `§3` it emits addresses nothing the author can see. Only meaningful for the
 * doc-level observation types (a real span-scoped note can legitimately quote a
 * `§2` the author actually wrote).
 */
const SECTION_NUMBER_RE = /§\s*\d+/;

/** The doc-level (unanchored) observation types — their `text` is the whole card. */
const DOC_LEVEL_TYPES: ReadonlySet<Observation["type"]> = new Set([
  "missing_topic",
  "underexposed_topic",
  "audience_mismatch",
  "structure_flow",
]);

/** Length soft cap — one observation is one thought (§ Voice & copy guide rule 1). */
const LENGTH_SOFT_CAP = 240;

/**
 * The structural register lint. Returns every violation found; an empty array
 * means the message is register-clean. `opts.type` enables the type-specific
 * claim-index rule (only meaningful for contradiction / strategic_tension).
 */
export function lintRegister(
  message: string,
  opts?: { type?: Observation["type"] }
): RegisterViolation[] {
  const violations: RegisterViolation[] = [];
  const textLow = message.toLowerCase();

  // 1. No questions (catches Socratic / rhetorical "Have you considered...?").
  if (message.includes("?")) {
    violations.push({
      rule: "question",
      detail: `message contains a question mark; must be a direct statement — "${message}"`,
    });
  }

  // 2. No prescriptive / imperative patterns — locate, don't prescribe.
  for (const pattern of PRESCRIPTIVE_PATTERNS) {
    if (textLow.includes(pattern)) {
      violations.push({
        rule: "prescriptive",
        detail: `message contains prescriptive pattern "${pattern}" — "${message}"`,
      });
    }
  }

  // 3. No hedge words — the colleague voice is confident.
  for (const hedge of HEDGE_WORDS) {
    if (textLow.includes(hedge)) {
      violations.push({
        rule: "hedge",
        detail: `message contains hedge word "${hedge}" — "${message}"`,
      });
    }
  }

  // 4. No evaluative adjectives — name structural facts, not quality verdicts.
  for (const adj of EVALUATIVE_PATTERNS) {
    if (textLow.includes(adj)) {
      violations.push({
        rule: "evaluative",
        detail: `message contains evaluative judgment "${adj}" — "${message}"`,
      });
    }
  }

  // 5. No evaluator-internal index labels in message-bearing copy. Applies to
  //    contradiction/tension (UX-017: `Claim #N`) and the doc-level types
  //    (OBS-034: `claim [3]`, `claims [1] and [2]`, `block [2]`). The bare phrase
  //    "the existing claim" (no number) is ordinary English and does NOT match.
  const indexLeakTypes =
    opts?.type === "contradiction" ||
    opts?.type === "strategic_tension" ||
    (opts?.type != null && DOC_LEVEL_TYPES.has(opts.type));
  if (indexLeakTypes && CLAIM_INDEX_RE.test(message)) {
    violations.push({
      rule: "claim-index",
      detail: `message references a claim/block by its internal index label; must quote the content's words — "${message}"`,
    });
  }

  // 6. No fabricated `§N` section numbers in doc-level copy (OBS-034). The model
  //    is fed a positional `[N]` list, not the document's own numbering, so any
  //    `§N` it emits points at nothing the author can see.
  if (opts?.type != null && DOC_LEVEL_TYPES.has(opts.type) && SECTION_NUMBER_RE.test(message)) {
    violations.push({
      rule: "section-number",
      detail: `message invents a "§N" section number the document does not use; refer to content by heading or subject — "${message}"`,
    });
  }

  // 7. Length soft cap: ≤ 240 chars. SOFT — a 250-char contradiction that names
  //    both anchors is better than a truncated one (§ Voice & copy guide rule 1).
  if (message.length > LENGTH_SOFT_CAP) {
    violations.push({
      rule: "length",
      soft: true,
      detail: `message exceeds ${LENGTH_SOFT_CAP}-char soft cap (${message.length} chars) — "${message}"`,
    });
  }

  return violations;
}

// --- Tone classifier -------------------------------------------------------
// The four tone buckets, sorted by a FIXED precedence so a message with several
// failing features lands deterministically on the most-severe one:
//
//     condescending  →  pedant  →  cold  →  colleague
//
// Rationale (docs/projects/emotional_register.md § Tone as an eval dimension):
// the five wrong personas map onto four labels. `boss` → condescending (verdicts),
// `pedant`/`linter`/`therapist` → pedant (teacherly / over-explaining / soft),
// `smartass` → cold (gotchas / irony). Folding the soft "therapist" failure into
// `pedant` — "too much talk, not enough respect for the reader's competence" — is
// the one taste call, made with the user (keep 4 labels, no ToneLabel churn).

/** Evaluative quality verdicts on the work → condescending. Excludes strong/good/great (meta/praise). */
const CONDESCENDING_TERMS = [
  "weak",
  "poor",
  "bad",
  "insufficient",
  "mediocre",
  "won't convince",
  "will not convince",
];

/**
 * Teacherly meta-commentary / surface-nit framing → pedant. Includes the linter's
 * "Consider revising…" prescription and "detected" nit-report tell. NB: bare
 * "consider" is deliberately NOT here — it collides with the "Have you considered…"
 * gotcha, which is a `cold` failure (see COLD_PATTERNS + the "?" check below).
 */
const META_PATTERNS = [
  "note that",
  "common oversight",
  "it's important",
  "it is important",
  "a strong",
  "should define",
  "keep in mind",
  "remember that",
  "consider revising",
  "detected in",
];

/** Praise / validation → pedant (the soft "therapist" failure). */
const PRAISE_PATTERNS = ["great work", "good job", "well done", "great job", "nicely done"];

/** Softening hedges → pedant. Broader than the structural HEDGE_WORDS list. */
const SOFT_HEDGE_PATTERNS = [
  "might",
  "perhaps",
  "maybe",
  "feels",
  "gently",
  "it might be worth",
  "you may want to",
];

/** Gotcha framing → cold. */
const COLD_PATTERNS = ["have you considered", "actually want"];

/** Any emoji (Extended_Pictographic) → cold. */
const EMOJI_RE = /\p{Extended_Pictographic}/u;

/**
 * Sort a message into one of the four tone buckets. `colleague` is the only
 * passing value. Deterministic and quota-free — the CI drift guard for voice.
 */
export function classifyTone(message: string): ToneLabel {
  const textLow = message.toLowerCase();
  const has = (patterns: string[]) => patterns.some((p) => textLow.includes(p));

  // Precedence: most-severe failing family first.
  if (has(CONDESCENDING_TERMS)) return "condescending";
  if (has(META_PATTERNS) || has(PRAISE_PATTERNS) || has(SOFT_HEDGE_PATTERNS)) return "pedant";
  if (message.includes("?") || EMOJI_RE.test(message) || has(COLD_PATTERNS)) return "cold";
  return "colleague";
}
