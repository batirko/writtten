/**
 * Session-scoped capability memo — how much of a request each model accepts.
 *
 * Providers reject *knobs*, not just models. All three reject the cheapest
 * setting of the "don't think about it" knob on at least one current model:
 *
 *   Gemini    `thinkingConfig.thinkingBudget: 0`      → 400 on gemini-3.5-flash-lite,
 *                                                        gemini-3.6-flash, gemini-3.1-pro-preview
 *   Anthropic `thinking: { type: "disabled" }`        → 400 on claude-fable-5
 *   OpenAI    `reasoning_effort: "none"`              → 400 on o3, o4-mini, *-chat-latest
 *
 * Historically each of these was a substring test on the model id
 * (`model.includes("2.5-pro")`, `model.includes("sonnet")`). That rots the day a
 * provider ships a model, silently and in the worst direction: the id says
 * nothing about what the model accepts, so a user picking a brand-new model from
 * the live Settings picker got a hard 400 that aborted the whole eval.
 *
 * So we stop guessing from the id. Each adapter declares an ordered **ladder** of
 * settings, cheapest first. A call starts at the model's current rung; when the
 * provider rejects it with a 400 that names the knob, we step that model down one
 * rung and retry it once (`rotation.ts`). The discovery sticks for the rest of the
 * session, so an unknown model costs at most one extra request — and a provider
 * can launch a model tomorrow with no code change here.
 *
 * `seed()` pre-records rungs we have already verified against the live APIs, so
 * known models never pay that extra request. A seed is an optimization, not a
 * source of truth: if one goes stale, negotiation silently corrects it.
 */

/**
 * Two maps, deliberately: `seeded` holds what the adapters assert at module load
 * (static facts about the API), `discovered` holds what this session learned at
 * runtime. Keeping them apart is what lets the test hook reset runtime state
 * without silently deleting the seeds and changing every later request's shape.
 * Both are keyed `${provider}:${model}`.
 */
const seeded = new Map<string, number>();
const discovered = new Map<string, number>();

const key = (provider: string, model: string) => `${provider}:${model}`;

/** Which ladder rung to build this model's request at (0 = cheapest). */
export function rung(provider: string, model: string): number {
  const k = key(provider, model);
  return discovered.get(k) ?? seeded.get(k) ?? 0;
}

/**
 * Record that the current rung was rejected. Returns true when a further rung
 * exists (i.e. the caller should retry this model), false when the ladder is
 * exhausted and the failure is real.
 */
export function stepDown(provider: string, model: string, ladderLength: number): boolean {
  const next = rung(provider, model) + 1;
  if (next >= ladderLength) return false;
  discovered.set(key(provider, model), next);
  return true;
}

/** Pre-record verified rungs so known models skip the discovery round-trip. */
export function seed(provider: string, seeds: Record<string, number>): void {
  for (const [model, n] of Object.entries(seeds)) seeded.set(key(provider, model), n);
}

/** Test hook — drops what this session discovered, keeping the adapters' seeds. */
export function _resetCapabilities(): void {
  discovered.clear();
}
