/**
 * Provider registry — the single place that knows all shipped adapters.
 *
 * A fourth provider = one new adapter file + one row here; nothing else changes.
 * See docs/projects/multi_provider_router.md §C.
 */

import type { ProviderAdapter, ProviderId, ModelCatalog } from "./provider";
import { geminiAdapter } from "./gemini";
import { openaiAdapter } from "./openai";
import { anthropicAdapter } from "./anthropic";

export const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  gemini: geminiAdapter,
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
};

/** All shipped providers in display order (Gemini first — the free on-ramp). */
export const PROVIDER_IDS: ProviderId[] = ["gemini", "openai", "anthropic"];

/** Resolve an adapter by id, falling back to Gemini for unknown/legacy values. */
export function resolveProvider(id: string): ProviderAdapter {
  return PROVIDERS[id as ProviderId] ?? geminiAdapter;
}

/** The selectable models a provider offers per tier (for the Settings picker). */
export function catalogFor(id: string): ModelCatalog {
  return resolveProvider(id).catalog;
}

/** The default model per tier (`[0]` of each catalog list). */
export function defaultModels(id: string): { fast: string; strong: string } {
  const c = catalogFor(id);
  return { fast: c.fast[0], strong: c.strong[0] };
}

/** The model a "Ping model" test should hit — the one the user reaches first.
 *  Gemini pings its free-tier primary; paid providers ping the fast default. */
export function pingModelFor(id: string): string {
  if (resolveProvider(id).id === "gemini") return "gemini-3.1-flash-lite";
  return defaultModels(id).fast;
}

/**
 * Return a copy of the adapter whose paid pools route the user's selected model
 * per tier (a single-model pool — paid providers don't rotate). Omitted
 * selections fall back to the catalog default. The free pools are left as-is
 * (Gemini's free rotation pool stays intact; see §D).
 */
export function withSelection(
  adapter: ProviderAdapter,
  selection: { fastModel?: string; strongModel?: string }
): ProviderAdapter {
  const fast = selection.fastModel ?? adapter.catalog.fast[0];
  const strong = selection.strongModel ?? adapter.catalog.strong[0];
  return {
    ...adapter,
    pools: {
      ...adapter.pools,
      paidFast: [fast],
      paidStrong: [strong],
    },
  };
}
