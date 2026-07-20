/**
 * Which engine reads the document — the one slot, held by exactly one thing.
 *
 * writtten needs *model access*. An API key is one way to get it; a connected agent
 * is another. They occupy the **same slot** rather than stacking (owner, 2026-07-20 —
 * `docs/projects/agent_connected_eval.md` § Engine exclusivity, superseding decisions
 * 2 and 8). Running both bills the user twice — RPD on the key *and* tokens in their
 * agent — for overlapping observations competing for one feed budget.
 *
 * **Why this lives in `services/` and not `model/`.** Every sibling observable
 * (`activitySignal`, `agentSourceSignal`, `stallSignal`, `rpmBudget`) is under
 * `src/model/`, so that would be the reflexive home. It is the wrong one: `src/model/`
 * is the provider/router/LLM layer, and the architectural point of the reversal is
 * that engine selection sits **above** `ModelRouter`, not inside it — a connected
 * agent builds no `LLMRequest` and reads no key, so it is emphatically not a
 * `ProviderAdapter` (`docs/architecture.md` § Model router). A file named
 * `evalEngine.ts` sitting next to `registry.ts` and `provider.ts` would invite
 * exactly the confusion that doc warns against. `featureFlags.ts` is its closest
 * sibling in kind, and is the only thing it imports.
 *
 * That single import is load-bearing in a second way: `orchestrator.ts` reads this
 * module, so anything this file pulls in lands in the orchestrator's import graph.
 * Keeping it at one leaf import is what makes the guard cheap.
 */

import { agentBridgeEnabled } from "./featureFlags";

export type EngineId = "builtin" | "agent";

export const ENGINE_STORAGE_KEY = "writtten_engine";

type Listener = (engine: EngineId) => void;

/**
 * Capability-checked, never existence-checked — the same shape as
 * `agentBridgeClient`'s `safeLocalStorage`, and duplicated rather than imported on
 * purpose: importing it would drag bridge transport into the orchestrator's graph
 * (and that file belongs to a different work lane).
 *
 * This is not defensive boilerplate. Vitest runs in **node** here (`vite.config.ts`
 * declares no `environment`), and Node ≥ 22 puts a bare `{}` on
 * `globalThis.localStorage` — `typeof "object"`, so an existence check passes it
 * through and the first `.getItem` throws. Since `orchestrator.ts` imports this
 * module, that throw would happen at *import* time in `orchestrator.test.ts`. It is
 * the precise defect that blocked PR4.
 */
function safeLocalStorage(): Storage | null {
  try {
    const s = typeof localStorage === "undefined" ? null : localStorage;
    return typeof s?.getItem === "function" && typeof s.setItem === "function" ? s : null;
  } catch {
    return null; // storage disabled (private mode, blocked third-party context)
  }
}

function read(): EngineId {
  // The BYOA flag is a documented kill switch (`featureFlags.ts`): turning it off
  // must remove the whole surface. A stale `"agent"` left in storage from a preview
  // session must therefore never silently strand the user with *nothing* reading
  // their document — resolve to the built-in engine and let the selector be the only
  // way back.
  if (!agentBridgeEnabled()) return "builtin";
  try {
    return safeLocalStorage()?.getItem(ENGINE_STORAGE_KEY) === "agent" ? "agent" : "builtin";
  } catch {
    return "builtin";
  }
}

/** Lazy, so a test can arrange storage before the first read rather than racing
 *  module import order. */
let engine: EngineId | null = null;
const listeners = new Set<Listener>();

export function getEngine(): EngineId {
  if (engine === null) engine = read();
  return engine;
}

/** The orchestrator's read, as a named predicate rather than an enum compare at the
 *  call site — it matches `isNearLimit()` (the existing gate precedent in
 *  `orchestrator.ts`) and keeps the flag interaction resolved in exactly one place. */
export function isBuiltinEngineActive(): boolean {
  return getEngine() === "builtin";
}

/** No-ops on an unchanged value, matching `setActivityPending` /
 *  `setAgentSourceStatus`, so a component that re-asserts doesn't churn renders. */
export function setEngine(next: EngineId): void {
  if (getEngine() === next) return;
  engine = next;
  try {
    safeLocalStorage()?.setItem(ENGINE_STORAGE_KEY, next);
  } catch {
    /* not persisted — the selection still holds for this session */
  }
  for (const l of listeners) l(engine);
}

/**
 * The pairing can no longer hold the slot; hand it back. Idempotent.
 *
 * Deliberately *not* spelled `setEngine("builtin")` at its three call sites (revoke,
 * cancel, and the boot repair for a stale selection with no pairing). Those sites
 * mean *the agent lost the slot*, which is a different event from *the user chose a
 * key* — and the asymmetry is the whole safety property here: every move **to**
 * `agent` is a deliberate gesture, every move **to** `builtin` is a loss of the
 * agent's ability to serve. Naming it keeps that legible in code, not only in a doc.
 */
export function releaseAgentEngine(): void {
  setEngine("builtin");
}

/** Subscribe to selection changes. Pushes the current value immediately, so a
 *  component's mount read and its subscription are the same code path. */
export function subscribeEngine(listener: Listener): () => void {
  listeners.add(listener);
  listener(getEngine());
  return () => listeners.delete(listener);
}

/** Test-only reset. The module holds process-wide state, so a suite that drives
 *  selection must clear it — including the lazy-hydration cache. */
export function __resetEngine(): void {
  engine = null;
  listeners.clear();
}
