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

/**
 * Why the caller can name an intent: the modal has two on-ramps now, and
 * "Connect your agent" in the welcome modal / keyless banner carries the same
 * label as the button inside the connect section. Landing the user on a closed
 * section and asking them to press the same words again is the worse read, so
 * the opener says which one it meant and ControlCenter starts it.
 */
export type SettingsIntent = "connect-agent";

/** Request that the BYOK Settings modal open. Safe to call from anywhere. */
export function openSettings(intent?: SettingsIntent): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: intent }));
}

/**
 * Subscribe to open-settings requests. Returns an unsubscribe fn (wire it up in
 * a `useEffect` cleanup). Only ControlCenter should subscribe.
 */
export function subscribeOpenSettings(handler: (intent?: SettingsIntent) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<SettingsIntent | undefined>).detail);
  window.addEventListener(OPEN_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}
