import type { ModelCapability } from "../model/capability";

/** A top-level block within a section, carried on settle triggers so the
 *  evaluator can re-anchor span observations to the exact member block. */
export interface SectionMember {
  blockId: string;
  text: string;
  /** True if this member is a heading node. Absent on hand-built fixtures; the
   *  evaluator falls back to treating an unmarked member as body. Lets the
   *  bodyless-heading guard fire (OBS-029). */
  isHeading?: boolean;
}

/**
 * Discriminated union of every event that may cause an LLM evaluation to be
 * scheduled. The set is closed — new triggers go here first with a written
 * reason. See docs/projects/message_generation_workflow.md §5.
 *
 * Settle triggers are keyed by **section** (heading + body), not by block: the
 * LLM never sees a heading without its body. The `members` carry per-block text
 * so observations still anchor to individual blocks. See
 * docs/projects/section_as_eval_unit.md.
 */
export type EvalTrigger =
  | { kind: "block-settle-pause"; sectionId: string; members: SectionMember[] }
  | {
      kind: "block-settle-blur";
      sectionId: string;
      members: SectionMember[];
      reason: "cursor-departed";
    }
  | { kind: "block-removed"; blockId: string }
  // Bulk paste / import bootstrap: after the fast-tier per-section evals have
  // populated the ledger, run a single ledger-internal contradiction sweep (one
  // strong call) instead of N per-section contradiction calls. See
  // docs/projects/bulk_paste_evaluation.md.
  | { kind: "block-paste"; blockIds: string[] }
  | { kind: "doc-idle" }
  | { kind: "stage-changed" };

/**
 * Ambient context that every eval call needs but that doesn't change per-block.
 */
export interface EvalContext {
  docId: string;
  apiKey: string;
  /** Optional paid API key; used as fallback when the free-tier pool is exhausted. */
  paidKey?: string;
  /** Model **capability** — what the model can be trusted to do (confident
   *  adjudication, resolution-aware reconciliation). Decoupled from the
   *  credential: decided once at the App boundary from the user's key-tier
   *  declaration, threaded here. The evaluator branches on this, not on
   *  `paidKey` presence. See docs/projects/byok_capability_model.md. */
  capability?: ModelCapability;
  stage?: string;
  /** Called when evaluateDocument infers a stage from the document content. */
  onStageSuggestion?: (suggestion: string) => void;
  /** Terms that should never be flagged as undefined jargon. Merged with
   *  JARGON_PRESET and any definition-kind claims in the ledger before the
   *  fast call. One term per entry; case-insensitive. */
  jargonAllowlist?: string[];
  /** When true, the section eval runs the fast-tier call only and skips the
   *  strong-tier per-section contradiction check. Set on bulk paste / import so
   *  N sections don't fire N paid-tier calls; a single ledger-internal sweep
   *  (the `block-paste` trigger) covers contradiction instead. See
   *  docs/projects/bulk_paste_evaluation.md. */
  skipContradiction?: boolean;
}
