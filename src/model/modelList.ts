/**
 * Live per-provider model catalog: fetch the provider's real models list, split
 * it into fast/strong tiers, cache it, and fall back to the static preset catalog
 * whenever a live list isn't available (keyless, no endpoint, fetch failure, or an
 * empty/garbled response). The Settings picker calls this so its dropdowns reflect
 * the models a key actually grants instead of a hardcoded, rot-prone list.
 *
 * Contract the UI relies on:
 *   - Never throws — every failure path returns the preset catalog.
 *   - `presetCatalog()` is sync, so the modal can render options immediately and
 *     swap in the live list when `fetchModelCatalog()` resolves.
 *   - Results are cached per (provider, key) for the session, so reopening the
 *     modal or re-rendering doesn't refetch.
 *
 * See docs/projects/multi_provider_router.md (§ Readiness specs, item 3).
 */

import type { ModelCatalog, ProviderId } from "./provider";
import { resolveProvider, catalogFor } from "./registry";
import { classifyTier } from "./classifyTier";

/** The static fallback for a provider — the honest default kept in each adapter. */
export function presetCatalog(providerId: ProviderId): ModelCatalog {
  return catalogFor(providerId);
}

// A key is a secret, so the cache key mixes only a short prefix + length — enough
// to distinguish keys without holding the whole credential in a map key.
function cacheKey(providerId: ProviderId, key: string): string {
  return `${providerId}:${key.slice(0, 6)}:${key.length}`;
}

const memo = new Map<string, ModelCatalog>();

/** Synchronous peek at an already-fetched live catalog, if any. */
export function cachedCatalog(providerId: ProviderId, key: string): ModelCatalog | null {
  if (!key) return null;
  return memo.get(cacheKey(providerId, key)) ?? null;
}

function splitByTier(ids: string[]): ModelCatalog {
  const fast: string[] = [];
  const strong: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    (classifyTier(id) === "fast" ? fast : strong).push(id);
  }
  fast.sort();
  strong.sort();
  return { fast, strong };
}

/**
 * Resolve the model catalog for a (provider, key): the live list when reachable,
 * otherwise the preset. Cached per (provider, key). Never throws — any failure
 * yields the preset catalog so the picker always has options.
 */
export async function fetchModelCatalog(
  providerId: ProviderId,
  key: string
): Promise<ModelCatalog> {
  const preset = presetCatalog(providerId);
  if (!key) return preset;

  const ck = cacheKey(providerId, key);
  const hit = memo.get(ck);
  if (hit) return hit;

  const adapter = resolveProvider(providerId);
  if (!adapter.listModelsRequest || !adapter.parseModelsList) return preset;

  try {
    const { url, init } = adapter.listModelsRequest(key);
    const res = await fetch(url, init);
    if (!res.ok) return preset;
    const body = (await res.json()) as unknown;
    const ids = adapter.parseModelsList(body);
    if (!ids.length) return preset;

    const live = splitByTier(ids);
    // A provider might return only strong-classed (or only fast-classed) models;
    // keep each tier non-empty so both dropdowns always have options.
    if (!live.fast.length) live.fast = preset.fast;
    if (!live.strong.length) live.strong = preset.strong;

    memo.set(ck, live);
    return live;
  } catch {
    return preset;
  }
}

/** Test-only: clear the session cache. */
export function _clearModelCatalogCache(): void {
  memo.clear();
}
