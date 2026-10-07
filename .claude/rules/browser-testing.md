---
paths:
  - "src/**"
  - "public/**"
  - "docs/acceptance-testing/**"
---

# Browser testing and the dev harness

Acceptance tests live in `docs/acceptance-testing/`; each file defines its automated and human split.

## Which browser

- **Default to the built-in Browser pane.** It's one pane per session, addressed by the `tabId` from `preview_start`, so another session can't hijack it. If `:5173` is already running, open it by `url`. `preview_start` by `name: "writtten"` (from `.claude/launch.json`) only works when the port is free.
- **`computer` typing produces real ProseMirror transactions** and drives the eval pipeline (verified 2026-07-12). Use it as the default for typing into the editor.
- **Use chrome-devtools only when you need its fidelity:** hover or keyboard input ProseMirror rejects as synthetic, or native dialogs. It's one shared browser with a single global "selected page", and `isolatedContext` doesn't isolate the selection. Another session's `new_page` or `select_page` can switch your page between calls, and your next read returns another branch's app. When other sessions are live:
  - Do the whole flow in one `evaluate_script`, so there's no gap between calls.
  - Start every eval with a port guard: `if (!location.href.includes('<my-port>')) return { ABORT: location.href };`
  - Call `select_page(<id>, bringToFront: true)` right before any call you can't guard, such as a screenshot.
- **chrome-devtools `wait_for` matches the whole accessibility tree, history included.** Wait for something that only appears after your action, such as `"idle"` on `[data-testid="sidecar-status"]`.

## Ports and pages

- **To show or drive a feature branch, serve it on its own port from its own worktree:** `npm run dev -- --port <NNNN> --strictPort`. Don't reuse the shared `:5173`; it may be running another branch. Each port also gets its own IndexedDB and harness state. Tear down the server and worktree when you're done.
- **To check a static page under `public/` in dev, request `index.html` explicitly** (`/agent/index.html`). The dev server's SPA fallback answers `/agent/` with the app, so the page looks broken when it isn't. Production serves the file, so ship `/agent/` in app copy.

## The dev harness (`window.__sidecar__`)

A dev-only observability and control surface, live whenever `npm run dev` runs. Full spec: `docs/projects/agent_acceptance_harness.md`; source: `src/debug/harness.ts`. To verify eval, ledger, or feed behavior, read harness state rather than scraping the accessibility tree.

- `await getState()` returns `blocks`, `ledger`, `observations`, `pending` (0 means idle), `seq`, and `activeModel`.
- `getEvents(sinceSeq)` returns only events newer than `sinceSeq`, so it never matches history. A `ledger-write` with `action=overwrite` is the block-ID collision bug.
- `getApiStats()` diagnoses 429s. The binding free-tier limit is requests per day per model, not the RPM and TPM gauges AI Studio shows. `quota429` says which quota bit; `remainingToday` is the live daily budget.
- `clear()`, `loadDoc({ blocks })`, and `await loadLedger([...])` seed state without the confirm modal or an LLM round trip.
- `setLlmMode('record' | 'mock' | 'live')` with `dumpRecordings()` and `loadRecordings(fixture)` gives quota-free, deterministic replays. Reset to `'live'` when done.

Stable selectors: `sidecar-status`, `obs-card`, `obs-dismiss`, `provider-chip`, `clear-workspace`, `clear-confirm`, `clear-cancel`, and `debug-entry`, each as `[data-testid="…"]`.
