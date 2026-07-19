/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { isAgentOnly, setAgentOnly, subscribeAgentOnly } from "./agentOnlyMode";

const KEY = "writtten_agent_only_mode";

/**
 * This tree's jsdom exposes `localStorage` as a bare object with no Storage
 * methods, so the suite installs its own Map-backed one. That is also what lets
 * the failure cases below be driven honestly: a real browser throws on
 * `getItem` in some privacy modes and on `setItem` at quota, and the only way
 * to exercise the module's try/catch is to make the backing store throw.
 */
function installStorage(over: Partial<Storage> = {}) {
  const map = new Map<string, string>();
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

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agentOnlyMode", () => {
  it("defaults to off — connecting an agent never silently pauses the built-in checks", () => {
    expect(isAgentOnly()).toBe(false);
  });

  it("round-trips through localStorage", () => {
    setAgentOnly(true);
    expect(localStorage.getItem(KEY)).toBe("1");
    expect(isAgentOnly()).toBe(true);

    setAgentOnly(false);
    expect(localStorage.getItem(KEY)).toBe("0");
    expect(isAgentOnly()).toBe(false);
  });

  it("pushes the current value on subscribe and again on change", () => {
    const seen: boolean[] = [];
    const unsub = subscribeAgentOnly((v) => seen.push(v));
    expect(seen).toEqual([false]);

    setAgentOnly(true);
    expect(seen).toEqual([false, true]);

    unsub();
    setAgentOnly(false);
    expect(seen).toEqual([false, true]);
  });

  it("reads a malformed stored value as off", () => {
    localStorage.setItem(KEY, "yes");
    expect(isAgentOnly()).toBe(false);
  });

  it("reads as off when storage throws, so a broken localStorage can't silently mute our own checks", () => {
    installStorage({
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(isAgentOnly()).toBe(false);
  });

  it("still notifies listeners when the write fails", () => {
    installStorage({
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    const seen: boolean[] = [];
    const unsub = subscribeAgentOnly((v) => seen.push(v));
    expect(() => setAgentOnly(true)).not.toThrow();
    expect(seen).toEqual([false, true]);
    unsub();
  });
});
