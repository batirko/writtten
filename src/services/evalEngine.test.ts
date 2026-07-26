import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * The BYOA flag is a plain `true` since the gate came off (`featureFlags.ts`), so the
 * kill-switch case below can no longer be arranged by withholding a storage key — it has
 * to move the flag itself. Mocked mutable rather than per-test, because `vi.mock` hoists.
 */
const flag = { on: true };
vi.mock("./featureFlags", () => ({ agentBridgeEnabled: () => flag.on }));

import {
  getEngine,
  setEngine,
  subscribeEngine,
  isBuiltinEngineActive,
  releaseAgentEngine,
  __resetEngine,
  ENGINE_STORAGE_KEY,
  type EngineId,
} from "./evalEngine";

/** Mirrors `agentBridgeClient.test.ts`'s installer. */
function installStorage(seed: Record<string, string> = {}, over: Partial<Storage> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    ...over,
  };
  vi.stubGlobal("localStorage", store);
  return store;
}

afterEach(() => {
  __resetEngine();
  flag.on = true;
  vi.unstubAllGlobals();
});

describe("evalEngine — one slot, one holder", () => {
  it("defaults to the built-in engine when nothing was ever chosen", () => {
    installStorage();
    expect(getEngine()).toBe("builtin");
    expect(isBuiltinEngineActive()).toBe(true);
  });

  it("hydrates a previously chosen agent engine from storage", () => {
    installStorage({ [ENGINE_STORAGE_KEY]: "agent" });
    expect(getEngine()).toBe("agent");
    expect(isBuiltinEngineActive()).toBe(false);
  });

  it("treats an unrecognized stored value as the built-in engine", () => {
    installStorage({ [ENGINE_STORAGE_KEY]: "gpt-9" });
    expect(getEngine()).toBe("builtin");
  });

  it("persists a selection and reports it back after a reload", () => {
    const store = installStorage();
    setEngine("agent");
    expect(store.getItem(ENGINE_STORAGE_KEY)).toBe("agent");

    __resetEngine(); // simulate a fresh page load against the same storage
    expect(getEngine()).toBe("agent");
  });

  /**
   * The kill-switch invariant, and the reason `agentBridgeEnabled()` still exists as a
   * function now that BYOA is public: turning it off must remove the entire surface —
   * including any selection a session made while it was on. Honouring a stale `"agent"`
   * would gate the built-in evaluator with no UI left to un-gate it: a document nothing
   * reads, and no way to notice why.
   */
  it("refuses a stored agent selection when the BYOA flag is off", () => {
    installStorage({ [ENGINE_STORAGE_KEY]: "agent" });
    flag.on = false;

    expect(getEngine()).toBe("builtin");
    expect(isBuiltinEngineActive()).toBe(true);
  });
});

describe("evalEngine — notification", () => {
  it("pushes the current value to a new subscriber immediately", () => {
    installStorage({ [ENGINE_STORAGE_KEY]: "agent" });
    const seen: EngineId[] = [];
    subscribeEngine((e) => seen.push(e));
    expect(seen).toEqual(["agent"]);
  });

  it("notifies subscribers on a real change", () => {
    installStorage();
    const seen: EngineId[] = [];
    subscribeEngine((e) => seen.push(e));
    setEngine("agent");
    expect(seen).toEqual(["builtin", "agent"]);
  });

  it("no-ops on an unchanged value, so a re-assert doesn't churn renders", () => {
    installStorage();
    const seen: EngineId[] = [];
    subscribeEngine((e) => seen.push(e));
    setEngine("builtin");
    setEngine("builtin");
    expect(seen).toEqual(["builtin"]);
  });

  it("stops notifying after unsubscribe", () => {
    installStorage();
    const seen: EngineId[] = [];
    const off = subscribeEngine((e) => seen.push(e));
    off();
    setEngine("agent");
    expect(seen).toEqual(["builtin"]);
  });
});

describe("evalEngine — releasing the slot", () => {
  it("hands the slot back to the built-in engine", () => {
    installStorage({ [ENGINE_STORAGE_KEY]: "agent" });
    releaseAgentEngine();
    expect(getEngine()).toBe("builtin");
  });

  it("is idempotent — releasing from the built-in engine changes nothing", () => {
    installStorage();
    const seen: EngineId[] = [];
    subscribeEngine((e) => seen.push(e));
    releaseAgentEngine();
    releaseAgentEngine();
    expect(seen).toEqual(["builtin"]);
  });
});

/**
 * `orchestrator.ts` imports this module, so a storage shape that throws would throw
 * at *import* time in the orchestrator's own suite — which runs in node, where
 * `globalThis.localStorage` is a defined-but-inert `{}`. This is the exact defect
 * that blocked PR4, so it gets the same three-shape corpus the bridge client has.
 */
describe("evalEngine — hostile Storage shapes", () => {
  it("survives storage being absent entirely", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => getEngine()).not.toThrow();
    expect(getEngine()).toBe("builtin");
    expect(() => setEngine("agent")).not.toThrow();
  });

  it("survives a defined-but-inert Storage (Node ≥ 22 bare object)", () => {
    vi.stubGlobal("localStorage", {});
    expect(() => getEngine()).not.toThrow();
    expect(getEngine()).toBe("builtin");
    expect(() => setEngine("agent")).not.toThrow();
  });

  it("survives a throwing getter (private-mode shape)", () => {
    vi.stubGlobal("localStorage", {
      get getItem(): never {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    expect(() => getEngine()).not.toThrow();
    expect(getEngine()).toBe("builtin");
  });

  it("keeps the selection in memory when the write throws (quota shape)", () => {
    installStorage(
      {},
      {
        setItem: () => {
          throw new DOMException("QuotaExceededError");
        },
      },
    );
    expect(() => setEngine("agent")).not.toThrow();
    // Not persisted, but the user's choice still holds for this session.
    expect(getEngine()).toBe("agent");
  });
});
