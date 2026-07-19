/**
 * Build-time feature flags.
 *
 * Module-level named consts, following the `DEBUG_PANEL_ENABLED` precedent in
 * `ControlCenter.tsx` — one obvious toggle point, and a literal `false` lets the bundler
 * dead-code-eliminate the whole gated surface.
 */

/**
 * Bring-your-own-agent bridge ("Connect your agent").
 *
 * ON since PR4 (2026-07-19). The gate for flipping it was deployed-origin verification,
 * not local: the bridge bakes an Origin allowlist from `window.location.origin`, and the
 * mixed-content / Local-Network-Access behaviour that carries the real risk only appears
 * over HTTPS — so a localhost pairing proves nothing about the hosted app. Verified by
 * pairing against a Cloudflare preview origin, then against writtten.com itself, in
 * Chrome (including the one-time LNA prompt) and Firefox, with Safari showing the honest
 * unsupported note. See docs/projects/agent_connected_eval.md decision 10 + § PR4 as built.
 *
 * Turning this back to `false` is a complete kill switch: it removes the connect section,
 * the process-readout row, and both first-run on-ramps. Cards already in the feed keep
 * their source chips, because attribution is not flag-gated — an observation an agent
 * wrote must not start reading as writtten's own just because the flag moved.
 */
export const FEATURE_AGENT_BRIDGE = true;
