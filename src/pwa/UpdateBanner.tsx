/**
 * The "new version ready" toast — presentational only, so it is testable without
 * the service-worker virtual module. The connected version is `AppUpdatePrompt`.
 */

export interface UpdateBannerProps {
  show: boolean;
  onReload: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({ show, onReload, onDismiss }: UpdateBannerProps) {
  if (!show) return null;
  return (
    <div className="update-banner" role="status" data-testid="update-banner">
      <div className="update-banner-text">
        <p className="update-banner-title">A new version of writtten is ready.</p>
        {/* No target version named: the running build can't know the number of the
            one it hasn't loaded yet. The current build + SHA are in Settings. */}
        <p className="update-banner-meta">Reload to update.</p>
      </div>
      <div className="update-banner-actions">
        <button
          type="button"
          className="update-banner-reload"
          data-testid="update-banner-reload"
          onClick={onReload}
        >
          Reload
        </button>
        <button
          type="button"
          className="update-banner-later"
          data-testid="update-banner-later"
          onClick={onDismiss}
        >
          Later
        </button>
      </div>
    </div>
  );
}
