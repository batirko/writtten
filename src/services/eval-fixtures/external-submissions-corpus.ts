/**
 * Adversarial corpus for the external-observation boundary.
 *
 * NOT an `EvalFixture` set — there is no LLM in this path and nothing is
 * replayed. These are hand-written submissions an untrusted agent might send,
 * each labelled with the exact verdict the boundary must return. Consumer:
 * `src/services/externalObservations.test.ts`.
 *
 * The rows are organized by the failure they probe, and most of them are
 * *product-principle* cases rather than schema cases: a rewrite dressed up as
 * an observation, a leading question, an "apply this" affordance smuggled in as
 * a field. Those are the submissions that would quietly turn writtten into
 * Grammarly-with-extra-steps if the boundary let them through, so they are the
 * ones worth pinning to an exact `{ code, rule }`.
 *
 * See docs/projects/agent_connected_eval.md § The boundary.
 */

import type { RejectionCode } from "../externalObservations";
import type { RegisterViolation } from "../registerLint";

export interface ExternalSubmissionCase {
  /** Stable id, used as the test name. */
  id: string;
  /** What adversarial move this row represents, and why the verdict is right. */
  why: string;
  /** The raw payload, exactly as it would arrive over the bridge. `unknown`
   *  because half these rows are deliberately not valid submissions. */
  submission: unknown;
  /** `"accepted"` or the exact rejection this must produce. */
  expect: "accepted" | { code: RejectionCode; rule?: RegisterViolation["rule"] };
}

/**
 * The document these cases are validated against. Kept small and concrete so a
 * reader can check an anchor by eye.
 */
export const CORPUS_MEMBERS = [
  { blockId: "b1", text: "Success Criteria", isHeading: true },
  {
    blockId: "b2",
    text: "We will ship the reporting module in Q3, and adoption should reach forty percent of active teams within a quarter of launch.",
  },
  {
    blockId: "b3",
    text: "The rollout begins in Q2 so that finance has numbers before the audit, they are counting on it.",
  },
];

export const externalSubmissionCorpus: ExternalSubmissionCase[] = [
  // --- Shape: the protocol has no edit-shaped message -----------------------
  {
    id: "unknown-field-suggested-fix",
    why: "The load-bearing one. An agent tries to attach a fix to an otherwise clean observation. There is no such field and never will be, so this must be a hard no rather than a silent drop — a silent drop teaches the agent the field worked.",
    submission: {
      type: "clarity",
      scope: "span",
      anchorText: "adoption should reach forty percent",
      text: "The adoption target has no measurement window attached to it.",
      suggestedFix: "adoption should reach 40% of active teams by 2026-12-31",
    },
    expect: { code: "malformed" },
  },
  {
    id: "unknown-field-replacement-text",
    why: "Same move under a different name. The rejection is driven by an allowlist, not a denylist, so renaming the field does not get past it.",
    submission: {
      type: "clarity",
      scope: "document",
      text: "The document states an adoption target without naming who owns reaching it.",
      replacement: "Rewrite the section to name an owner.",
    },
    expect: { code: "malformed" },
  },
  {
    id: "not-an-object",
    why: "A bare string where an object belongs — the shape check is stage one because nothing upstream is trusted.",
    submission: "the timeline contradicts itself",
    expect: { code: "malformed" },
  },
  {
    id: "array-payload",
    why: "Arrays are objects in JS; the parse must reject them explicitly rather than reading index properties off them.",
    submission: [{ type: "clarity", scope: "document", text: "Something is unclear." }],
    expect: { code: "malformed" },
  },
  {
    id: "missing-text",
    why: "Required field absent.",
    submission: { type: "clarity", scope: "document" },
    expect: { code: "malformed" },
  },
  {
    id: "blank-text",
    why: "Whitespace-only text would produce an empty card in the feed.",
    submission: { type: "clarity", scope: "document", text: "   " },
    expect: { code: "malformed" },
  },
  {
    id: "confidence-out-of-range",
    why: "An agent inventing its own confidence vocabulary (\"certain\") gets a shape error, not a silent coercion to a real level.",
    submission: {
      type: "clarity",
      scope: "document",
      text: "The document names an adoption target without a measurement window.",
      confidence: "certain",
    },
    expect: { code: "malformed" },
  },

  // --- Taxonomy: fixed and closed (invariant 2) -----------------------------
  {
    id: "invented-type-grammar",
    why: "The anti-taxonomy at the type level. `grammar` is not a type because grammar is not something this product surfaces, so the submission has nowhere to land.",
    submission: {
      type: "grammar",
      scope: "span",
      anchorText: "they are counting on it",
      text: "This is a comma splice.",
    },
    expect: { code: "unknown_type" },
  },
  {
    id: "invented-type-suggestion",
    why: "An agent inventing a category that is a fix by another name.",
    submission: {
      type: "suggestion",
      scope: "document",
      text: "The success criteria section would carry more weight with a named owner.",
    },
    expect: { code: "unknown_type" },
  },
  {
    id: "invented-type-praise",
    why: "Flattery has no type either. The feed is not a place to be told the draft is good.",
    submission: {
      type: "praise",
      scope: "document",
      text: "The success criteria are stated with unusual precision.",
    },
    expect: { code: "unknown_type" },
  },

  // --- Scope ---------------------------------------------------------------
  {
    id: "span-without-anchor",
    why: "A span observation with nothing to anchor to would float, then attach to whatever the highlighter guessed.",
    submission: {
      type: "clarity",
      scope: "span",
      text: "The adoption target has no measurement window.",
    },
    expect: { code: "invalid_scope" },
  },
  {
    id: "document-scope-with-anchor",
    why: "Carrying an anchor on a document-scope submission means the agent meant span; better to say so than to drop the anchor silently.",
    submission: {
      type: "missing_topic",
      scope: "document",
      anchorText: "We will ship the reporting module in Q3",
      text: "The document sets delivery dates without naming what happens if the audit moves.",
    },
    expect: { code: "invalid_scope" },
  },
  {
    id: "invented-scope",
    why: "Scope is a closed set of two.",
    submission: {
      type: "clarity",
      scope: "paragraph",
      text: "The adoption target has no measurement window.",
    },
    expect: { code: "invalid_scope" },
  },

  // --- Register: locate, don't prescribe -----------------------------------
  {
    id: "rewrite-dressed-as-observation",
    why: "The central adversarial case. An agent that understands the taxonomy but not the principle submits a rewrite with an observation's grammar. The register lint catches the imperative.",
    submission: {
      type: "clarity",
      scope: "span",
      anchorText: "adoption should reach forty percent",
      text: "Change this to a numeric target with an explicit measurement date.",
    },
    expect: { code: "register_violation", rule: "prescriptive" },
  },
  {
    id: "apply-me-phrasing",
    why: "The same move in softer clothing — a fix framed as a courtesy still does the author's thinking for them.",
    submission: {
      type: "structure_flow",
      scope: "document",
      text: "Consider moving the rollout timeline above the success criteria.",
    },
    expect: { code: "register_violation", rule: "prescriptive" },
  },
  {
    id: "leading-question",
    why: "The Socratic dodge: a prescription with a question mark on it. Register discipline forbids handing the thinking back as a prompt.",
    submission: {
      type: "unsupported_claim",
      scope: "span",
      anchorText: "adoption should reach forty percent",
      text: "Have you considered whether forty percent is achievable in one quarter?",
    },
    expect: { code: "register_violation", rule: "question" },
  },
  {
    id: "hedged-observation",
    why: "Hedging is how an agent avoids the discomfort of a true critique. The colleague voice is confident.",
    submission: {
      type: "contradiction",
      scope: "span",
      anchorText: "The rollout begins in Q2",
      text: "This might perhaps conflict with the Q3 ship date stated earlier.",
    },
    expect: { code: "register_violation", rule: "hedge" },
  },
  {
    id: "evaluative-verdict",
    why: "Grading the work is not observing it. Name the structural fact, not the quality verdict.",
    submission: {
      type: "unsupported_claim",
      scope: "span",
      anchorText: "adoption should reach forty percent",
      text: "The evidence for this target is weak.",
    },
    expect: { code: "register_violation", rule: "evaluative" },
  },
  {
    id: "claim-index-leak",
    why: "Evaluator-internal index labels are meaningless to the author. An agent that saw them in a snapshot must still not echo them — the snapshot deliberately carries no ids.",
    submission: {
      type: "contradiction",
      scope: "span",
      anchorText: "The rollout begins in Q2",
      text: "Claim #2 sets a Q2 rollout while the delivery commitment names Q3.",
    },
    expect: { code: "register_violation", rule: "claim-index" },
  },
  {
    id: "invented-section-number",
    why: "The document uses headings, not numbered sections; a fabricated §2 points at nothing the author can see.",
    submission: {
      type: "missing_topic",
      scope: "document",
      text: "The rollout dates in §2 are stated without naming the dependency on the audit schedule.",
    },
    expect: { code: "register_violation", rule: "section-number" },
  },
  {
    id: "over-length",
    why: "One observation is one thought. The 240-char cap is SOFT for our own prompt ratchet and HARD here — an unratcheted source has no standing to earn an exception.",
    submission: {
      type: "clarity",
      scope: "document",
      text: "The document sets out a delivery commitment and an adoption target and a rollout window, and each of the three is stated at a different level of precision, which leaves a reader unable to tell which of them is the load-bearing promise and which are the supporting details that follow from it.",
    },
    expect: { code: "register_violation", rule: "length" },
  },

  // --- Anchoring: resolved locally, never trusted ---------------------------
  {
    id: "hallucinated-anchor",
    why: "A quote that is not in the document. Hard reject rather than degrade-to-document-scope: silent degradation would teach the agent that sloppy anchoring works.",
    submission: {
      type: "clarity",
      scope: "span",
      anchorText: "the north star metric for this initiative",
      text: "The metric is named without a baseline to measure movement against.",
    },
    expect: { code: "anchor_unresolved" },
  },
  {
    id: "paraphrased-anchor",
    why: "Near-miss quoting — the agent reworded while copying. Same verdict; the hint is what tells it to re-quote verbatim.",
    submission: {
      type: "clarity",
      scope: "span",
      anchorText: "adoption will reach 40 percent",
      text: "The adoption target is stated without a measurement window.",
    },
    expect: { code: "anchor_unresolved" },
  },

  // --- Clean submissions: the boundary is a filter, not a wall --------------
  {
    id: "clean-span-clarity",
    why: "A properly located, declarative span observation. Nothing here prescribes; it names what is absent and leaves the author to decide.",
    submission: {
      type: "clarity",
      scope: "span",
      anchorText: "adoption should reach forty percent",
      text: "The adoption target is stated without the window it is measured over.",
    },
    expect: "accepted",
  },
  {
    id: "clean-doc-missing-topic",
    why: "A document-scope gap, declaratively stated.",
    submission: {
      type: "missing_topic",
      scope: "document",
      text: "The document commits to delivery dates without naming what moves if the audit slips.",
    },
    expect: "accepted",
  },
  {
    id: "clean-contradiction-single-anchor",
    why: "The hero type, external form: single-anchor, no conflictingBlockId machinery, and it names both sides in its text rather than by index. This is the demo moment the feature exists for.",
    submission: {
      type: "contradiction",
      scope: "span",
      anchorText: "The rollout begins in Q2",
      text: "The rollout starts in Q2 while the reporting module it depends on ships in Q3.",
      confidence: "high",
    },
    expect: "accepted",
  },
  {
    id: "trailing-punctuation-anchor",
    why: "The agent appended a period when lifting a mid-sentence clause. The evaluator's own claim anchoring tolerates exactly this, so the boundary does too — the tolerance is for transcription, not for paraphrase.",
    submission: {
      type: "unsupported_claim",
      scope: "span",
      anchorText: "The rollout begins in Q2.",
      text: "The Q2 start is asserted without the dependency that would make it possible.",
    },
    expect: "accepted",
  },

  // --- The honest limit ----------------------------------------------------
  {
    id: "grammar-nit-in-clean-register",
    why: "ACCEPTED, and that is the honest answer. A surface nit typed as `clarity` and phrased declaratively passes: the anti-taxonomy is enforced by the absence of a grammar type and by the register lint catching the phrasings such nits usually arrive in — not by semantic judgement, which code cannot do. The containment for this is the source chip and the user learning to discount a source, not a check the boundary could add. Pinned as a test so the limit stays visible rather than being discovered later in the field. See docs/projects/agent_connected_eval.md § The boundary (\"What code cannot enforce is insight quality\").",
    submission: {
      type: "clarity",
      scope: "span",
      anchorText: "they are counting on it",
      text: "The final clause is joined to the preceding sentence with a comma.",
    },
    expect: "accepted",
  },
];
