export interface LLMRequest {
  system: string;
  user: string;
  json?: boolean;
}

export interface LLMResponse {
  text: string;
}

export interface ModelRouter {
  /** Cheap, frequent calls: summarization, span checks. */
  fast(req: LLMRequest): Promise<LLMResponse>;
  /** Stronger, rarer calls: contradiction adjudication, doc-level judgment. */
  strong(req: LLMRequest): Promise<LLMResponse>;
}
