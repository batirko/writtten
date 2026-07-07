# [CLAUDE.md](http://CLAUDE.md)

> Operational guide for AI coding agents working in this repo. Read this first, every session. Product name: **writtten** (hosted at writtten.com).

## What this is

A local-first, OSS writing tool that inverts the AI-writing paradigm. The user writes _everything themselves_ in a rich text editor. On the side, a live feed of AI-generated observations reacts to the document — flagging unclear passages, internal contradictions, unsupported claims, missing topics, and so on. The AI never writes or rewrites the user's prose. It provokes thinking; it does not do the thinking.

First persona: **Product Managers** writing PRDs, specs, comms, and decision docs.

## The one principle that governs everything

**Provoke, don't prescribe.** The AI surfaces _observations_, never _fixes_.

- ✅ "This contradicts the success metric you set in §2." → user goes and thinks.
- ❌ "Change this sentence to: …" / an "Apply suggestion" button. → the AI did the thinking.

This is not a style preference. It is the product's reason to exist and its defense against becoming Grammarly-with-extra-steps. **Never add apply/auto-fix/rewrite affordances.** If a feature request implies the AI editing the user's text, stop and flag it against this principle.

The principle has a finer edge than "no apply button," and three failure modes that look like helpfulness from the inside: the **anti-taxonomy** (never surface grammar/style/surface nits), **register discipline** (locate, don't prescribe; no leading questions), and **flattery-resistant dismissal** (muting a nit ≠ silencing a true critique). The fidelity bar that governs all of this is `docs/product-requirements.md`; the substantive rules live in `docs/features.md` (_Anti-taxonomy_, _Register discipline_, _Dismissal should teach_); the scheduled work is `docs/projects/philosophy_guardrails.md` and `docs/projects/emotional_register.md`.

## Document map — read what's relevant to your task

| File                                           | Read it when…                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/concept.md`                              | You need the _why_ — philosophy, persona, positioning, non-goals.                                                                                                                                                                                                                                                                                                   |
| `docs/product-requirements.md`                 | You need the _fidelity bar_ — the tiered requirements (Minimum/Good-enough/Superb) and the five load-bearing tensions that define faithfully holding the inversion. Acceptance gates derive from it in `docs/acceptance-testing/fidelity-criteria.md`.                                                                                                              |
| `docs/features.md`                             | You're building UX, the observation taxonomy, message lifecycle, archive, export.                                                                                                                                                                                                                                                                                   |
| `docs/architecture.md`                         | You're building the eval pipeline, claim ledger, persistence, model router, editor internals.                                                                                                                                                                                                                                                                       |
| `docs/plan.md`                                 | You need to know what phase we're in and what's in/out of scope right now.                                                                                                                                                                                                                                                                                          |
| `docs/projects/`                               | Deeper design docs for specific features/subsystems. Each file is a self-contained spec with status, phased plan, and per-phase todo list.                                                                                                                                                                                                                          |
| `docs/snapshots/`                              | Point-in-time reviews of product quality, test session results, and roadmap observations. Use to capture the state of the product over time.                                                                                                                                                                                                                        |
| `docs/mechanics/`                              | Detailed behavioural docs for implemented mechanics — how things actually work in the running system (timing, triggers, state machines). No design speculation; these describe what is built. Read before touching the relevant subsystem. **When you change code that alters a documented mechanic, update the corresponding file here as part of the same task.** |
| `docs/logs/`                                   | Append-only field logs — the living observation logs (`prompt_quality_observations.md`, `ux_quality_observations.md`) that accumulate raw issues across test sessions until a remediation sprint drains them. Distinct from `docs/projects/` specs: logs never reach `done` and are intentionally **not** in the plan.md Projects Index. `docs/projects/quality_remediation_synthesis.md` is the analysis layer over both.                                                                                          |
| `docs/logs/prompt_quality_observations.md` | You observe a prompt producing a false positive, false negative, or systematic misclassification during any test, harness run, or manual eval. **Append an entry to the Observation Log** — don't fix it inline unless it's trivially obvious and safe. The file accumulates until a remediation sprint is scheduled.                                               |

**Always check `docs/plan.md` for the current phase before adding functionality.** Scope creep is the main risk on this project. If something belongs to a later phase, say so and don't build it.

**Plan items carry required routing metadata.** Every open milestone in `docs/plan.md` ends with a `— <readiness> <complexity> · <agent>` annotation (see the Routing legend at the top of that file). When you **add** a milestone, annotate it; when you **work on** one, re-assess and update the annotation in the same change (readiness shifts most often). Drop the annotation when the item is completed (`[x]`).

> **After ANY edit to `docs/plan.md`, run the full `npm test` — not a single test file.** `docs/plan.annotations.test.ts` is **dynamic**: it generates one test per open milestone it finds (every `- [ ]` checkbox, and every top-level `- ` bullet in the "Phase 6" / "Discovered" sections) and asserts each carries a routing annotation, while `[x]` items must have dropped it. Because the cases don't exist until your edit creates them, running a scoped test (e.g. just `projects.index.test.ts`) will pass locally and then CI goes red. Two gotchas this catches: (1) a new open milestone with no annotation; (2) **any non-milestone top-level `- ` bullet you add inside Phase 6** (prose lists, notes) is misread as an un-annotated milestone — put such lists in a **blockquote** (`>`-prefixed lines are exempt) or nest them so they don't start at column 0.

### `docs/projects/` conventions

**Filenames are stable and status-free.** A project file is named for what it _is_ (`message_generation_workflow.md`), never for its status. Status is mutable metadata — encoding it in the filename breaks every reference the moment work progresses. So status lives in two places only:

- **Canonical:** the file's YAML **frontmatter** `status:` field — one of `idea` · `in-progress` · `done`.
- **Mirror:** the Projects Index table in `docs/plan.md`.

`docs/projects.index.test.ts` asserts that the folder, the index table, and each file's frontmatter stay consistent — so drift fails CI rather than going unnoticed.

> **Index links are load-bearing — don't let a WYSIWYG editor eat them.** Each index row's name must stay an inline link `[name](projects/name.md)`; the test rejects bare text. This de-linked once before (see the L1 milestone below) because an HTML-round-tripping WYSIWYG editor flattened links inside GFM table cells on save. **Rules of the road:** edit Markdown in **VS Code as plain text** (the repo's `.vscode/settings.json` forces `*.md` into the text editor) or in **Obsidian** (open `docs/` as a vault — it's markdown-native and never round-trips, so links/tables stay faithful). Do **not** use HTML-round-tripping WYSIWYG editors like "Markdown Studio" on link-in-table files. If the index gets de-linked anyway, `git checkout -- docs/plan.md` to restore (Prettier can't recover lost links; it only re-aligns the table once links are back). CI (`npm test`) is the backstop.

| `status:`     | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `idea`        | Design is written; not yet scheduled or started.                    |
| `in-progress` | Actively being built (linked from current phase in `docs/plan.md`). |
| `done`        | Fully shipped and verified.                                         |

**Files are grouped by genre via the `kind:` frontmatter field.** Each project file declares a required `kind:` — one of `spec` (feature & platform build-ready specs) · `quality` (signal & philosophy quality) · `infra` (pipeline & dev infrastructure) · `research` (research & synthesis). The Projects Index in `docs/plan.md` is grouped under one `### ` sub-header per kind, and a file's row must sit under the sub-header matching its `kind`. The index test enforces both the valid `kind` and the correct grouping.

**Living logs are not projects.** Append-only field logs (`prompt_quality_observations`, `ux_quality_observations`) live in `docs/logs/`, not here — they never reach `done` and are intentionally absent from the Projects Index and its completeness contract.

**Each project file must contain** (in order):

1. **YAML frontmatter** with `status`, `kind`, `phases` (array of plan-phase numbers it spans), and a one-line `summary`.
2. A `## Status` block — human-readable phase scope. (Status badge is the frontmatter; don't duplicate a conflicting one here.)
3. A `## Phased Plan` section — which plan phases this work spans and what each phase contributes.
4. A `## Todo` section with a concrete checklist scoped per phase.
5. The detailed design sections below.

**When you create a project file** you **must**, at minimum, add a row to the **Projects Index** in `docs/plan.md` (every file in `docs/projects/` must appear there — it is a completeness contract). At maximum, when the work is scoped to specific phase milestones, **also** add a `→ see docs/projects/...` inline note on each relevant milestone line. The index guarantees discoverability; the inline links give per-milestone context. Don't add blanket "see projects/" links.

## Browser testing

Two browser-automation tools are available. Pick by job; fall back to the other if the chosen one misbehaves.

### claude-preview (Claude Preview MCP)

Key tools (load via ToolSearch): `mcp__Claude_Preview__preview_start`, `preview_eval`, `preview_snapshot`, `preview_screenshot`, `preview_console_logs`, `preview_network`.

**Prefer for:** anything that drives `window.__sidecar__` — polling state (`await preview_eval("window.__sidecar__.getState()")`), waiting for `pending === 0`, inspecting the ledger or event stream, running record/replay sessions, seeding fixtures. Async JS in `preview_eval` returns clean JSON and handles arbitrary polling logic in one call. Also good for quick structural snapshots and network-log inspection.

**Watch out for:** `preview_eval` has a **30-second hard timeout** — don't embed `while` loops that could exceed it; break them into smaller calls. Not great for _real_ input events (hover, keyboard) — the ProseMirror editor sometimes ignores synthetic events from `eval`.

**Start the server:** `preview_start` with config name `"writtten"` (`.claude/launch.json` is already set up). The preview server and the existing `npm run dev` at `http://localhost:5173` are the same Vite dev server — you only need one running.

---

### chrome-devtools (chrome-devtools MCP)

Configured globally in `~/Library/Application Support/Claude/claude_desktop_config.json`. Key tools (load via ToolSearch): `mcp__chrome-devtools__new_page`, `navigate_page`, `take_screenshot`, `take_snapshot`, `type_text`, `click`, `hover`, `wait_for`, `press_key`, `evaluate_script`, `list_console_messages`.

**Prefer for:** interaction fidelity — hovering over observation cards to trigger highlights, real keyboard input into the ProseMirror editor, clicking UI elements by accessibility uid, native-dialog handling (`handle_dialog`). Also the right fallback whenever `preview_eval` is timing out or returning unexpected results.

**Watch out for:** `wait_for` matches the **entire accessibility tree including history** — it can match stale text from a previous eval. Always wait for a string that will only appear _after_ the action (e.g. `"idle"` on the `[data-testid="sidecar-status"]` element, which only transitions once `pending === 0`). Use `evaluate_script` to read `window.__sidecar__` state when the snapshot is too noisy.

---

### Decision table

| Task                                         | Reach for                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Inspect ledger / observations / event stream | **preview_eval**                                                                                        |
| Wait for eval to finish (`pending === 0`)    | **preview_eval** polling loop, or `wait_for("[data-testid='sidecar-status']", ["idle"])` on either tool |
| Seed a fixture doc / ledger                  | **preview_eval** → `__sidecar__.loadDoc` / `loadLedger`                                                 |
| Record or replay LLM responses               | **preview_eval** → `__sidecar__.setLlmMode` / `dumpRecordings`                                          |
| Hover a card to trigger highlights           | **chrome-devtools** `hover`                                                                             |
| Type into the editor                         | **chrome-devtools** `type_text` (real events)                                                           |
| Click a button                               | Either — but chrome-devtools is more reliable for complex UI                                            |
| Screenshot / visual check                    | Either                                                                                                  |
| Native confirm dialogs                       | **chrome-devtools** `handle_dialog` (or use `__sidecar__.clear()` to skip entirely)                     |

**Fallback rule:** if the primary tool returns unexpected results (stale matches, eval timeouts, synthetic events ignored), switch to the other one for that step — don't retry the same tool indefinitely. Document the switch in a comment if it affects a reproducible test.

The dev server runs at **`http://localhost:5173`** (`npm run dev`). Acceptance tests live in `docs/acceptance-testing/` — each file defines the automated/human split.

> **Testing a feature branch in-product → serve it on a dedicated port.** Whenever you (agent-decided) or the user want to see a feature branch running in the browser — for the user to click through, or for you to drive/observe via the browser tools — **do not** reuse the shared `:5173` (a concurrent session likely owns it, and it may be running a different branch). Instead check that branch out in its **own git worktree** (see _Working alongside parallel sessions_) and start its dev server on a **distinct port**: `npm run dev -- --port <NNNN> --strictPort`. Then hand the user the exact URL Vite prints, or point the browser tools at it. This keeps each branch's app (and its per-origin IndexedDB / `window.__sidecar__` state) isolated from other sessions. Tear the server + worktree down when done.

## Dev harness (`window.__sidecar__`)

A dev-only observability + control surface, live whenever `npm run dev` is running. See `docs/projects/agent_acceptance_harness.md` for the full spec. (Intended to be stripped from production builds — but the 2026-06-10 code audit found this only half-true: call sites are dead-code-eliminated, yet the harness module has a top-level side effect and a circular import with `db.ts`, so the module itself still ships. Tracked by `lifecycle_integrity` L7; unverifiable in `dist/` until the build is repaired — L1.)

**Use it proactively — not just for acceptance testing.** Any time you're verifying that eval/ledger/feed behavior is correct (building a feature, debugging, confirming a fix), the harness is faster and more reliable than scraping the accessibility tree.

### Reading state

```js
const st = await window.__sidecar__.getState();
// st.blocks       — live editor blocks [{id, text}]
// st.ledger       — active claim ledger entries
// st.observations — active observation objects
// st.pending      — in-flight evaluations; 0 means idle
// st.seq          — monotonic event counter
// st.activeModel  — currently active model name
```

### API quota / usage stats (diagnosing 429s)

```js
const api = window.__sidecar__.getApiStats();   // sync — no await needed
// api.day     — Pacific date the per-day counts bucket under (RPD resets at Pacific midnight)
// api.totals  — { requests, successes, errors, rate429 } across all models
// api.models  — per-model, sorted most-pressured first (least remaining budget):
//   { model, requests, successes, errors, rate429,
//     quota429: { perDay, perMinute, inputTokens, other },  // which quota the 429s violated
//     dailyLimit, successesToday, remainingToday,           // RPD budget tracking
//     lastStatus, lastRetryDelayMs, avgLatencyMs }
```

The binding free-tier constraint is **requests-per-day (RPD) per model** (e.g. 20 for most Flash variants, 0 for `gemini-2.5-pro`), _not_ the RPM/TPM gauges AI Studio foregrounds — which is why 429s appear while the dashboard looks idle. `quota429` tells you which quota actually bit; `remainingToday` is the live daily budget.

### Waiting for idle (the right pattern)

```js
// In preview_eval — inline polling loop
const start = Date.now();
while (Date.now()-start < 25000) {
  await new Promise(r => setTimeout(r, 1500));
  const st = await window.__sidecar__.getState();
  if (st.pending === 0 && <your condition>) break;
}

// In chrome-devtools — wait for the status chip
wait_for('[data-testid="sidecar-status"]', ["idle"])
```

### Event stream (no stale-match problem)

```js
const events = window.__sidecar__.getEvents(sinceSeq);
// Returns only events with seq > sinceSeq — never matches history.
// Key event types: settle · request · response · ledger-write · observation · block-removed
// ledger-write carries action=insert|overwrite — overwrite = the block-id collision bug
```

### Test setup (write affordances)

```js
window.__sidecar__.clear();                  // programmatic clear, no confirm modal
window.__sidecar__.loadDoc({ blocks: [       // seed a document + trigger evaluation
  { text: 'This will ship in Q3.' },
  { text: "We'll launch this in Q2." },
]});
await window.__sidecar__.loadLedger([        // seed claims directly, no LLM round-trip
  { blockId: 'b1', text: 'Ships in Q3.', kind: 'commitment' },
  { blockId: 'b2', text: 'Ships in Q2.', kind: 'commitment' },
]);
```

### Mock / record-replay LLM (quota-free, deterministic)

```js
// Record: capture real Gemini responses into a fixture
window.__sidecar__.setLlmMode('record');
// ... run the scenario ...
const fixture = window.__sidecar__.dumpRecordings(); // save this JSON

// Replay: serve from fixture, zero network calls, ~0ms latency
window.__sidecar__.setLlmMode('mock');
window.__sidecar__.loadRecordings(fixture);
// ... run the same scenario ...
window.__sidecar__.setLlmMode('live'); // reset when done
```

> **Resolved (was a known gap):** the contradiction `strong` call is now deterministic in mock mode — the prompt is built from stable sorted claim indices, not a DB auto-increment id, so the request hash is stable across runs. `src/services/acceptance.phase1.test.ts` and the Tier-1 eval ratchet rely on this. The earlier note that the prompt embedded a per-run auto-increment id is **stale** — corrected per the 2026-06-10 code audit (`docs/snapshots/2026-06-10_code_architecture_audit.md`, drift #4).

### testid selectors (stable targeting)

`[data-testid="sidecar-status"]` · `[data-testid="obs-card"]` · `[data-testid="obs-dismiss"]` · `[data-testid="provider-chip"]` · `[data-testid="clear-workspace"]` · `[data-testid="clear-confirm"]` · `[data-testid="clear-cancel"]` · `[data-testid="debug-entry"]`

## Tech stack at a glance

- **Language:** TypeScript end to end.
- **Editor:** TipTap (ProseMirror). Chosen specifically for decoration + position-mapping (annotations that track their text through edits). Do not swap this without reading `docs/architecture.md` — the anchoring mechanic depends on it.
- **App shape:** Web first, **local-first PWA**. No mandatory backend. Tauri wrapper is a possible _later_ desktop path, not now.
- **Persistence:** Client-side (IndexedDB / SQLite-in-browser). Document, block summaries, claim ledger, and messages all live locally.
- **LLM access:** Behind a single **model-router** interface. Free tier uses cheap/fast models; BYO-key uses stronger models. Router is a deliberate extension seam.

## Design quality

For any new UI component, new screen/panel, or substantive layout change, invoke the Hallmark skill before building. For pure logic changes or single-property CSS fixes, it's not needed.

## Hard invariants (do not violate)

1. **No fix-application affordances.** (See the principle above.)
2. **Fixed observation taxonomy.** Observations come from a defined, typed list with per-type prompts — never free-form LLM chatter. See `docs/features.md`.
3. **No per-keystroke full-document scans.** Evaluation is incremental and debounced. The cross-document checks (contradiction, missing-topic) run against the **claim ledger**, not a re-read of the whole doc. See `docs/architecture.md`.
4. **Quiet while generating, opinionated while revising.** Never critique an in-progress sentence or an under-threshold document. Silence during idea formation is a feature.
5. **Local-first and privacy-respecting.** Don't introduce a required server, telemetry, or data egress without an explicit decision logged in `docs/plan.md`.

## Repo conventions

- Source: `src/`. Docs: `docs/`. Tests colocated as `*.test.ts`.
- Prefer small, single-purpose modules. The eval checks, the model providers, and the export formats are each pluggable — keep those seams clean.
- _Setup/build/test commands are a Phase 0 deliverable._ Once scaffolding exists, record the real commands here (install / dev / build / test / lint) so future sessions don't guess.

## Working alongside parallel sessions

**Assume another agent may be editing this repo right now.** Work is often split into parallel [lanes](docs/plan.md#parallel-work-lanes) run in separate sessions. Never assume you're the only writer.

- **Always work on a dedicated feature branch, never directly on `main`.** Branch at the start of a task; open a PR when done. (One feature per PR — see the plan's lane map for what's safe to run concurrently.)
- **Stay inside your lane's files.** Each Phase-6 milestone carries a `Lane` tag (see `docs/plan.md` → _Parallel work lanes_). The lanes are drawn so their **hub files don't overlap** — the big single-writer bottlenecks are `src/sidecar/SidecarFeed.tsx`, `src/styles.css`, `src/services/evaluator.ts`, `src/services/evaluatorPrompts.ts`, `src/editor/Editor.tsx`, `src/services/orchestrator.ts`. If your task needs to edit a hub file owned by a different lane, that's a signal the work isn't actually parallel-safe — flag it rather than plough in.
- **Coordinate on the shared low-churn files.** `src/services/types.ts` (append-only-ish), `src/styles.css`, and any `db.ts` schema-version bump are touched by multiple lanes. Keep edits there minimal and localized; only one lane should bump the DB version at a time.
- **Rebase before you finalize.** `main` may have moved under you. Rebase (or merge `main`) and re-run `npm test && npm run lint && npm run build` before opening/merging the PR.
- **The dev server on `:5173` is shared.** Another session may already have `npm run dev` running (the preview MCP can't take over that port). Don't assume you own it; the harness state (`window.__sidecar__`) is global — `clear()` after seeding fixtures so you don't leave state for a concurrent session.

## Commands

```
npm install          # install deps
npm run dev          # dev server → http://localhost:5173
npm run build        # tsc + vite production build → dist/
npm test             # vitest run (single pass)
npm run test:watch   # vitest watch mode
npm run lint         # eslint src/
npm run format       # prettier --write src/
```

**Model router key:** copy `.env.local.example` → `.env.local` and set `VITE_GEMINI_API_KEY`. Use the "Ping model" button in the sidecar to verify the path end-to-end.

## Status

`docs/plan.md` is the source of truth for the current phase — check its "Current phase" marker (line 7) before adding functionality. As of 2026-06-17 the target is **Phase 6 — "Make it good: experience & signal quality"**: Phases 1–4 are implemented; Phase 5 (egress/install/hardening) is essentially complete; and the experience / signal-quality / validation work that had accreted in the old Phase 5 was re-cut into Phase 6 (the former "Phase 6 — Later/optional" became Phase 7). Phase 6 spans product-feel work (visual style + companion-surface feed shipped; UI/UX mechanics, onboarding, mobile courtesy pass still open) and signal-quality precision (maturity-aware severity, register guardrails). The **validation track (V1–V3) was deferred to Phase 7 on 2026-07-07** (its V1 machinery + hand-labeled corpus already exist; the keyed run + external sessions are parked). Don't trust this paragraph over `docs/plan.md` if they ever drift — update the plan there, then mirror the headline here.
