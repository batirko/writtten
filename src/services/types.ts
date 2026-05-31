/**
 * Discriminated union of every event that may cause an LLM evaluation to be
 * scheduled. The set is closed — new triggers go here first with a written
 * reason. See docs/projects/message_generation_workflow.md §5.
 */
export type EvalTrigger =
  | { kind: "block-settle-pause"; blockId: string }
  | { kind: "block-settle-blur"; blockId: string; reason: "cursor-departed" | "window-blurred" }
  | { kind: "block-removed"; blockId: string }
  | { kind: "block-paste"; blockIds: string[] }; // Phase 3: batched fast call; not yet dispatched

/**
 * Ambient context that every eval call needs but that doesn't change per-block.
 */
export interface EvalContext {
  docId: string;
  apiKey: string;
  stage?: string;
}
