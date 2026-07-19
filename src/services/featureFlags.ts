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
 * OFF until the deployed-origin verification in PR4 (pairing confirmed in Chrome incl.
 * the Local Network Access prompt, and in Firefox). Flipping this to `true` is what
 * "landed" means for the GTM spike — see docs/projects/agent_connected_eval.md
 * decision 10.
 */
export const FEATURE_AGENT_BRIDGE = false;
