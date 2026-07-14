# Contributing to writtten

Thanks for considering a contribution. This project has an unusual reason to exist, and the fastest way to be helpful is to understand it before writing code. This guide is the short version; the deep dev guide is [`CLAUDE.md`](CLAUDE.md) (written for AI coding agents, but it's the most complete map of the codebase and its rules — read it).

## The one principle that governs everything

**Provoke, don't prescribe.** The AI surfaces _observations_, never _fixes_.

This is not a style preference — it's the product's reason to exist and its defense against becoming "Grammarly with extra steps." The single most important thing a contributor can internalize:

> **Never add an affordance that makes the AI write or edit the user's prose** — no "Apply suggestion," no auto-fix, no rewrite, no inline completion. If a feature idea implies the AI editing the user's text, it's out of scope by definition. Flag it; don't build it.

There are finer edges to the principle (an _anti-taxonomy_ of things we deliberately never surface — grammar/style nits; _register discipline_ — locate the problem, don't prescribe or ask leading questions; _flattery-resistant dismissal_ — muting a nit must never silence a true critique). These live in [`docs/features.md`](docs/features.md) and the fidelity bar is [`docs/product-requirements.md`](docs/product-requirements.md). Read them before touching evaluation or the feed.

## The hard invariants

PRs that violate these will be asked to change. They exist for good reasons documented in `docs/`:

1. **No fix-application affordances.** (See above.)
2. **Fixed observation taxonomy.** Observations come from a defined, typed list with per-type prompts — never free-form LLM output. Extending the taxonomy is a design conversation (open an issue first), not a drive-by.
3. **No per-keystroke full-document scans.** Evaluation is incremental and debounced; cross-document checks go through the claim ledger, not a whole-doc re-read.
4. **Quiet while generating, opinionated while revising.** Never critique an in-progress sentence or an under-threshold document.
5. **Local-first and privacy-respecting.** No required server, telemetry, or data egress without an explicit, logged decision.

## Getting set up

```bash
npm install
cp .env.local.example .env.local   # add a free Gemini key for live evaluation (optional)
npm run dev                          # → http://localhost:5173
```

Requires **Node 20** (see `.nvmrc`).

### Commands

| Command              | What it does                            |
| -------------------- | --------------------------------------- |
| `npm run dev`        | Dev server → http://localhost:5173      |
| `npm test`           | Full test suite (vitest, single pass)   |
| `npm run test:watch` | Watch mode                              |
| `npm run lint`       | ESLint                                  |
| `npm run build`      | Type-check + production build → `dist/` |
| `npm run format`     | Prettier                                |

**Before opening a PR, run `npm test && npm run lint && npm run build` and make sure all three are green** — that's exactly what CI enforces.

### Maintainer: real-model checks

These hit real providers, so they're gated behind keys in `.env.test.local` (gitignored; copy `.env.test.local.example`) and are **excluded from CI** — green CI does not exercise the live models.

| Command                | What it does                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm run live-check`   | Provider reachability + Gemini pool liveness (real API calls)            |
| `npm run eval:live`    | Live evaluator precision/recall ratchet                                  |
| `npm run eval:v1`      | V1 base-rate corpus run                                                  |
| `npm run release:check` | **Pre-release gate:** `lint` + `test` + `build` + `live-check` in one    |

**Before cutting a release**, a maintainer runs `npm run release:check` (needs `.env.test.local` keys) — see the [release runbook](docs/mechanics/release_and_deploy.md#how-to-publish-the-day-to-day).

## Working model

- **Branch for every change** — never commit to `main` directly. One focused change per PR.
- **Open an issue first** for anything that touches the taxonomy, the philosophy, evaluation prompts, or adds a dependency. These are design conversations.
- **Keep the extension seams clean.** The eval checks, model providers, and export formats are each pluggable — respect those boundaries.
- **If you change a documented mechanic, update its doc** in `docs/mechanics/` in the same PR.
- **Saw a false positive / false negative?** That's valuable — open a _Signal-quality_ issue (template provided). These reports are the field data the project most needs.

## Where to start

The highest-impact contributions right now:

1. **A non-Gemini model adapter** (OpenAI or local/Ollama) behind the model router. The router is Gemini-shaped today; a clean second adapter proves the seam and improves privacy.
2. **Export formats** — pluggable egress.
3. **Signal-quality reports** — no code required; testing the evaluator against real documents and reporting misfires.

Look for issues labeled `good first issue` and `help wanted`.

## Code style

TypeScript end to end. Small, single-purpose modules. Match the surrounding code's conventions, naming, and comment density. Prettier + ESLint configs are in the repo; run them.

By contributing, you agree that your contributions are licensed under the project's [Apache-2.0](LICENSE) license.
