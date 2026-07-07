import { Component, type ErrorInfo, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// ErrorBoundary — a top-level guard (lifecycle_integrity.md § L9). There was no
// React error boundary in the tree (main.tsx wrapped only StrictMode), so an
// uncaught error in a render/lifecycle (a malformed card, a provider adapter,
// App's own render) would blank/remount the whole app and wipe in-memory
// diagnostics. Mounted in main.tsx wrapping <App/> so it's genuinely top-level.
//
// This catches render/lifecycle errors in the subtree and shows a calm recovery
// surface instead of a white screen. Note: it does NOT catch async errors (a
// rejected provider promise, an event handler) — React error boundaries never
// do; those paths handle their own failures. This is hygiene for the render path.
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for diagnosis; the persisted LLM debug log (sessionStorage) also
    // survives this remount, so the evidence is still there after a reload.
    console.error("App error boundary caught:", error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <h1 className="error-boundary-title">Something broke on screen.</h1>
            <p className="error-boundary-body">
              Your document is safe — it&rsquo;s stored on this device, not in the view that failed.
              Reload to pick up where you left off.
            </p>
            <button className="error-boundary-btn" onClick={this.handleReload}>
              Reload
            </button>
            <details className="error-boundary-details">
              <summary>Details</summary>
              <pre>{this.state.error.message}</pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
