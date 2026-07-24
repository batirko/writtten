/**
 * Connects the service-worker update state to the banner. Kept separate from the
 * presentational `UpdateBanner` so the virtual `pwa-register` import never enters
 * the test graph. Mounted once, at the app shell (see `main.tsx`).
 */
import { useAppUpdate } from "./useAppUpdate";
import { UpdateBanner } from "./UpdateBanner";

export function AppUpdatePrompt() {
  const { needRefresh, updateApp, dismiss } = useAppUpdate();
  return <UpdateBanner show={needRefresh} onReload={updateApp} onDismiss={dismiss} />;
}
