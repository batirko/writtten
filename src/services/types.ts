/** A top-level block within a section, carried on settle triggers so the
 *  evaluator can re-anchor span observations to the exact member block. */
export interface SectionMember {
  blockId: string;
  text: string;
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
      reason: "cursor-departed" | "window-blurred";
    }
  | { kind: "block-removed"; blockId: string }
  | { kind: "block-paste"; blockIds: string[] } // Phase 3: batched fast call; not yet dispatched
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
  stage?: string;
  /** Called when evaluateDocument infers a stage from the document content. */
  onStageSuggestion?: (suggestion: string) => void;
  /** Terms that should never be flagged as undefined jargon. Merged with
   *  JARGON_PRESET and any definition-kind claims in the ledger before the
   *  fast call. One term per entry; case-insensitive. */
  jargonAllowlist?: string[];
}
