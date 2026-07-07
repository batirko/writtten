import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts (local-first — no runtime Google Fonts fetch).
// Faustina: soft-contrast humanist serif for the writing canvas (§ visual_style Typography).
import "@fontsource-variable/faustina";
import "@fontsource-variable/faustina/wght-italic.css";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono";
import "./styles.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";

// Top-level ErrorBoundary (lifecycle_integrity.md § L9): a render/lifecycle crash
// in the app shows a calm recovery surface instead of a white screen. Wrapping
// <App/> here (rather than inside App) makes it genuinely top-level — it also
// catches an error thrown by App's own render.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
