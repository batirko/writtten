export interface LLMRequest {
  system: string;
  user: string;
  json?: boolean;
  /**
   * Debug-log correlation metadata (dev-only). Rides on the request so the
   * gemini layer can stamp each logged call with the eval pass that spawned it
   * and a stable reference to the (static) system prompt. Deliberately excluded
   * from the mock replay hash (see reqHash) so it never affects fixtures.
   */
  meta?: { evalId?: string; promptRef?: string };
}

export interface LLMResponse {
  text: string;
  /**
   * The debug-log call id minted for this call (dev-only, live calls only).
   * Returned so the evaluator can attribute the observations/ledger writes it
   * produces back to the call that yielded them. Undefined in mock mode.
   */
  callId?: string;
}

export interface ModelRouter {
  /** Cheap, frequent calls: summarization, span checks. */
  fast(req: LLMRequest): Promise<LLMResponse>;
  /** Stronger, rarer calls: contradiction adjudication, doc-level judgment. */
  strong(req: LLMRequest): Promise<LLMResponse>;
}
