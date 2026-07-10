---
status: idea
kind: infra
phases: [6, 7, 9]
summary: The open-source launch readiness checklist — what must be in the repo, how it should present, the pre-flight cleanup/security sweep, contributor on-ramp, positioning assets, and the go-to-market/post-launch plan. Tiered Minimum → Good-enough → Superb so a lean launch can ship without the depth work.
---

# OSS launch readiness

> **What this is:** the single checklist for taking `writtten` from a private repo to a public open-source project people can find, understand, run, and contribute to. It resolves the standing **"OSS: real or decorative?"** open question (`docs/plan.md` → Strategic open questions) in the affirmative — this doc's existence _is_ the decision to treat OSS as real — and lays out what "real" now requires.
>
> **Governing principle:** the launch must lead with the **inversion** ("you write everything; the AI only observes, never writes") and stay honest about the project's actual maturity (n=0 field validation, Gemini-shaped router). Radical candor is on-brand for this project and is a differentiator, not a liability. Don't oversell.

## Status

**Idea — spans Phases 6–7 (prep-now hygiene + launch residuals) and Phase 9 (contributor depth).** Nothing here is built. The gating product decision (OSS real vs. decorative) is treated as **resolved → real** by virtue of this work being scheduled; the concrete follow-through is the checklist below. Most of the **Minimum** tier is low-complexity, high-leverage repo hygiene that can ship inside Phase 6; the **Superb** tier (real extension seams, local/Ollama adapter) is genuine Phase-9 engineering (the OpenAI/Anthropic adapters shipped first-party 2026-07-07).

Read alongside:

- `docs/concept.md` → _Stance on monetization and OSS_ (the thesis + the honest caveat this doc closes).
- `docs/plan.md` → Phase 9 "Superb tier — contributor depth" and the Strategic open questions (OSS, free-tier, privacy/egress).
- `docs/projects/onboarding_first_run.md` — the zero-config "See it in action" demo is also the OSS "try before you clone" hook.
- `docs/projects/byok_capability_model.md` — the model-router seam is the load-bearing contribution surface; its Gemini-shape is the biggest contributor gap.
- `CLAUDE.md` — the hard invariants a CONTRIBUTING guide must transmit (esp. #1 no fix-application affordances, #2 fixed taxonomy).

## Phased Plan

- **Phase 6 (prep-now, mostly 🔧/⚙️):** repo hygiene + the Minimum tier. LICENSE file, README that pitches the inversion, CONTRIBUTING/CODE_OF_CONDUCT/SECURITY, issue/PR templates, the pre-flight cleanup + security sweep, and the docs/ transparency decision. This is the launchable core.
- **Phase 9 (depth, 🧠):** the contributor on-ramp that makes "contribute to" true — documented extension seams (observation types, model providers, export formats), a non-Gemini adapter as the reference contribution, "good first issue" pipeline, and the go-to-market execution. Gated on the core being solid and (ideally) a live hosted demo existing.

## Todo

### Minimum — must be true before the repo goes public (Phase 6)

- [x] **LICENSE file.** Apache-2.0 full text added (fetched canonical). _(2026-07-05)_
- [x] **README.md that pitches the inversion** — leads with the inversion, honest-status box, quickstart, how-it-works. _(2026-07-05)_
- [x] **Pre-flight cleanup:** removed `print_diffs.js`, `print_vague.js`, `test_output.txt`; added `*_output.txt` to `.gitignore`. _(2026-07-05)_
- [x] **Security sweep sign-off** — `.env.local` never committed; no live key in history; the two redacted-partial doc strings fully redacted to `AIza…<redacted>`. _(2026-07-05)_
- [x] **CONTRIBUTING.md** — setup, commands, branch/PR model, the five hard invariants, where-to-start. _(2026-07-05)_
- [x] **CODE_OF_CONDUCT.md** — Contributor Covenant 2.1. _(placeholder: enforcement contact still to fill)_
- [x] **SECURITY.md** — reporting + honest data-egress disclosure (free-tier text → Gemini). _(2026-07-05)_
- [x] **`.github/` templates** — Bug · Feature · Signal-quality (FP/FN) issue templates + invariant-referencing PR template. _(2026-07-05)_
- [x] **`docs/` transparency posture — decided: publish as-is** (2026-07-05, user call). Candor is on-brand; no curation. Only edit needed was the two key-partial redactions above.
- [ ] **Branch protection on `main`** — require the existing CI (`verify`) green before merge. **Blocked until public:** GitHub's free tier only allows branch protection on **public** repos (or with GitHub Pro), so this can't be enabled while the repo is private — attempting it returns `403 "Upgrade to GitHub Pro or make this repository public"`. **Enable it as the first action right after flipping the repo public** (required check: `verify`; `enforce_admins` off so solo auto-merge still works). — 🟢 Low · 🔧
- [x] **`.nvmrc` / `engines` field** pinning Node 20. _(2026-07-05)_

### Good-enough — a credible, welcoming launch (Phase 6 → early 7)

- [ ] **Hosted live demo** at `writtten.com` — the single biggest conversion asset; lets people _try_ before cloning. **Host decided 2026-07-06: Cloudflare Pages** (static PWA; no backend — the hosted-proxy idea is a decided NO-GO, see `docs/projects/hosted_proxy.md`). 🟢 build-ready spec:
  - Connect the GitHub repo to a Cloudflare Pages project. Build command `npm run build`; output directory `dist/`; framework preset "None"/Vite. SPA fallback (serve `index.html` for unknown routes) so deep links work; the Phase-5 `vite-plugin-pwa` service worker precaches the shell for offline.
  - Custom domain `writtten.com` via Cloudflare DNS (CNAME to the Pages project); automatic HTTPS.
  - **First-run state (decided): BYOK-only.** No key ⇒ the canned "See it in action" example (`onboarding_first_run.md`) plays automatically — the visitor witnesses the hero contradiction with zero config. To analyze their _own_ document, a calm, low-friction Settings prompt walks them through pasting a free Gemini key (link to AI Studio, ~30s). No server, no shared key. This is the honest replacement for the README's earlier "works zero-key" overclaim.
  - No analytics/telemetry (invariant #5); rely on GitHub signals + qualitative feedback (see § Metrics).
- [ ] **Hero visual** — a short GIF of the loop, embedded at the top of the README (placeholder `<!-- TODO(launch) -->` is in place). 🟢 build-ready spec:
  - **Storyboard (~20–30s, one take):** open on the writing canvas → type/paste a two-section doc containing a planted contradiction (reuse the `onboarding_first_run` example doc) → a companion-feed card settles in → reverse-hover the card to highlight the contradicting span in the editor → click the card to peek the earlier conflicting claim. End on the calm feed. No cursor thrash; deliberate pacing.
  - **Capture:** run the app on a clean profile at a fixed viewport (1280×800), light theme; record with a screen recorder; trim; export to an optimized looping GIF (or MP4+GIF poster) ≤ ~5 MB so it renders inline on GitHub. Commit under `docs/launch/` (e.g. `docs/launch/hero-loop.gif`) and reference it from the README hero + reuse in launch posts.
  - Depends on the zero-config example state existing (it does — `onboarding_first_run` shipped) and on the visual pass (shipped — `visual_style`). Mechanical once the storyboard is fixed; the one judgment call (pacing/framing) is settled above.
- [ ] **Zero-config "See it in action"** — a one-click planted-contradiction example so a first-time visitor witnesses the hero with no key (`onboarding_first_run.md`). Doubles as the demo's opening state.
- [x] **Update `concept.md` + `plan.md`** — flipped the "OSS real or decorative?" open question to resolved (real); rewrote the concept.md caveat. _(2026-07-05)_
- [x] **CHANGELOG.md** added (Keep-a-Changelog, `0.1.0` first-release notes). _The tagged `v0.1.0` release + the `<owner>` compare links are done at publish time._
- [x] **A short "why I built this" launch post** — `docs/launch/why-writtten.md`, adaptable for Show HN / blog. _(2026-07-05)_

### Superb — makes "a tool people want to contribute to" actually true (Phase 9)

- [ ] **Documented extension API for the three seams** — observation types, model providers, export formats. 🟢 build-ready spec for `docs/extending.md` (one section per seam; each maps _where it lives · what interface to implement · what's stubbed · a worked example_):
  - **Model providers** — the `ProviderAdapter` seam (`src/model/provider.ts`, landed by `multi_provider_router.md`). "Add a provider = one adapter file + a registry entry; zero call-site changes." Point at `gemini.ts`/`openai.ts`/`anthropic.ts` as the three reference adapters; Ollama/local as the archetypal next contribution (also the no-egress privacy win).
  - **Observation types** — the fixed taxonomy in `docs/features.md` + per-type prompts in `src/services/evaluatorPrompts.ts`; document how a new type is added _within_ the invariant (typed kind, prompt, severity/voice wiring) and what the guardrail tests reject (hard invariant #2 — no free-form chatter, no fix-application).
  - **Export formats** — the `src/services/export.ts` seam (from `egress.md`): implement a serializer, register it behind the format switch. Print-to-PDF is the reference; a new format is a self-contained PR.
- [ ] **A curated set of labeled "good first issue" / "help wanted"** — 🟢 concrete starter list: (1) an Ollama/local `ProviderAdapter` (the no-egress privacy win); (2) a new export format behind `export.ts`; (3) a docs/typo/onboarding-copy sweep; (4) a signal-quality FP/FN report via the issue template (doubles as field data). File these as GitHub issues with the `good first issue` / `help wanted` labels at go-public. _(The first-party OpenAI + Anthropic adapters that used to sit here have moved to the launch-blocking `multi_provider_router.md` milestone — they now ship before launch, not as contributor bait.)_
- [ ] **Contribution-quality guardrails documented** — how the fixed-taxonomy invariant and "no apply button" are enforced in code + CI (philosophy_guardrails), so contributors don't propose changes that violate the reason-to-exist.
- [ ] **Post-launch operating cadence** — issue triage rhythm, how signal-quality reports feed `docs/logs/prompt_quality_observations.md` (community reports _are_ the field validation the project needs).

---

## What must be in the repo — file-by-file

| File                               | Status      | Priority    | Notes                                                                                                  |
| ---------------------------------- | ----------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `LICENSE`                          | **missing** | Minimum     | Apache-2.0 full text. `package.json` already declares it; the file is the legally load-bearing part.   |
| `README.md`                        | **missing** | Minimum     | The pitch. Spec below.                                                                                 |
| `CONTRIBUTING.md`                  | **missing** | Minimum     | Setup, commands, branch/PR model, invariants. Point to `CLAUDE.md`/`AGENTS.md` for the deep dev guide. |
| `CODE_OF_CONDUCT.md`               | **missing** | Minimum     | Contributor Covenant boilerplate.                                                                      |
| `SECURITY.md`                      | **missing** | Minimum     | Reporting + honest data-handling disclosure.                                                           |
| `.github/ISSUE_TEMPLATE/`          | **missing** | Minimum     | Bug · Feature · Signal-quality (FP/FN).                                                                |
| `.github/PULL_REQUEST_TEMPLATE.md` | **missing** | Minimum     | Checklist that names the invariants + CI gates.                                                        |
| `.nvmrc` or `engines`              | **missing** | Minimum     | Pin Node 20.                                                                                           |
| `CHANGELOG.md`                     | **missing** | Good-enough | Or lean on GitHub Releases.                                                                            |
| `docs/extending.md`                | **missing** | Superb      | The three-seam extension guide.                                                                        |
| `.github/workflows/ci.yml`         | present ✅  | —           | Lint + build + test on push/PR. Gate branch protection on it.                                          |
| `.env.local.example`               | present ✅  | —           | Good — keep. Points to the free Gemini key.                                                            |
| `CLAUDE.md` / `AGENTS.md`          | present ✅  | keep        | Fine (arguably a _plus_) to publish — shows the agent-driven dev process. Contains no secrets.         |

### README spec (the one artifact that must land)

Lead with the inversion, not the features. Suggested spine:

1. **One-line hook + hero visual.** "You write every word. The AI never touches your prose — it just notices what you might have missed." GIF of the loop directly under it.
2. **The inversion, stated as a stance.** Two bullets: ✅ "This contradicts the metric you set in §2." → you go think. ❌ no "Apply suggestion" button, ever. (Straight from `CLAUDE.md`.)
3. **Try it** — link to the hosted demo first; then the 3-command local quickstart (`npm install` → copy `.env.local.example` → `npm run dev`). Note it runs with **zero key** in demo/mock mode.
4. **How it works** — one short paragraph + a link to `docs/architecture.md`: local-first PWA, incremental debounced eval, claim ledger for cross-doc checks, TipTap anchoring.
5. **Status & honesty box** — what works, what's early (n=0 field validation, Gemini-only router). This candor is the brand.
6. **Contributing** — link to CONTRIBUTING + the three extension seams + good-first-issues.
7. **License** (Apache-2.0) and a pointer to the concept/philosophy docs.

## Pre-flight cleanup & security sweep

**Cleanup (Minimum):**

- Remove `print_diffs.js`, `print_vague.js`, `test_output.txt` from tracking (scratch files; `test_output.txt` is a 334-line captured test dump).
- Confirm `.gitignore` still covers `.env.local`, `dist`, `node_modules`, `.obsidian/`, `.worktrees/` (it does) and add a `*_output.txt`-style guard.
- Decide on vendored agent skills (`.agents/skills/hallmark/**`, `.claude/skills/*`): these are third-party design-skill payloads bundled into the tree. Low risk, but confirm redistribution is fine or drop them from the public repo (they aren't part of the product).

**Security sweep — findings so far (mostly clean):**

- ✅ `.env.local` **never committed** (verified against full history).
- ✅ No live API key in history — the only `AIza` occurrences are two _docs_ describing the key-in-logs bug, using a redacted `AIzaSy…IBD1w` partial. **Action:** fully redact those two partials (`evaluation_signal_quality.md:306`, `model_rotation_and_debugging.md:171`) before public — a partial key is still bad hygiene to publish.
- ✅ No secrets in `.claude/launch.json` or `.env.local.example` (placeholder only).
- **Note the real product-level privacy fact for SECURITY.md/README:** on the free tier, every _settled_ block of the user's document is sent to Google's Gemini API. "Local-first" today is a claim about _storage_, not _egress_ (see the plan's privacy open question). Disclose this plainly rather than letting it be discovered. The honest fix — a local-model adapter — is the Superb-tier reference contribution.

## The `docs/` transparency decision

The repo carries a large, unusually candid internal docs tree: quality-observation logs, due-diligence audits that call the project "a solo artifact," snapshots naming false-positive classes, the "n=0" field-validation gap. **Recommendation: publish it as-is.** For a product whose entire thesis is "provoke honest thinking, don't paper over problems," publishing the messy internal reasoning is thesis-consistent and rare enough to be a talking point. The alternative (curate/hide) costs effort, invites "what are they hiding," and contradicts the brand. The only real edit needed is the two redacted-key partials above. **This is a user call — flag it, default to publish.**

## Positioning & launch assets

- **Name/domain:** resolved — `writtten` / writtten.com. No naming work needed.
- **Highest-leverage asset:** a **live hosted demo**. Static PWA, no backend, works with mock/zero-key first-run. "Try it in your browser, no signup, no key" is the whole funnel.
- **Second:** a 30–60s **demo GIF/video** of the loop, embedded in README and used in every launch post.
- **Narrative:** the "why" writes itself from `concept.md` (the inversion, "Grammarly-with-extra-steps" as the anti-pattern, "provoke don't prescribe"). One short essay/post.

## Go-to-market & further plan

**Sequence (don't big-bang):**

1. **Private polish** — land the Minimum tier + demo. Verify the zero-key demo actually witnesses a contradiction on first load.
2. **Soft launch** — share with a handful of real PMs (this _is_ field-validation V2 in `field_validation.md` — the launch and the validation are the same motion). Watch: do they write or paste? Is the critique respected or cold?
3. **Public launch** — once the demo holds up. Venues, ranked by fit:
   - **Show HN** — "Show HN: writtten – an AI writing tool that never writes for you." The inversion is a strong HN hook.
   - **r/ProductManagement**, PM/writing communities, Lobsters, X/Twitter.
   - **Product Hunt** — optional; needs the hero visual + demo to be worth it.
4. **Post-launch cadence** — triage issues; **route incoming signal-quality reports into `docs/logs/prompt_quality_observations.md`** (community FP/FN reports are exactly the corpus the project lacks); keep a small good-first-issue pipeline stocked.

**Metrics — keep them honest and privacy-respecting.** GitHub-side signals (stars, forks, issues, PRs, signal-quality reports) need no instrumentation. Any demo-usage analytics would touch invariant #5 (local-first / no telemetry) — if wanted, it's an explicit logged decision in `docs/plan.md`, privacy-respecting only, not a default. For a pet project, GitHub signals + qualitative demo feedback are enough; don't build an analytics stack.

## Deployment runbook — Cloudflare Pages

Concrete steps for the **Hosted live demo** milestone above. The repo-side artifacts landed in
`feat/hosted-demo-cloudflare` (`public/_redirects` SPA fallback, `public/_headers` cache + security
headers, `public/favicon.svg`, `public/og.png`, and `index.html` meta/OG tags).

> **Production deploys are release-gated (2026-07-07).** The original "Cloudflare builds on every push"
> model is superseded: pushing to `main` no longer ships to production. Instead
> `.github/workflows/deploy.yml` runs `wrangler pages deploy` and fires **only on a `v*` git tag**, which
> `release-please` creates when its accumulated release PR is merged. Merges to `main` still get a preview
> build; only a cut version reaches `writtten.com`. See `docs/mechanics/release_and_deploy.md` for the full
> flow. This needs three repo settings — secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` and
> variable `CLOUDFLARE_PROJECT_NAME` — and **automatic production deployments turned OFF** in the Pages
> project (step 6 below).

**Owner steps in the Cloudflare dashboard (one-time):**

1. Workers & Pages → Create → Pages → **Connect to Git** → authorize the Cloudflare GitHub App on the
   repo (works while the repo is still private).
2. Build settings: framework preset **None** (or Vite) · build command **`npm run build`** · output
   directory **`dist`** · set `NODE_VERSION=20` in the project's env vars.
3. **Leave application env vars empty — do NOT set `VITE_GEMINI_API_KEY`.** This is a `VITE_*` var, so it
   would be baked into the public JS bundle (harvestable, one shared free-tier RPD budget). The bundle
   ships **key-free** by design — this is what keeps the demo BYOK-only (invariant #5, and the logged
   NO-GO on any shared key). The keyless "See it in action" example plays via mock replay with no network.
4. First deploy builds from `main`; smoke-test the generated `*.pages.dev` URL.
5. Custom domain: Pages project → Custom domains → add **writtten.com** (+ optional `www`). DNS is already
   on Cloudflare, so it auto-creates the CNAME and provisions HTTPS.
6. **Turn OFF automatic production deployments** (Settings → Builds & deployments): production must come
   only from the tag-triggered `deploy.yml`, not from `main` pushes. Keep **preview** builds on for `main`
   so there's a live URL to dogfood between releases; restrict preview to `main` (or None) if the
   per-feature-branch previews are noisy. Add the `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets
   and `CLOUDFLARE_PROJECT_NAME` variable in GitHub (Settings → Secrets and variables → Actions).
7. Enable **branch protection** on `main` (required check `verify`) right after flipping the repo public —
   GitHub's free tier blocks it while private (see § Pre-flight cleanup).

Flip the plan.md milestone to `[x]` only once `writtten.com` actually resolves.

## The tiers at a glance

| Tier            | Definition                                                                                                                              | Roughly                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Minimum**     | Legally forkable, understandable, runnable, no leaked secrets. LICENSE + README + hygiene + security sign-off + basic community files.  | Phase 6, mostly 🔧/⚙️, days not weeks. |
| **Good-enough** | A credible, welcoming launch: live demo, hero visual, zero-config try, honest status, first release, launch post.                       | Phase 6 → early 7.                     |
| **Superb**      | "Contribute to" is true: documented seams, a second model adapter, good-first-issues, enforced philosophy guardrails, a triage cadence. | Phase 9, 🧠, real engineering.         |

**Launch bar (decided 2026-07-06):** ship at **Good-enough _plus_ multi-provider BYOK.** Minimum alone reads as "code dump"; Good-enough (hosted demo + hero visual + honest status) is the credible bar — and the owner elected to also make **Gemini + OpenAI + Anthropic** (`multi_provider_router.md`) a hard pre-public blocker rather than a fast-follow. Everything else in **Superb** (the `docs/extending.md` seam guide, the good-first-issue pipeline, guardrail docs, triage cadence) is specced to 🟢 here but accretes _after_ launch as contributors arrive.

**Decisions locked this session (2026-07-06):**

> - **Hosted proxy → NO-GO.** No shared-key backend; the hosted demo is BYOK-only (canned example + paste-your-key). See `docs/projects/hosted_proxy.md` (parked, revisit post-launch if friction bites).
> - **Demo host → Cloudflare Pages** (static PWA, custom domain `writtten.com`).
> - **Provider breadth → all three at launch**, as a hard blocker. See `docs/projects/multi_provider_router.md`.
