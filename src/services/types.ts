/**
 * Discriminated union of every event that may cause an LLM evaluation to be
 * scheduled. The set is closed — new triggers go here first with a written
 * reason. See docs/projects/message_generation_workflow.md §5.
 */
export type EvalTrigger =
  | { kind: "block-settle-pause"; blockId: string }
  | { kind: "block-settle-blur"; blockId: string; reason: "cursor-departed" | "window-blurred" }
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
}
