# [CLAUDE.md](http://CLAUDE.md)

> Operational guide for AI coding agents working in this repo. Read this first, every session. Working title: **Sidecar** (placeholder — rename when a real name is chosen).

## What this is

A local-first, OSS writing tool that inverts the AI-writing paradigm. The user writes _everything themselves_ in a rich text editor. On the side, a live feed of AI-generated observations reacts to the document — flagging unclear passages, internal contradictions, unsupported claims, missing topics, and so on. The AI never writes or rewrites the user's prose. It provokes thinking; it does not do the thinking.

First persona: **Product Managers** writing PRDs, specs, comms, and decision docs.

## The one principle that governs everything

**Provoke, don't prescribe.** The AI surfaces _observations_, never _fixes_.

- ✅ "This contradicts the success metric you set in §2." → user goes and thinks.
- ❌ "Change this sentence to: …" / an "Apply suggestion" button. → the AI did the thinking.

This is not a style preference. It is the product's reason to exist and its defense against becoming Grammarly-with-extra-steps. **Never add apply/auto-fix/rewrite affordances.** If a feature request implies the AI editing the user's text, stop and flag it against this principle.

## Document map — read what's relevant to your task

| File                   | Read it when…                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/concept.md`      | You need the _why_ — philosophy, persona, positioning, non-goals.                                                                          |
| `docs/features.md`     | You're building UX, the observation taxonomy, message lifecycle, archive, export.                                                          |
| `docs/architecture.md` | You're building the eval pipeline, claim ledger, persistence, model router, editor internals.                                              |
| `docs/plan.md`         | You need to know what phase we're in and what's in/out of scope right now.                                                                 |
| `docs/projects/`       | Deeper design docs for specific features/subsystems. Each file is a self-contained spec with status, phased plan, and per-phase todo list. |

**Always check `docs/plan.md` for the current phase before adding functionality.** Scope creep is the main risk on this project. If something belongs to a later phase, say so and don't build it.

### `docs/projects/` conventions

**Filenames are stable and status-free.** A project file is named for what it _is_ (`message_generation_workflow.md`), never for its status. Status is mutable metadata — encoding it in the filename breaks every reference the moment work progresses. So status lives in two places only:

- **Canonical:** the file's YAML **frontmatter** `status:` field — one of `idea` · `in-progress` · `done`.
- **Mirror:** the Projects Index table in `docs/plan.md`.

`docs/projects.index.test.ts` asserts that the folder, the index table, and each file's frontmatter stay consistent — so drift fails CI rather than going unnoticed.

| `status:`     | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `idea`        | Design is written; not yet scheduled or started.                    |
| `in-progress` | Actively being built (linked from current phase in `docs/plan.md`). |
| `done`        | Fully shipped and verified.                                         |

**Each project file must contain** (in order):

1. **YAML frontmatter** with `status`, `phases` (array of plan-phase numbers it spans), and a one-line `summary`.
2. A `## Status` block — human-readable phase scope. (Status badge is the frontmatter; don't duplicate a conflicting one here.)
3. A `## Phased Plan` section — which plan phases this work spans and what each phase contributes.
4. A `## Todo` section with a concrete checklist scoped per phase.
5. The detailed design sections below.

**When you create a project file** you **must**, at minimum, add a row to the **Projects Index** in `docs/plan.md` (every file in `docs/projects/` must appear there — it is a completeness contract). At maximum, when the work is scoped to specific phase milestones, **also** add a `→ see docs/projects/...` inline note on each relevant milestone line. The index guarantees discoverability; the inline links give per-milestone context. Don't add blanket "see projects/" links.

## Browser testing

**`chrome-devtools` MCP is configured globally** (in `~/Library/Application Support/Claude/claude_desktop_config.json`). Use it for any browser automation — opening the app, interacting with the editor, verifying observations, taking screenshots.

Key tools (load via ToolSearch before first use): `mcp__chrome-devtools__new_page`, `navigate_page`, `take_screenshot`, `take_snapshot`, `type_text`, `click`, `hover`, `wait_for`, `press_key`, `evaluate_script`, `list_console_messages`.

The dev server runs at **`http://localhost:5173`** (`npm run dev`). Acceptance tests live in `docs/acceptance-testing/phase1.md` — that file defines the automated/human split for each test.

## Tech stack at a glance

- **Language:** TypeScript end to end.
- **Editor:** TipTap (ProseMirror). Chosen specifically for decoration + position-mapping (annotations that track their text through edits). Do not swap this without reading `docs/architecture.md` — the anchoring mechanic depends on it.
- **App shape:** Web first, **local-first PWA**. No mandatory backend. Tauri wrapper is a possible _later_ desktop path, not now.
- **Persistence:** Client-side (IndexedDB / SQLite-in-browser). Document, block summaries, claim ledger, and messages all live locally.
- **LLM access:** Behind a single **model-router** interface. Free tier uses cheap/fast models; BYO-key uses stronger models. Router is a deliberate extension seam.

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

See `docs/plan.md`. Current target: **Phase 1 — "The Wow"** (smallest build that catches a contradiction the user wrote and makes them fix it themselves).
