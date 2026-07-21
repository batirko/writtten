/**
 * Adversarial corpus for the register lint itself (G3b).
 *
 * NOT an `EvalFixture` set — no LLM, no replay. These are hand-written messages
 * built to *defeat* `lintRegister`, each paired with a clean message that says
 * the same thing in the product's own voice. Consumer: `registerLint.test.ts`.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 * The lint shipped in Phase 6 as three literal-substring denylists and survived
 * two phases unchallenged, because nothing ever probed it with text designed to
 * get through — the eval fixtures only contain text that happens to be clean, so
 * the lint passing them proved nothing at all. A probe on 2026-07-19 found
 * **28 of 28** realistic critic phrasings passing. This corpus is the guard that
 * makes that failure mode non-recurring: it fixes the *process*, not just the
 * rules. Adding a rule without adding rows here rebuilds the same blind spot.
 *
 * ── The clean column is the load-bearing one ───────────────────────────────
 * Over-rejection is the failure mode of a stricter lint, and the register
 * vocabulary genuinely overlaps the taxonomy's own — "unclear" is both a quality
 * verdict and a legitimate `clarity` finding; "may" is both our hedge and the
 * author's modality quoted back at them. Every `clean` row below is a **near
 * miss**: it shares surface vocabulary with its `violating` partner and differs
 * only in the grammatical feature the rule is anchored on. A rule that passes the
 * violating column but fails the clean column has not been tightened, it has been
 * broken — and it would start rejecting real observations at the BYOA boundary.
 *
 * See docs/projects/philosophy_guardrails.md § G3b.
 */

import type { Observation } from "../../store/db";
import type { RegisterViolation } from "../registerLint";

export interface RegisterLintCase {
  /** Stable id, used as the test name. */
  id: string;
  /** The rule the violating row must trip. */
  rule: RegisterViolation["rule"];
  /** What adversarial move this row represents, and why the pairing is tight. */
  why: string;
  /** A message the lint MUST reject. */
  violating: string;
  /** A near-miss the lint MUST accept — same subject, product voice. */
  clean: string;
  /** Passed through to `lintRegister`. Required for the type-conditional rules. */
  type?: Observation["type"];
}

export const registerLintCorpus: RegisterLintCase[] = [
  // --- Rule 1: imperative-initial ------------------------------------------
  // The family that defeated the old lint wholesale. A bare command is the
  // commonest prescriptive form and the most direct violation of "provoke,
  // don't prescribe" — the AI did the thinking and handed over the answer.
  {
    id: "imperative-add",
    rule: "prescriptive",
    why: "The archetype. No lexicon entry can cover every object of 'Add'; the anchor is the sentence-initial base-form verb.",
    violating: "Add a measurement window to the adoption target.",
    clean: "The adoption target has no measurement window attached to it.",
  },
  {
    id: "imperative-define",
    rule: "prescriptive",
    why: "'Define X' is the prescription most likely to be mistaken for a legitimate undefined_jargon finding. The clean row makes the same point by locating the gap.",
    violating: "Define adoption before using it as a success metric.",
    clean:
      "'Adoption' carries the success metric here without being defined anywhere in the document.",
  },
  {
    id: "imperative-make",
    rule: "prescriptive",
    why: "The shortest possible prescription — no object worth denylisting, which is why vocabulary matching never had a chance.",
    violating: "Make this measurable.",
    clean: "Nothing in this section states how the outcome would be measured.",
  },
  {
    id: "imperative-clarify",
    rule: "prescriptive",
    why: "'Clarify' names the taxonomy's own type, so it reads as helpfulness from the inside. It still hands over the fix.",
    violating: "Clarify what counts as an active team.",
    clean: "'Active team' is doing load-bearing work in the target and isn't pinned down anywhere.",
  },
  {
    id: "imperative-restructure",
    rule: "prescriptive",
    why: "A structure_flow prescription. The clean row names the ordering consequence instead of issuing the move.",
    violating: "Move the rollout plan after the problem statement.",
    clean:
      "The rollout plan precedes the problem statement, so the constraints arrive after the solution.",
    type: "structure_flow",
  },
  {
    id: "imperative-negative",
    rule: "prescriptive",
    why: "Negative imperatives are prescriptions with a 'not' in them — the author is still being told what to do.",
    violating: "Don't use 'shadow ledger' without defining it first.",
    clean:
      "'Shadow ledger' is used as settled vocabulary and isn't defined anywhere in the document.",
    type: "undefined_jargon",
  },
  {
    id: "imperative-trailing",
    rule: "prescriptive",
    why: "The sneakiest shape: a legitimate observation with the fix bolted on after the full stop. Sentence-level checking is what catches it.",
    violating: "The 40% figure has no source. Provide one before the review.",
    clean: "The 40% figure appears here without a source or a prior section establishing it.",
    type: "unsupported_claim",
  },

  // --- Rule 1, clean side: nouns and gerunds that share the verb list -------
  // These are why the rule is anchored on base form AND sentence position. Every
  // row here would die under a naive "message contains an editing verb" rule.
  {
    id: "noun-initial-support",
    rule: "prescriptive",
    why: "'Support' opens the sentence as a noun, not a command. The 'for' following it is the disambiguator.",
    violating: "Support the 40% figure with data from the pilot.",
    clean: "Support for the 40% figure is asserted but never produced.",
  },
  {
    id: "noun-initial-use",
    rule: "prescriptive",
    why: "Same shape with 'Use of…'. A ~40-verb denylist without a noun guard would reject this legitimate observation.",
    violating: "Use a consistent term for the ledger throughout.",
    clean: "Use of 'ledger' and 'shadow ledger' alternates without either being defined.",
  },
  {
    id: "gerund-initial",
    rule: "prescriptive",
    why: "A gerund subject is how the product routinely opens a strategic_tension. Base-form-only matching is what keeps it clean — 'Blocking' is not 'Block'. (The violating partner uses an editing verb on purpose: the closed list covers instructions to change the DOCUMENT, not domain advice about the product, which is out of the lint's scope.)",
    violating:
      "State the fraud threshold that separates a blocked transaction from an allowed one.",
    clean:
      "Blocking every suspicious transaction pulls against the frictionless-checkout goal in Goals.",
    type: "strategic_tension",
  },

  // --- Rule 2: copula-anchored quality verdicts -----------------------------
  // The anchor separates a judgement of the work from a location within it.
  {
    id: "verdict-vague",
    rule: "evaluative",
    why: "The canonical verdict. Note the clean row uses the same subject and a structural fact — that contrast is the whole rule.",
    violating: "This section is vague.",
    clean:
      "'Improve the experience' here doesn't resolve to anything the reader could disagree with.",
    type: "clarity",
  },
  {
    id: "verdict-thin",
    rule: "evaluative",
    why: "'Thin' rates the rationale. The clean row names what is absent from it instead.",
    violating: "The rationale is thin.",
    clean:
      "The rationale rests entirely on the 3x figure, which nothing else in the document establishes.",
  },
  {
    id: "verdict-weak-boss",
    rule: "evaluative",
    why: "The 'boss' persona from the tone corpus — a verdict plus a prediction about how it will land.",
    violating: "This section is weak and won't convince leadership.",
    clean:
      "This section asserts the 30% lift as the core justification but nothing in the document supports it.",
  },
  {
    id: "verdict-reads-underdeveloped",
    rule: "evaluative",
    why: "'Reads' and 'feels' are copulas too — a verdict laundered through a perception verb is still a verdict.",
    violating: "The migration section feels underdeveloped.",
    clean: "Migration of existing accounts is mentioned once and never returned to.",
    type: "underexposed_topic",
  },
  {
    id: "verdict-intensified",
    rule: "evaluative",
    why: "Softening an insult doesn't retract it; intensifiers must not open a hole between copula and adjective.",
    violating: "The success criteria section is a bit unclear and somewhat incomplete.",
    clean: "The success criteria name a launch date but no threshold for calling it successful.",
  },

  // --- Rule 2, clean side: the overlap the plan flagged --------------------
  {
    id: "unclear-locating",
    rule: "evaluative",
    why: "THE hard case. 'Unclear whether X or Y' locates an ambiguity in the document; 'this is unclear' judges it. Same adjective, different act — the continuation is the anchor.",
    violating: "The timeline section is unclear.",
    clean: "It is unclear whether the ship date is the Q2 in Timeline or the Q3 committed here.",
    type: "clarity",
  },
  {
    id: "structural-absence-not-verdict",
    rule: "evaluative",
    why: "'Unsupported'/'undefined'/'unstated' name facts about the document, not judgements of it — they are core product voice and must stay out of the adjective list.",
    violating: "The evidence base is inadequate.",
    clean: "The 3x adoption figure is unsupported by any source in the document.",
    type: "unsupported_claim",
  },
  {
    id: "surface-nit-is-not-the-lints-job",
    rule: "evaluative",
    why: "Pinned deliberately. A style nit phrased declaratively is register-CLEAN — the anti-taxonomy is enforced by the fixed Observation type enum (no type admits a surface nit), not here. Widening the adjective list to cover prose style would start rejecting legitimate observations that quote the author's wording. Mirrors the assertion in agentSkillExamples.test.ts.",
    violating: "The prose is sloppy.",
    clean: "This paragraph is a bit wordy and uses passive voice.",
  },

  // --- Rule 3: modal / epistemic hedges ------------------------------------
  {
    id: "hedge-seems",
    rule: "hedge",
    why: "Hedging the finding invites the author to dismiss it without thinking. State it or drop it.",
    violating: "It seems the timeline is inconsistent with the dependency.",
    clean: "This commits to Q3; the dependency in Timeline isn't due until Q4.",
    type: "contradiction",
  },
  {
    id: "hedge-i-think",
    rule: "hedge",
    why: "First-person epistemics put the AI's confidence in the frame, where the document should be.",
    violating: "I think the rollout date conflicts with the audit deadline.",
    clean: "The rollout begins in Q2; the audit it feeds is dated Q1.",
    type: "contradiction",
  },
  {
    id: "hedge-modal-own-assertion",
    rule: "hedge",
    why: "A modal on OUR assertion is a hedge.",
    violating: "This might conflict with the commitment in the Timeline section.",
    clean: "This commits the same work the Timeline section commits to Q2.",
    type: "contradiction",
  },
  {
    id: "hedge-perhaps",
    rule: "hedge",
    why: "Bare adverbial hedges — the family the old five-literal list was trying to catch.",
    violating: "Perhaps the stated audience is wrong for this level of detail.",
    clean:
      "The stage names an executive audience; the API schema detail here is written for implementers.",
    type: "audience_mismatch",
  },
  {
    id: "advice-you-should",
    rule: "prescriptive",
    why: "Politeness is not the distinguishing feature. This reports as `prescriptive`, not `hedge`, because the boundary hands `rule` back to the agent and 'you hedged' would send it to reword the wrong thing.",
    violating: "You should define the term before using it as a metric.",
    clean: "The term carries the metric here without being defined anywhere in the document.",
  },

  // --- Rule 3, clean side: modality that belongs to the author -------------
  {
    id: "modal-reported-speech",
    rule: "hedge",
    why: "Found by probing shipped copy, not reasoned up front — this is the contradiction-sla-family ratchet fixture. The 'may' is the AUTHOR's, quoted back at them inside a complement clause. Flagging it would reject the product's most characteristic move: naming both sides of a contradiction in their own words.",
    violating: "The end-to-end flow may take up to one hour, which may not hold.",
    clean:
      "The claim that the flow completes in under five minutes contradicts the statement that the end-to-end flow may take up to one hour to complete.",
    type: "contradiction",
  },
  {
    id: "modal-relative-clause",
    rule: "hedge",
    why: "The shipped `clarity` taxonomy example. 'could' sits in a relative clause describing the reader, not modalising our finding.",
    violating: "This could be clearer about what improvement means.",
    clean:
      "'Improve the experience' here doesn't resolve to anything the reader could disagree with.",
    type: "clarity",
  },

  // --- Rule 4: leading questions -------------------------------------------
  {
    id: "leading-question",
    rule: "question",
    why: "The disguised fix. A question that already contains its answer is a prescription with a question mark on it.",
    violating: "Have you considered whether users actually want this?",
    clean:
      "Nothing in the document establishes user demand for the feature this commits to building.",
  },

  // --- Rules 5 & 6: the type-conditional bookkeeping leaks ------------------
  // Re-probed under G3b. These fire ONLY when `opts.type` is passed — an untyped
  // probe silently misses them, which is exactly how a `§4` bug reached review.
  {
    id: "claim-index-hash",
    rule: "claim-index",
    why: "UX-017. 'Claim #2' is evaluator bookkeeping; the author has no numbered claims to look at.",
    violating: "This contradicts Claim #2.",
    clean: "This commits to Q3; the Timeline section commits the same work to Q2.",
    type: "contradiction",
  },
  {
    id: "claim-index-bracket",
    rule: "claim-index",
    why: "OBS-034, the doc-level bracket form. The model is fed a positional [N] list it must not echo.",
    violating: 'The functionality in claim [3] as "key issues" is underspecified.',
    clean: 'The "key issues" the summary promises are never enumerated anywhere in the document.',
    type: "underexposed_topic",
  },
  {
    id: "claim-index-ordinary-english",
    rule: "claim-index",
    why: "The near miss: 'the existing claim' with no number is ordinary English and must pass.",
    violating: "This restates claim 4 about the Q3 date.",
    clean: "This restates the existing claim about Q3 without adding evidence for it.",
    type: "contradiction",
  },
  {
    id: "claim-index-worded",
    rule: "claim-index",
    why: "Found by the G3b probe pass. The original regex matched digits only, so every worded index walked through — 'claim number 3', 'claim (3)', 'claim two'. The leak is identical however the number is spelled.",
    violating: "This contradicts claim number 3 about the Q3 date.",
    clean: "This commits to Q3; the Timeline section commits the same work to Q2.",
    type: "contradiction",
  },
  {
    id: "claim-index-ordinal",
    rule: "claim-index",
    why: "The ordinal form ('the second claim') reads like natural English but still points at a numbered list the author cannot see.",
    violating: "This conflicts with the second claim in the summary.",
    clean: "This conflicts with the adoption target stated in the summary.",
    type: "contradiction",
  },
  {
    id: "claims-as-verb-not-an-index",
    rule: "claim-index",
    why: "A PRE-EXISTING false positive found by the G3b probe, not a G3b regression: the original regex matched 'claims 40' as readily as 'claim 3', so this entirely ordinary phrasing was being hard-rejected at the boundary. An index is a bare small integer; a measurement carries a unit. Known residual: 'blocks 3 transactions' (verb + bare count + plural noun) still trips the rule — narrow enough to leave rather than over-fit the regex.",
    violating: "This contradicts claim 3 about adoption.",
    clean:
      "The section claims 40% adoption within a quarter of launch, and nothing establishes it.",
    type: "contradiction",
  },
  {
    id: "claim-index-user-lens",
    rule: "claim-index",
    why: "user_lens allows DOCUMENT scope, so it reaches the index-leak rules exactly as the doc-level types do — this row is what pins that membership. A lens is the one type whose subject the user chose, which makes it the easiest place to assume the register rules relaxed; they did not. The clean partner says the same thing by quoting the document's own words.",
    violating: "The cadence in claim [2] repeats at the opening of each section.",
    clean:
      'The three-clause rhythm in "adoption should reach forty percent" repeats at each section opening.',
    type: "user_lens",
  },
  {
    id: "section-number-user-lens",
    rule: "section-number",
    why: "Same membership, the other index-leak rule. A lens card citing '§2' invents numbering the author never wrote, and the fact that the user requested the search buys no exemption.",
    violating: "The passive phrasing in §2 matches the pattern you asked about.",
    clean:
      'The "Success Criteria" section states its target without naming who reaches it.',
    type: "user_lens",
  },
  {
    id: "section-number-spelled-out",
    rule: "section-number",
    why: "The probe's biggest section-number gap: the rule caught the § glyph only, while the spelled-out form the model fabricates just as readily — and which reads MORE authoritative to the author — passed untouched.",
    violating: "Section 3 introduces the rollout before the problem statement.",
    clean:
      "The rollout plan precedes the problem statement, so the constraints arrive after the solution.",
    type: "structure_flow",
  },
  {
    id: "section-number-fabricated",
    rule: "section-number",
    why: "OBS-034. A doc-level §N addresses nothing the author can see, because the doc-level pass never receives the document's own numbering.",
    violating: "It introduces the solution in §1 before the problem in §2.",
    clean:
      "The rollout plan precedes the problem statement, so the constraints arrive after the solution.",
    type: "structure_flow",
  },
];
