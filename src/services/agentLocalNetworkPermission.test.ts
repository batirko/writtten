import { describe, it, expect, vi } from "vitest";
import {
  queryLoopbackPermission,
  preflightBranch,
  subscribeLoopbackPermission,
  LOOPBACK_PERMISSION_NAMES,
  CONFIRMED_GATE_NAMES,
  type PermissionQuery,
  type PermissionStatusLike,
} from "./agentLocalNetworkPermission";

/** Builds a query that answers per name, and throws for anything unlisted —
 *  which is how a real engine answers for a name outside its PermissionName enum. */
function engine(states: Record<string, string>): PermissionQuery {
  return async ({ name }) => {
    if (!(name in states)) {
      throw new TypeError(`'${name}' is not a valid enum value of type PermissionName`);
    }
    return { state: states[name], onchange: null };
  };
}

describe("agentLocalNetworkPermission", () => {
  // The measured engine shapes (2026-07-23, writtten.com, control-validated).
  // These two pin the reason the module holds a LIST: each engine answers for
  // the other's name with a plausible, wrong state.
  describe("the measured engine shapes", () => {
    it("Chrome: both names resolve — takes local-network-access, not the decoy", async () => {
      // The decoy is the dangerous half: local-network reads `prompt` on a machine
      // where loopback is genuinely granted. Reading it would raise a pre-flight at
      // every connect for every Chrome user who already allowed the prompt.
      const result = await queryLoopbackPermission(
        engine({ "local-network-access": "granted", "local-network": "prompt" })
      );
      expect(result.name).toBe("local-network-access");
      expect(result.state).toBe("granted");
      expect(result.confirmed).toBe(true);
      expect(preflightBranch(result)).toBe("granted");
    });

    it("Firefox: the first name throws, so it falls through to local-network", async () => {
      // Firefox does not lack the permission — it exposes it under the other name.
      // The milestone predicted "probably lacks it"; that was measured false.
      const result = await queryLoopbackPermission(engine({ "local-network": "prompt" }));
      expect(result.name).toBe("local-network");
      expect(result.state).toBe("prompt");
    });
  });

  describe("candidate order", () => {
    it("asks local-network-access first — the order is load-bearing", async () => {
      const asked: string[] = [];
      const query: PermissionQuery = async ({ name }) => {
        asked.push(name);
        return { state: "prompt" };
      };
      await queryLoopbackPermission(query);
      // Only the first is asked, because it resolved.
      expect(asked).toEqual(["local-network-access"]);
      expect(LOOPBACK_PERMISSION_NAMES[0]).toBe("local-network-access");
    });
  });

  describe("raw states pass through", () => {
    it.each(["granted", "prompt", "denied"] as const)("maps %s", async (state) => {
      const result = await queryLoopbackPermission(engine({ "local-network-access": state }));
      expect(result.state).toBe(state);
    });

    it("maps an unrecognised state string to unknown rather than trusting it", async () => {
      const result = await queryLoopbackPermission(engine({ "local-network-access": "weird" }));
      expect(result.state).toBe("unknown");
    });
  });

  describe("the unreadable paths — all four collapse to the fallback branch", () => {
    it("returns unknown when every candidate throws", async () => {
      const result = await queryLoopbackPermission(engine({}));
      expect(result).toMatchObject({ state: "unknown", name: null, confirmed: false });
      expect(preflightBranch(result)).toBe("unknown");
    });

    it("returns unknown when the query rejects rather than throws", async () => {
      const result = await queryLoopbackPermission(() => Promise.reject(new Error("nope")));
      expect(result.state).toBe("unknown");
    });

    it("returns unknown when the Permissions API is absent entirely", async () => {
      expect((await queryLoopbackPermission(undefined)).state).toBe("unknown");
    });

    it("returns unknown when a query resolves with nothing usable", async () => {
      const result = await queryLoopbackPermission(
        async () => ({}) as unknown as PermissionStatusLike
      );
      expect(result.state).toBe("unknown");
    });
  });

  describe("the force-denying shell", () => {
    // Measured: the Electron browser inside an AI coding app denies everything,
    // controls included — and /agent now recommends those browsers first.
    it("refuses to read denied as data when the controls are denied too", async () => {
      const result = await queryLoopbackPermission(
        engine({
          "local-network-access": "denied",
          geolocation: "denied",
          notifications: "denied",
          camera: "denied",
        })
      );
      expect(result.state).toBe("unknown");
      expect(preflightBranch(result)).toBe("unknown");
    });

    it("trusts a real denied when the controls still say prompt", async () => {
      // Real Chrome with the permission genuinely blocked by the user.
      const result = await queryLoopbackPermission(
        engine({
          "local-network-access": "denied",
          geolocation: "prompt",
          notifications: "prompt",
          camera: "prompt",
        })
      );
      expect(result.state).toBe("denied");
      expect(preflightBranch(result)).toBe("denied");
    });

    it("does not run the control row for granted or prompt", async () => {
      // The check exists to protect the refuse-to-probe branch; a granted reading
      // costs nothing if the environment is odd, and the extra queries would be
      // three wasted round-trips on every single connect.
      const asked: string[] = [];
      const query: PermissionQuery = async ({ name }) => {
        asked.push(name);
        return { state: "granted" };
      };
      await queryLoopbackPermission(query);
      expect(asked).toEqual(["local-network-access"]);
    });

    it("treats an unknown control as proving nothing — a real denied stands", async () => {
      const result = await queryLoopbackPermission(
        engine({ "local-network-access": "denied", geolocation: "prompt" })
      );
      expect(result.state).toBe("denied");
    });
  });

  describe("preflightBranch — the conservative rule", () => {
    // Asymmetric risk: mis-hiding a pre-flight costs a redundant paragraph;
    // a wrong `denied` refuses to probe a connection that would have worked.
    it("collapses an UNCONFIRMED name to unknown, even when it says denied", async () => {
      const result = await queryLoopbackPermission(engine({ "local-network": "denied" }));
      expect(result.state).toBe("denied");
      expect(result.confirmed).toBe(false);
      expect(preflightBranch(result)).toBe("unknown");
    });

    it("does not trust an unconfirmed granted either", async () => {
      const result = await queryLoopbackPermission(engine({ "local-network": "granted" }));
      expect(preflightBranch(result)).toBe("unknown");
    });

    it("only local-network-access is a confirmed gate so far", () => {
      // Firefox's local-network joins this list the moment a connect-and-allow is
      // observed to flip it to `granted` — see the module header.
      expect(CONFIRMED_GATE_NAMES).toEqual(["local-network-access"]);
    });
  });

  describe("subscribeLoopbackPermission", () => {
    it("uses addEventListener when present, and unsubscribes", () => {
      const add = vi.fn();
      const remove = vi.fn();
      const status = {
        state: "prompt",
        addEventListener: add,
        removeEventListener: remove,
      } as PermissionStatusLike;
      const fn = () => {};
      const off = subscribeLoopbackPermission(status, fn);
      expect(add).toHaveBeenCalledWith("change", fn);
      off();
      expect(remove).toHaveBeenCalledWith("change", fn);
    });

    it("falls back to onchange without clobbering an existing handler", () => {
      const previous = vi.fn();
      const status: PermissionStatusLike = { state: "prompt", onchange: previous };
      const mine = vi.fn();
      const off = subscribeLoopbackPermission(status, mine);
      status.onchange?.();
      expect(previous).toHaveBeenCalledOnce();
      expect(mine).toHaveBeenCalledOnce();
      off();
      expect(status.onchange).toBe(previous);
    });

    it("is a no-op on a null status", () => {
      expect(() => subscribeLoopbackPermission(null, () => {})()).not.toThrow();
    });
  });
});
