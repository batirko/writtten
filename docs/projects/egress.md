---
status: idea
kind: spec
phases: [5]
summary: Build-ready specs for the three Phase 5 egress/install milestones — Markdown+PDF export, rich-text+Markdown copy, and PWA install/offline — scoped and decided so a mechanical agent can execute without judgment calls. Lean by design (print-to-PDF behind a seam; no library until it earns its place).
---

# Egress & install (Export · Copy · PWA)

> **Readiness target:** this doc exists to take the Export / Copy / PWA milestones from 🟡 (mostly defined) to 🟢 (ready to build) so they can be delegated to a 🔧/⚙️ agent. Every decision is made here; the agent implements, it does not design. Visual/empty-state polish is explicitly **out of scope** — it rides with Onboarding & Visual style (🧠) in Phase 5.

## Status

**Idea — Phase 5.** Decisions locked 2026-06-06 (lean path; PDF via browser print-to-PDF behind a swappable seam). Three independent deliverables that share one new module (`src/services/export.ts`) and one new cluster of header buttons in `src/sidecar/SidecarFeed.tsx`.

Read alongside:

- `docs/architecture.md` (export formats are a named extension seam — keep `export.ts` pluggable).
- `docs/projects/ai_tooling_integration.md` (markitdown binary _import_ is the deferred sibling; this doc is the _egress_ side).
- `CLAUDE.md` invariant 5 (local-first / no required server — everything here is client-side).

## Phased Plan

| Phase | Contributes                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| **5** | Export (MD + print-to-PDF), Copy (MD + rich text), PWA (installable + offline app shell). All client-side. |

## Todo

### D1 — Serialization seam (`src/services/export.ts`, new) — do first

- [ ] Create `src/services/export.ts` exporting a pure-ish module that takes the live TipTap editor and produces output. No React, no DOM coupling beyond the clipboard/anchor calls.

  ```ts
  import type { Editor } from "@tiptap/react";

  /** Markdown serialization — tiptap-markdown is already a dependency. */
  export function toMarkdown(editor: Editor): string {
    return editor.storage.markdown.getMarkdown();
  }

  /** Full HTML for the document body (used for rich-text clipboard). */
  export function toHtml(editor: Editor): string {
    return editor.getHTML();
  }

  /** Trigger a browser file download of a string as a named file. */
  export function downloadFile(filename: string, mime: string, content: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  export function downloadMarkdown(editor: Editor, filename = "document.md"): void {
    downloadFile(filename, "text/markdown", toMarkdown(editor));
  }

  /** Copy Markdown as plain text. */
  export async function copyMarkdown(editor: Editor): Promise<void> {
    await navigator.clipboard.writeText(toMarkdown(editor));
  }

  /** Copy rich text: HTML + plaintext fallback, so paste targets pick the best. */
  export async function copyRichText(editor: Editor): Promise<void> {
    const html = toHtml(editor);
    const md = toMarkdown(editor);
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([md], { type: "text/plain" }),
      }),
    ]);
  }

  /** PDF — THE SWAPPABLE SEAM. Today: browser print-to-PDF via a print
   *  stylesheet (see D4). Later: replace this function body with a pdf-lib /
   *  jsPDF generator. No caller changes — they only call exportPdf(). */
  export function exportPdf(): void {
    window.print();
  }
  ```

- [ ] Unit test `src/services/export.test.ts`: build a headless editor (the repo already runs TipTap under jsdom in `section.test.ts` — follow that setup), assert `toMarkdown` round-trips a heading+paragraph+bullet doc, and assert `downloadFile` constructs an anchor with the right `download` attr (stub `URL.createObjectURL`/anchor click). Clipboard functions: assert they call a mocked `navigator.clipboard`.

### D2 — Expose the live editor to the feed buttons

The editor instance lives in `src/editor/Editor.tsx` (`useEditor`). The export/copy buttons live in the sidecar header. Bridge them through `App.tsx` (mirror the existing prop-drilling pattern; do **not** use the dev-only `harness` — it's stripped in prod).

- [ ] In `Editor.tsx`: add an optional prop `onReady?: (editor: Editor) => void` and call it from a `useEffect([editor])` once `editor` is non-null (and call `onReady(/* still valid */)` is not needed on teardown). Type `Editor` from `@tiptap/react`.
- [ ] In `App.tsx`: hold `const editorRef = useRef<Editor | null>(null)`; pass `onReady={(e) => (editorRef.current = e)}` to `<Editor>`. Define four handlers (`handleExportMarkdown`, `handleExportPdf`, `handleCopyMarkdown`, `handleCopyRichText`) that guard `editorRef.current` and call the `export.ts` functions. Pass them to `<SidecarFeed>` as props.

### D3 — Export/copy buttons in the feed header

The header button row is `src/sidecar/SidecarFeed.tsx` ~L353–423 (clear-workspace, import, settings buttons — `className="settings-toggle-btn"`). Add an export/copy affordance consistent with those.

- [ ] Add a small **Export** menu button (or two buttons — keep it lean: one "Download" with MD/PDF and one "Copy" with MD/Rich is fine) in that row. Wire `onClick` to the props from D2.
- [ ] `data-testid`s (for the harness exit criterion in `docs/plan.md`): `export-md`, `export-pdf`, `copy-md`, `copy-rich`. Add a transient "Copied!" confirmation for the copy actions (reuse the existing `copySuccess` pattern at SidecarFeed L684).
- [ ] Disable/hide the buttons when the document is empty (no blocks) so export-of-nothing isn't offered.

### D4 — Print-to-PDF stylesheet

- [ ] Add an `@media print` block (in `src/styles.css`) that: hides `.sidecar-panel`, the debug panel, all header chrome, and ProseMirror decorations/highlights; shows only `.tiptap` document content; sets sane page margins and black-on-white type. The observation highlights must NOT print (they're annotations, not content).
- [ ] `exportPdf()` (D1) calls `window.print()`; the user picks "Save as PDF" in the native dialog. Document this in the button `title`/tooltip so the affordance is honest ("Print / Save as PDF").
- [ ] **Seam note for the future library swap:** when output fidelity demands it, replace only `exportPdf()` in `export.ts` with a pdf-lib/jsPDF generator driven by `toMarkdown`/`toHtml`. Callers (D2/D3) are unaffected. Keep the print CSS — it stays useful for actual printing.

### D5 — PWA: installable + offline app shell

- [ ] Add `vite-plugin-pwa` (devDependency) — the conventional, low-error path; it generates the manifest + a Workbox service worker. (Hand-rolling a SW is the zero-dep alternative but is error-prone for a mechanical agent; prefer the plugin.) Configure in `vite.config.ts`:
  ```ts
  import { VitePWA } from "vite-plugin-pwa";
  // plugins: [react(), VitePWA({ registerType: "autoUpdate", manifest: {...} })]
  ```
- [ ] Manifest: `name: "writtten"`, `short_name`, `theme_color`/`background_color` (match the app's calm palette — placeholder hex is fine, the visual pass tunes it), `display: "standalone"`, `start_url: "/"`. Icons: `192x192`, `512x512`, and a `512x512` maskable, in `/public` (create the `public/` dir; a simple generated/placeholder icon is acceptable — final art rides with Visual style 🧠).
- [ ] Workbox: precache the built app shell (JS/CSS/HTML) so the editor loads offline. The app is already fully client-side (IndexedDB persistence), so offline editing works once the shell is cached.
- [ ] **Offline behavior of LLM calls:** Gemini requests fail offline by design. Confirm the failure is already handled gracefully (the existing per-request timeout / stall affordance from `evaluation_signal_quality.md` should surface "couldn't reach the model" rather than crashing). If not graceful, file it — do **not** build a new offline-queue here (out of scope).
- [ ] Verify the SW registers: the plugin injects registration; confirm `navigator.serviceWorker` is controlling in a production preview build (`npm run build && npm run preview`). Add `data-testid="pwa-install"` only if a custom install button is added — otherwise the browser's native install prompt is sufficient and no testid is needed (note this in `agent_acceptance_harness.md`).

### Out of scope (hand to the 🧠 product-feel pass)

- Empty/early-state visual design ("quiet by design") — owned by **Onboarding & first-run** and **Visual style** in `docs/plan.md`.
- Final icon/splash art, theme-color tuning — owned by **Visual style**.
- Binary-format import (DOCX/PDF via markitdown) — deferred, `ai_tooling_integration.md`.

## Verification

1. `npm test` — `export.test.ts` green (Markdown round-trip + download/clipboard mocks).
2. Preview (`preview_start`): type a multi-section doc, click **Download MD** → file downloads with correct content; click **Copy Rich** → paste into a rich target shows formatting; click **Export PDF** → native print dialog shows document-only (no sidecar, no highlights).
3. Production build offline check: `npm run build && npm run preview`, load once, go offline (devtools), reload — app shell + editor still load; previously-typed doc persists from IndexedDB.
