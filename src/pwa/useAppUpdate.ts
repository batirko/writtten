/**
 * Surfaces "a new build is ready" to the UI, and keeps a long-open tab honest.
 *
 * Three parts by now, each learned the hard way. (1) The service worker
 * (`registerType: 'prompt'`) fires `onNeedRefresh` when a newer build has
 * downloaded; the banner reads `needRefresh` and `updateApp()` applies it.
 * (2) A tab that never navigates would never re-fetch `sw.js`, so it would never
 * *notice* a deploy — we poll `registration.update()` on an interval and on
 * tab-focus. That check is only meaningful because `sw.js` is served `no-cache`;
 * while it was cached for four hours (a Cloudflare default overriding
 * `_headers`), every poll saw the same stale worker and the app silently ran old
 * code across three releases. (3) Applying the update is `applyUpdate`, not the
 * plugin's `updateServiceWorker` alone — that call is a silent no-op in two of
 * the three states the banner can be clicked in, which is how v0.11.0 shipped a
 * Reload button that did nothing. See `applyUpdate` for the three states.
 */
import { useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { applyUpdate } from "./applyUpdate";

/** How often a foregrounded tab asks the SW to check the origin for a new build. */
const UPDATE_POLL_MS = 60_000;

export interface AppUpdate {
  /** A newer build has downloaded and is waiting to activate. */
  needRefresh: boolean;
  /** Get the tab onto the new build, whether or not a worker is still waiting. */
  updateApp: () => void;
  /** Keep the current build for now; the banner can re-appear next check. */
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdate {
  // The registration is what tells `applyUpdate` which of the three hand-over
  // states the tab is in; the plugin only hands it to us here, once.
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      registrationRef.current = registration;
      const check = () => void registration.update();
      // The blessed vite-plugin-pwa periodic-update pattern: a lightweight
      // update() every minute, plus one the moment the tab is refocused (a
      // background tab is where staleness hides). Lives for the app's lifetime —
      // there is no unmount to clean up against, and the cost is one HEAD-ish
      // revalidation of a no-cache file.
      setInterval(check, UPDATE_POLL_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });

  return {
    needRefresh,
    updateApp: () =>
      applyUpdate({
        registration: registrationRef.current,
        requestSkipWaiting: () => void updateServiceWorker(true),
        reload: () => window.location.reload(),
      }),
    dismiss: () => setNeedRefresh(false),
  };
}
