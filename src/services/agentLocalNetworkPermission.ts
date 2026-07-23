/**
 * Can we read the browser's local-network permission *before* we probe? (BYOA)
 *
 * Connecting an agent makes the app fetch `http://127.0.0.1:<port>` from a public
 * origin, which makes the browser raise a local-network permission dialog. That
 * dialog is browser chrome: invisible to the page, unobservable by any automation,
 * and a user who dismisses it strands the pairing in a wait that can never end.
 *
 * The dialog stays invisible — but the *state* behind it is readable, and that is
 * enough to stop meeting it cold. This module is the read.
 *
 * ## Why a list and not a constant — measured, not inferred
 *
 * The two engines expose this permission under **different names**, and each
 * browser also answers for the *other* name with a state that looks plausible and
 * is wrong. Measured 2026-07-23 on `https://writtten.com`, each reading validated
 * by querying `geolocation`/`notifications`/`camera` in the same call (all three
 * must come back `prompt`; an environment that force-denies everything — the
 * Electron-based desktop shell does — is reporting its own policy, not the user's):
 *
 * | engine      | `local-network-access` | `local-network`    |
 * | ----------- | ---------------------- | ------------------ |
 * | Chrome 150  | `granted` ← real gate  | `prompt` (decoy)   |
 * | Firefox 152 | throws `TypeError`     | `prompt`           |
 *
 * So the order below is load-bearing, not cosmetic. `local-network-access` must be
 * tried **first**: on Chrome the other name resolves to `prompt` even when loopback
 * is genuinely `granted`, so reversing the order would raise a pre-flight at every
 * connect for every user who already allowed it — silently, and only on the browser
 * most users are on. Invalid names throw a distinguishable `TypeError`, which is
 * what makes "try the next one" a safe strategy rather than a guess.
 *
 * This milestone has already shipped wrong twice from per-browser copy written off
 * spec rather than measured. Re-measure before editing the tables above; do not
 * reason from MDN.
 */

/** The subset of `PermissionStatus` used here — so tests need no DOM. */
export interface PermissionStatusLike {
  state: string;
  onchange?: (() => void) | null;
  addEventListener?: (type: "change", fn: () => void) => void;
  removeEventListener?: (type: "change", fn: () => void) => void;
}

/** The subset of `navigator.permissions.query` used here, injectable. */
export type PermissionQuery = (descriptor: {
  name: string;
}) => Promise<PermissionStatusLike>;

/**
 * Candidate names, in priority order. First that *resolves* wins — see the header
 * for why the order cannot be swapped.
 */
export const LOOPBACK_PERMISSION_NAMES = [
  "local-network-access",
  "local-network",
] as const;

/**
 * Names measured to actually track the loopback grant.
 *
 * `local-network-access` is here because a real grant on this machine — the owner
 * allowing Chrome's prompt during the 2026-07-20 landing verification — reads back
 * as `granted` through it. That is the whole proof, and no other name has it.
 *
 * `local-network` is deliberately absent. Firefox exposes it and it resolves, but
 * resolving is not the same as gating: Firefox's own local-network prompt was
 * allowed on 2026-07-20 and the name still reads `prompt`, which is equally
 * consistent with "the grant was cleared" and with "this name does not track
 * loopback at all". Until a Firefox connect-and-allow is observed to flip it to
 * `granted`, an unconfirmed name is treated as no reading (see `preflightBranch`).
 */
export const CONFIRMED_GATE_NAMES: readonly string[] = ["local-network-access"];

/**
 * Permissions used only as a control row, to catch an environment that answers
 * `denied` to everything as a matter of policy.
 *
 * This is the same discipline the manual measurement uses, moved into the code
 * because the failure it prevents is now on a recommended path. Measured
 * 2026-07-23: the Electron-based browser inside an AI coding app returned
 * `denied` for the loopback name *and* for all three of these — while real
 * Chrome returned `prompt` for all three. A shell reporting its own policy is
 * not the user's answer, and `/agent` now recommends exactly those browsers as
 * the most natural home for this feature.
 *
 * Three, not one: a user can legitimately have denied any single permission, so
 * one control would misfire. All three denied at once is the shell's signature.
 */
export const SHELL_CONTROL_NAMES = ["geolocation", "notifications", "camera"] as const;

/**
 * Is this environment refusing everything on principle?
 *
 * Only consulted when the loopback name says `denied` — the one reading that
 * makes the app refuse to probe. Getting that wrong on a force-denying shell
 * would block a pairing that might well have worked, since a shell can deny the
 * Permissions API while still letting the loopback fetch through.
 */
async function deniesEverything(query: PermissionQuery): Promise<boolean> {
  for (const name of SHELL_CONTROL_NAMES) {
    try {
      const status = await query({ name });
      if (status?.state !== "denied") return false;
    } catch {
      // A control this engine doesn't know proves nothing either way; a shell is
      // identified by denying what it *does* implement.
      return false;
    }
  }
  return true;
}

export type LoopbackPermissionState = "granted" | "prompt" | "denied" | "unknown";

export interface LoopbackPermission {
  /** The raw state the matched name reported; `unknown` when nothing resolved. */
  state: LoopbackPermissionState;
  /** Which candidate answered, or `null` when none did. */
  name: string | null;
  /** Whether that name is measured to track the real loopback grant. */
  confirmed: boolean;
  /** Live status handle, so a caller can watch for the user allowing. */
  status: PermissionStatusLike | null;
}

const UNREADABLE: LoopbackPermission = {
  state: "unknown",
  name: null,
  confirmed: false,
  status: null,
};

function toState(raw: string): LoopbackPermissionState {
  return raw === "granted" || raw === "prompt" || raw === "denied" ? raw : "unknown";
}

/**
 * Try each candidate in order; take the first that resolves.
 *
 * A throw means the name is not in this engine's `PermissionName` enum — expected,
 * not exceptional (it is exactly how Firefox answers for `local-network-access`),
 * so it advances to the next candidate rather than failing. A rejected promise is
 * treated the same way: either is "this engine won't tell us", and the caller's
 * fallback branch is the honest response to both.
 */
export async function queryLoopbackPermission(
  query: PermissionQuery | undefined
): Promise<LoopbackPermission> {
  if (typeof query !== "function") return UNREADABLE;

  for (const name of LOOPBACK_PERMISSION_NAMES) {
    try {
      const status = await query({ name });
      // A resolving query that hands back nothing usable is not a reading.
      if (!status || typeof status.state !== "string") continue;
      const state = toState(status.state);
      // Verify the one reading that costs the user a connection if it's wrong.
      if (state === "denied" && (await deniesEverything(query))) return UNREADABLE;
      return {
        state,
        name,
        confirmed: CONFIRMED_GATE_NAMES.includes(name),
        status,
      };
    } catch {
      // Unknown enum member (TypeError) or a rejected query — try the next name.
    }
  }
  return UNREADABLE;
}

/**
 * The branch the connect UI should actually render.
 *
 * Collapses an **unconfirmed** name to `unknown` — the conservative reading, and
 * the asymmetry is the reason. Getting it wrong in the hide-the-pre-flight
 * direction costs a user one redundant paragraph; getting it wrong in the
 * `denied` direction makes the app refuse to probe a connection that would have
 * worked, which is the exact near-unrecoverable failure this whole feature exists
 * to remove. So a name we cannot vouch for buys nothing and is not trusted.
 *
 * When a Firefox connect-and-allow is observed to flip `local-network` to
 * `granted`, adding it to `CONFIRMED_GATE_NAMES` turns this on for Firefox — one
 * line, no other change.
 */
export function preflightBranch(permission: LoopbackPermission): LoopbackPermissionState {
  return permission.confirmed ? permission.state : "unknown";
}

/**
 * Watch for the state changing under us — the user allowing (or blocking) while
 * the pre-flight is on screen. Returns an unsubscribe.
 *
 * Prefers `addEventListener` and falls back to the `onchange` property: both are
 * present on every status measured, but the property form is the one older
 * engines implement, and clobbering a caller's handler is worse than either.
 */
export function subscribeLoopbackPermission(
  status: PermissionStatusLike | null,
  onChange: () => void
): () => void {
  if (!status) return () => {};
  if (typeof status.addEventListener === "function") {
    status.addEventListener("change", onChange);
    return () => status.removeEventListener?.("change", onChange);
  }
  const previous = status.onchange ?? null;
  status.onchange = () => {
    previous?.();
    onChange();
  };
  return () => {
    status.onchange = previous;
  };
}

/** Reads the live environment. Unreadable under SSR/tests, which is the fallback. */
export function currentLoopbackPermission(): Promise<LoopbackPermission> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return Promise.resolve(UNREADABLE);
  }
  const permissions = navigator.permissions;
  return queryLoopbackPermission(async (descriptor) => {
    // Two casts, both narrow. The DOM types enumerate `PermissionName`, which
    // carries neither candidate, and `PermissionStatus.onchange` is typed with a
    // DOM `Event` this module deliberately doesn't depend on (so the tests need
    // no DOM). The try/catch in `queryLoopbackPermission` is what makes querying
    // a name TypeScript's lib predates safe at runtime.
    const status = await permissions.query(descriptor as unknown as PermissionDescriptor);
    return status as unknown as PermissionStatusLike;
  });
}
