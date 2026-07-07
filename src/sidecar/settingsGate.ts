// settingsGate — a tiny typed opener so surfaces outside the ControlCenter (the
// first-run welcome modal, the standing keyless banner) can deep-link into the
// BYOK Settings modal without owning its open state. ControlCenter subscribes
// once and flips its own `showSettings`; callers just fire `openSettings()`.
//
// Decoupled on purpose: the feed/onboarding lane must not reach into
// ControlCenter's internals (it's another lane's hub file). A window
// CustomEvent is the one seam both sides can share cheaply — see
// docs/projects/onboarding_first_run.md § Revision (2026-07-07), Decision #4.

const OPEN_SETTINGS_EVENT = "writtten:open-settings";

/** Request that the BYOK Settings modal open. Safe to call from anywhere. */
export function openSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

/**
 * Subscribe to open-settings requests. Returns an unsubscribe fn (wire it up in
 * a `useEffect` cleanup). Only ControlCenter should subscribe.
 */
export function subscribeOpenSettings(handler: () => void): () => void {
  window.addEventListener(OPEN_SETTINGS_EVENT, handler);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler);
}
