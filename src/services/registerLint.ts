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

// G3b (2026-07-19) — the three lexicons below used to be literal-substring
// denylists. They were replaced by grammar anchors after a probe pass found
// 28/28 realistic critic phrasings passing (docs/projects/philosophy_guardrails.md
// § G3b). A denylist against natural language is unwinnable: every widening both
// misses the next phrasing and risks *over*-rejection, because the anti-taxonomy
// vocabulary overlaps the taxonomy's own ("unclear" is a quality verdict AND a
// legitimate `clarity` finding). Each rule below is anchored on a grammatical
// position rather than a word, so it retires a whole family at once.
//
// The adversarial corpus that keeps this honest: eval-fixtures/register-lint-corpus.ts.

/**
 * RULE 1 — imperative-initial. A closed list of editing/revision verbs in *base
 * form*. The rule fires when a sentence *opens* with one, which is what makes it
 * an imperative ("Add a measurement window.") rather than a noun or a gerund
 * ("Migration of accounts is mentioned once."; "Blocking every transaction pulls
 * against…" — both stay clean, and both are real observation phrasings).
 *
 * Base form only, deliberately: the gerund and third-person forms of these same
 * verbs are how the product's own voice *locates* things ("The section adds…",
 * "Defining adoption is left to the reader"), so inflected forms must not fire.
 */
const EDITING_VERBS = [
  // add / remove
  "add",
  "include",
  "insert",
  "append",
  "remove",
  "delete",
  "cut",
  "drop",
  "omit",
  // replace / rewrite
  "change",
  "replace",
  "swap",
  "rewrite",
  "reword",
  "rephrase",
  "revise",
  "edit",
  "update",
  "fix",
  "correct",
  "adjust",
  "amend",
  // restructure
  "move",
  "reorder",
  "restructure",
  "reorganize",
  "split",
  "merge",
  "combine",
  "expand",
  "shorten",
  "tighten",
  "trim",
  "condense",
  "simplify",
  "break",
  // specify / justify
  "define",
  "clarify",
  "specify",
  "state",
  "explain",
  "describe",
  "detail",
  "document",
  "justify",
  "support",
  "cite",
  "quantify",
  "measure",
  "name",
  "list",
  "provide",
  "give",
  "show",
  "spell",
  "flesh",
  // directive framing
  "make",
  "consider",
  "ensure",
  "avoid",
  "use",
  "try",
  "check",
  "review",
  "reconsider",
  "rethink",
  "address",
  "resolve",
  "align",
  "tie",
  "link",
  "connect",
  "set",
  "pick",
  "choose",
  "note",
  "mention",
];

/**
 * Words that, following an editing verb, mark it as a *noun* rather than an
 * imperative — "Support for the 40% figure is absent.", "Use of 'shadow ledger'
 * is inconsistent.", "Note that…" is caught separately as meta-commentary.
 * Without this guard the ~40-verb list would reject legitimate noun-initial
 * observations, which is the over-rejection failure mode the corpus guards.
 */
const NOUN_AFTER_VERB = new Set(["of", "for", "is", "are", "was", "were", "in", "from"]);

/**
 * RULE 2 — copula-anchored quality verdicts. `is|are|reads|feels|sounds|looks`
 * + optional intensifier + a **quality adjective**.
 *
 * The copula anchor is the load-bearing part. It separates "this is vague" (a
 * verdict on the work — forbidden) from "the target is stated without a window"
 * (a structural location — the product's entire voice). A bare adjective
 * denylist would kill both.
 *
 * Two deliberate exclusions, both spec rather than oversight:
 *
 *  - **Surface-style adjectives are absent** (wordy, verbose, passive, clunky,
 *    repetitive, awkward). The anti-taxonomy is enforced by the fixed
 *    Observation type enum — no type admits a surface nit — NOT by this lint.
 *    Widening here would start rejecting legitimate observations that quote the
 *    author's own wording. Pinned by agentSkillExamples.test.ts.
 *  - **Structural-absence adjectives are absent** (unsupported, undefined,
 *    unstated, undocumented, missing, absent). Those name a fact about the
 *    document, not a judgement of its quality, and are core product voice.
 */
const QUALITY_ADJECTIVES = [
  "vague",
  "unclear",
  "ambiguous",
  "confusing",
  "weak",
  "thin",
  "poor",
  "bad",
  "insufficient",
  "inadequate",
  "sloppy",
  "lacking",
  "problematic",
  "misleading",
  "incomplete",
  "underdeveloped",
  "underspecified",
  "unconvincing",
  "unpersuasive",
  "mediocre",
  "subpar",
  "imprecise",
  "muddled",
  "disorganized",
  "flawed",
  "questionable",
  "unclear-cut",
  "wrong",
  "incorrect",
  "hand-wavy",
  "handwavy",
];

/** Intensifiers/qualifiers that may sit between the copula and the adjective. */
const INTENSIFIERS = [
  "a bit",
  "a little",
  "quite",
  "rather",
  "somewhat",
  "very",
  "too",
  "fairly",
  "pretty",
  "highly",
  "extremely",
  "overly",
  "slightly",
  "so",
  "really",
  "still",
];

/**
 * Continuations that turn a quality adjective back into a *location*. "It is
 * unclear whether the date is Q2 or Q3" names an ambiguity in the document; "This
 * section is unclear" passes judgement on it. Same adjective, different act —
 * which is exactly why the plan flagged "unclear" as the hard case.
 */
const LOCATING_CONTINUATIONS = [
  "whether",
  "if",
  "what",
  "which",
  "how",
  "why",
  "who",
  "when",
  "about",
  "that",
];

/**
 * RULE 3 — modal / epistemic hedges, as word-boundary matches rather than five
 * literals. A colleague who is sure does not hedge the finding itself.
 */
const HEDGE_PATTERNS = [
  /\bperhaps\b/,
  /\bmaybe\b/,
  /\bpossibly\b/,
  /\barguably\b/,
  /\bpotentially\b/,
  /\bpresumably\b/,
  /\bsomewhat\b/,
  /\bsort of\b/,
  /\bkind of\b/,
  /\bit seems\b/,
  /\bseems (?:to|like|that)\b/,
  /\bappears (?:to|like|that)\b/,
  /\bfeels like\b/,
  /\bi think\b/,
  /\bi believe\b/,
  /\bit (?:might|would) be (?:helpful|worth|better|good)\b/,
];

/**
 * Advice framings. These are *prescriptions* wearing a polite hedge, so they
 * report as `prescriptive` rather than `hedge` — the boundary hands `rule` back
 * to the submitting agent (`register_violation`, docs/skills/writtten-agent.md),
 * and "you hedged" would send it to reword when the actual fault is that it told
 * the author what to do.
 */
const ADVICE_PATTERNS = [
  /\bi'd suggest\b/,
  /\bi would suggest\b/,
  /\bi suggest\b/,
  /\bi recommend\b/,
  /\bmy recommendation\b/,
  /\byou (?:may|might) want to\b/,
  /\byou (?:should|need to|ought to|must)\b/,
  /\bwe (?:should|need to|ought to)\b/,
  /\bit (?:would|might) (?:be better|help) to\b/,
  /\bthe fix (?:is|here)\b/,
];

/**
 * `might|may|could` are hedges only when they modalise the observation's *own*
 * assertion ("This might conflict with §2"). Two constructions put the modal
 * inside the *document's* voice instead, where it must not fire — both found by
 * probing shipped copy rather than reasoned up front:
 *
 *  - a **relative clause** describing the document — "anything the reader could
 *    disagree with" (the shipped `clarity` taxonomy example);
 *  - an **embedded complement clause** reporting what the document says — "the
 *    statement that the end-to-end flow *may* take up to one hour" (the
 *    `contradiction-sla-family` ratchet fixture). Here the modality is the
 *    author's, quoted back at them; flagging it would reject the product's most
 *    characteristic move, naming both sides of a contradiction in their own words.
 *
 * Both reduce to the same test: a marker of embedding earlier in the sentence.
 */
const BARE_MODAL_RE = /\b(?:might|may|could)\b/;
const EMBEDDED_CLAUSE_RE =
  /\b(?:that|anything|nothing|something|anyone|someone|whether|whoever|whatever|reader|readers|audience|claim|claims|statement|says|state|states|asserts|assertion|note|notes)\b/;

/**
 * Evaluator-internal bookkeeping-index leak into user-facing copy. Catches the
 * contradiction/tension `Claim #N` form (UX-017) AND the doc-level `claim [3]` /
 * `claims [1] and [2]` / `block [2]` bracket forms (OBS-034).
 *
 * **Widened 2026-07-19 (G3b)**, when the same adversarial probe pass that killed
 * the lexicons was turned on this regex. It matched the digit forms only, so
 * every *worded* index walked through: `claim number 3` · `claim (3)` · `the
 * second claim` · `claim two` · `item [4]`. All of them leak the same
 * bookkeeping — the author has no numbered claim list to look at, whichever way
 * the number is spelled. Three additions: the noun set covers the numbered-list
 * vocabulary (`item`/`entry`/`point`), the number may be worded or ordinal, and
 * an ordinal may precede the noun.
 *
 * The bare phrase "the existing claim" (no number at all) is ordinary English and
 * still does NOT match — that near miss is pinned in the corpus.
 */
const INDEX_NOUNS = "claims?|blocks?|items?|entries|entry|points?";
const WORD_NUMBERS = "one|two|three|four|five|six|seven|eight|nine|ten";
const ORDINALS = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth";
/**
 * `claims` and `blocks` are also *verbs*, and the digit branch cannot tell
 * "claim 3" (an index) from "claims 40% adoption" (product voice). An index is a
 * bare small integer; a measurement carries a unit. So the digit branch is capped
 * at two digits and refuses a following unit.
 *
 * This one is a **pre-existing false positive**, not a G3b regression: the
 * original regex matched "claims 40" too, so `"The section claims 40% adoption
 * within a quarter of launch."` — an entirely ordinary `unsupported_claim` /
 * contradiction phrasing — was being hard-rejected at the boundary. It went
 * unnoticed for the same reason the lexicons did: nothing probed the rule with
 * text built to break it. Pinned as a clean row in the corpus.
 */
const NOT_A_MEASUREMENT = `(?!\\s*(?:%|percent|per\\b|x\\b|bps\\b))`;
const CLAIM_INDEX_RE = new RegExp(
  [
    // claim #3 · claim [3] · claim (3) · claim number 3 · claim no. 3 · claim 3
    `\\b(?:${INDEX_NOUNS})\\s*(?:number|no\\.?)?\\s*[#[(]?\\s*\\d{1,2}\\b${NOT_A_MEASUREMENT}`,
    // claim two · claims one and two
    `\\b(?:${INDEX_NOUNS})\\s+(?:${WORD_NUMBERS})\\b`,
    // the second claim · the first block
    `\\b(?:${ORDINALS})\\s+(?:${INDEX_NOUNS})\\b`,
  ].join("|"),
  "i"
);

/**
 * A fabricated section reference (OBS-034). The doc-level model receives a
 * numbered `[N]` summary list, not the document's own section numbers, so any
 * `§3` it emits addresses nothing the author can see. Only meaningful for the
 * doc-level observation types (a real span-scoped note can legitimately quote a
 * `§2` the author actually wrote).
 *
 * **Widened 2026-07-19 (G3b):** the probe pass found the rule caught the `§`
 * glyph only, while the spelled-out `Section 3` / `Sect. 2` form — which the
 * model fabricates just as readily, and which reads *more* authoritative to the
 * author — passed untouched. `part` is deliberately excluded: "the first part of
 * the flow" is ordinary English, so it carries real false-positive risk for the
 * least gain.
 */
const SECTION_NUMBER_RE = /§\s*\d+|\b(?:sections?|sect\.?)\s+\d+/i;

/** The doc-level (unanchored) observation types — their `text` is the whole card. */
const DOC_LEVEL_TYPES: ReadonlySet<Observation["type"]> = new Set([
  "missing_topic",
  "underexposed_topic",
  "audience_mismatch",
  "structure_flow",
  // Required, not optional: `user_lens` allows document scope, so a lens card
  // can leak "§3" or "claim [2]" exactly as the doc-level types can. Omitting it
  // here would silently exempt lens cards from both index-leak rules.
  "user_lens",
]);

/** Length soft cap — one observation is one thought (§ Voice & copy guide rule 1). */
const LENGTH_SOFT_CAP = 240;

// --- Grammar helpers -------------------------------------------------------

/**
 * Split into sentences on `.?!` + whitespace, and additionally on `;` — a
 * semicolon-joined clause can carry its own imperative ("The date is Q3; change
 * it to Q2."). Abbreviations are not special-cased: a false split only ever
 * costs a missed imperative-initial match on the fragment after it, never a
 * false positive, because the fragment would have to start with an editing verb.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Strip leading markup/politeness so "**Add a window**" and "Please add a window" both match. */
const LEAD_NOISE_RE = /^(?:[-*_"'“‘(\s]+|please\s+|now\s+|instead,?\s+|so\s+)+/i;

/**
 * The imperative-initial test. Returns the offending verb, or `null`.
 * Also catches negative imperatives ("Don't use…", "Do not use…"), which are
 * prescriptions with a `not` in them.
 */
function findImperative(sentence: string): string | null {
  const cleaned = sentence.replace(LEAD_NOISE_RE, "").toLowerCase();
  const negative = cleaned.match(/^(?:don't|do not|never)\s+([a-z']+)/);
  if (negative && EDITING_VERBS.includes(negative[1])) return `do not ${negative[1]}`;

  const words = cleaned.split(/[^a-z'-]+/).filter(Boolean);
  if (words.length === 0) return null;
  const [first, second] = words;
  if (!EDITING_VERBS.includes(first)) return null;
  // "Support for…", "Use of…", "Note is…" — the verb is being used as a noun.
  if (second && NOUN_AFTER_VERB.has(second)) return null;
  return first;
}

/**
 * The copula-anchored verdict test. Returns the matched phrase, or `null`.
 * A quality adjective followed by a *locating* continuation ("unclear whether…",
 * "vague about…") is a location, not a verdict, and passes.
 */
function findCopulaVerdict(textLow: string): string | null {
  const copula = "(?:is|are|isn't|aren't|was|were|reads|feels|sounds|looks|seems|remains|becomes)";
  const intens = INTENSIFIERS.map((i) => i.replace(/ /g, "\\s+")).join("|");
  const adjs = QUALITY_ADJECTIVES.join("|");
  const re = new RegExp(
    `\\b${copula}\\s+(?:(?:${intens})\\s+){0,2}(?:a\\s+|an\\s+)?(${adjs})\\b(?:\\s+(\\w+))?`,
    "g"
  );
  for (const m of textLow.matchAll(re)) {
    const continuation = m[2];
    if (continuation && LOCATING_CONTINUATIONS.includes(continuation)) continue;
    return m[0].trim();
  }
  return null;
}

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

  // 2. No prescription — locate, don't prescribe. Grammar-anchored: a sentence
  //    that OPENS with a base-form editing verb is an imperative, whatever its
  //    object ("Add a window." / "Clarify what counts as active."). Checked per
  //    sentence, since the prescription often trails a legitimate observation
  //    ("The target has no window. Add one.").
  for (const sentence of splitSentences(message)) {
    const imperative = findImperative(sentence);
    if (imperative) {
      violations.push({
        rule: "prescriptive",
        detail: `sentence opens with the imperative "${imperative}" — locate the problem, don't prescribe the fix — "${message}"`,
      });
    }
  }

  //    Advice framings ("you should", "I recommend") are prescriptions too —
  //    politeness is not the distinguishing feature, telling the author what to
  //    do is.
  for (const re of ADVICE_PATTERNS) {
    const m = textLow.match(re);
    if (m) {
      violations.push({
        rule: "prescriptive",
        detail: `message advises the author ("${m[0]}") instead of naming what it found — "${message}"`,
      });
    }
  }

  // 3. No hedges — the colleague voice is confident about the finding itself.
  for (const re of HEDGE_PATTERNS) {
    const m = textLow.match(re);
    if (m) {
      violations.push({
        rule: "hedge",
        detail: `message hedges with "${m[0]}" — "${message}"`,
      });
    }
  }
  //    `might|may|could` only count when they modalise our own assertion, not
  //    when they sit in a relative clause about the document (see BARE_MODAL_RE).
  for (const sentence of splitSentences(textLow)) {
    const m = sentence.match(BARE_MODAL_RE);
    if (m && !EMBEDDED_CLAUSE_RE.test(sentence.slice(0, m.index))) {
      violations.push({
        rule: "hedge",
        detail: `message hedges the finding with the modal "${m[0]}" — "${message}"`,
      });
    }
  }

  // 4. No quality verdicts — name structural facts, not judgements. Anchored on
  //    a copula so "is vague" (verdict) fires and "is stated without a window"
  //    (location) does not.
  const verdict = findCopulaVerdict(textLow);
  if (verdict) {
    violations.push({
      rule: "evaluative",
      detail: `message passes a quality verdict ("${verdict}") rather than naming what is structurally wrong — "${message}"`,
    });
  }
  if (/\b(?:won't|will not|would not|wouldn't) convince\b/.test(textLow)) {
    violations.push({
      rule: "evaluative",
      detail: `message predicts the work will fail to persuade — a verdict, not an observation — "${message}"`,
    });
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
