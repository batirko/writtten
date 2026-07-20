/**
 * Can this browser reach a bridge on 127.0.0.1 at all? (BYOA)
 *
 * The bridge is plain HTTP on loopback. WebKit on Apple platforms refuses that
 * request from an HTTPS page — it is mixed content, and no permission prompt
 * exists to grant it (Chrome and Firefox both prompt for local-network access;
 * Safari has nothing to prompt with). So on writtten.com, Safari and every iOS
 * browser can never complete a pairing.
 *
 * We knew this before shipping — the connect panel already says "Chrome, Edge,
 * or Firefox" in help text — and then started an infinite probe loop anyway,
 * leaving the user on "Waiting for your agent…" forever. A limitation we can
 * detect before the first probe should be stated, not discovered.
 *
 * Pure and argument-injected so it is testable without a DOM.
 */

export type AgentBrowserSupport =
  | { supported: true }
  | { supported: false; reason: "webkit_loopback" };

/**
 * `navigator.vendor` is the honest predicate here, not a UA substring: it is
 * "Apple Computer, Inc." for Safari AND for Chrome/Firefox on iOS, which are
 * WebKit underneath and equally blocked. Sniffing for the literal "Safari" token
 * would both miss those and false-positive on Chrome desktop, whose UA carries
 * "Safari" for historical reasons.
 */
export function agentBrowserSupport(
  vendor: string | undefined,
  protocol: string
): AgentBrowserSupport {
  const isAppleWebKit = vendor === "Apple Computer, Inc.";
  // Scoped to HTTPS deliberately. From an `http://localhost` origin (the
  // self-hoster's dev server) the loopback request is same-scheme and there is
  // no mixed-content block, so refusing there would deny a path that works.
  if (isAppleWebKit && protocol === "https:") {
    return { supported: false, reason: "webkit_loopback" };
  }
  return { supported: true };
}

/** Reads the live environment. Returns `supported` under SSR/tests where there
 *  is no navigator — the pessimistic default would disable the feature during
 *  unit tests for no reason, and the probe loop is the fallback either way. */
export function currentAgentBrowserSupport(): AgentBrowserSupport {
  if (typeof navigator === "undefined" || typeof location === "undefined") {
    return { supported: true };
  }
  return agentBrowserSupport(navigator.vendor, location.protocol);
}
