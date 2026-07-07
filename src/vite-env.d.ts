/// <reference types="vite/client" />

// Build-stamp globals injected by Vite's `define` (see vite.config.ts).
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;

// Self-hosted @fontsource packages are CSS-only (no shipped type declarations).
declare module "@fontsource-variable/faustina";
declare module "@fontsource-variable/faustina/wght-italic.css";
declare module "@fontsource-variable/inter";
declare module "@fontsource/jetbrains-mono";
