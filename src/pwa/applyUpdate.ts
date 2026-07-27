/**
 * Gets the tab onto the build the banner is advertising.
 *
 * The reload is ours rather than the service worker's, because the worker's own
 * hand-over signal only arrives in one of the three states this button can be
 * clicked in — and in the other two the plugin's `updateServiceWorker()` is a
 * silent no-op, which is how the banner ended up with a dead Reload button in
 * v0.11.0. The states, all reproducible against a two-build static server:
 *
 *  - **A worker is waiting, and the tab is controlled.** The normal case. Ask it
 *    to skip waiting; it activates, and we reload onto it.
 *  - **A worker is waiting, and the tab is not controlled.** It activates, but no
 *    `controllerchange` ever reaches an uncontrolled tab (a hard reload bypasses
 *    the worker, and a `prompt`-mode build does not call `clients.claim()`), so
 *    nothing was reloading the page.
 *  - **Nothing is waiting.** A new worker that finds no client under its
 *    predecessor's control activates immediately instead of waiting, so by the
 *    time the banner is clicked there is no waiting worker left to message —
 *    `messageSkipWaiting()` bails on `registration.waiting` being null. The tab
 *    is stale only in memory; a plain reload *is* the whole update.
 */

/** How long to let the hand-over finish before reloading regardless. */
const HANDOVER_TIMEOUT_MS = 3_000;

export interface ApplyUpdateOptions {
  /** The app's service-worker registration, if one was ever established. */
  registration: ServiceWorkerRegistration | undefined;
  /** Asks the waiting worker to activate — vite-plugin-pwa's `updateServiceWorker`. */
  requestSkipWaiting: () => void;
  /** Navigates onto the new build. Injected so the decision stays testable. */
  reload: () => void;
}

export function applyUpdate({ registration, requestSkipWaiting, reload }: ApplyUpdateOptions): void {
  const waiting = registration?.waiting;

  // Nothing to hand over to: reloading now is the update.
  if (!waiting) {
    reload();
    return;
  }

  let reloaded = false;
  const reloadOnce = () => {
    if (reloaded) return;
    reloaded = true;
    reload();
  };

  // Reloading before the new worker activates would just re-serve the old
  // precache, so wait for it — but never longer than the timeout. A worker that
  // goes redundant, or one that never answers the message, must not be able to
  // leave the button doing nothing.
  waiting.addEventListener("statechange", () => {
    if (waiting.state === "activated") reloadOnce();
  });
  setTimeout(reloadOnce, HANDOVER_TIMEOUT_MS);

  requestSkipWaiting();
}
