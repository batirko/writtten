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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
