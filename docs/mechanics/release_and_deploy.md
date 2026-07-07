# Release & deploy mechanic

_How a change actually reaches `writtten.com`. Describes the built system, not a proposal. Introduced 2026-07-07._

## The one-line model

**Merges accumulate on `main`; a public deploy happens only when a version is cut.** Cutting a version and
deploying are the same act — you never deploy an un-versioned build, and you never bump a version that
doesn't deploy.

## The pipeline

```
PR merged to main ─► CI (ci.yml) green
                  └► release-please (release-please.yml) updates the standing release PR
                       (accumulates CHANGELOG.md + bumps package.json version)

  … more PRs merge, the release PR keeps growing …

Merge the release PR ─► release-please tags  vX.Y.Z  + publishes the GitHub Release
                     └► deploy.yml fires on the  v*  tag
                          └► npm ci → lint → test → build → wrangler pages deploy dist
                               └► live at writtten.com
```

Ordinary merges to `main` do **not** touch production. They get a Cloudflare **preview** build (a
`*.pages.dev` URL) for dogfooding. Only the tag reaches the production domain.

## Who owns what

| Concern | Owner | File |
| --- | --- | --- |
| Per-PR checks (lint/test/build) | `ci.yml` | `.github/workflows/ci.yml` |
| Version number + changelog | `release-please` | `release-please-config.json`, `.release-please-manifest.json` |
| Standing "release PR" | `release-please.yml` | `.github/workflows/release-please.yml` |
| Production deploy | `deploy.yml` (tag-triggered) | `.github/workflows/deploy.yml` |
| Preview builds for `main` | Cloudflare Pages Git integration | (dashboard) |

## Versioning scheme

SemVer, pre-1.0 (`0.x`). Config sets `bump-minor-pre-major` + `bump-patch-for-minor-pre-major`, so:

- a `feat:` commit → **minor** bump (`0.1.0` → `0.2.0`) — the normal "release batch"
- a `fix:` commit → **patch** bump (`0.2.0` → `0.2.1`) — a hotfix
- `docs:`/`chore:`/`test:`/`ci:` → no release on their own (hidden from the changelog)

The scheme leans entirely on the repo's existing **conventional-commit** PR-title convention. A PR titled
`feat(settings): …` is what makes release-please schedule a minor bump; an unconventional title is invisible
to it.

## The build stamp

`vite.config.ts` injects two compile-time globals via `define`:

- `__APP_VERSION__` — read from `package.json` (the number release-please owns)
- `__GIT_SHA__` — short SHA of the built commit (`CF_PAGES_COMMIT_SHA` / `GITHUB_SHA` on CI, else `git rev-parse`)

They surface as a quiet footer at the foot of **Settings** (`[data-testid="build-version"]`,
`writtten vX.Y.Z · <sha>`), so a bug report can be pinned to an exact build. Not DEV-gated — it ships to
production on purpose.

## Manual prerequisites (dashboard / secrets, one-time)

1. Cloudflare Pages → project → Settings → Builds & deployments → **turn OFF automatic production
   deployments** (otherwise `main` pushes still ship and race the tag deploy).
2. GitHub → Settings → Secrets and variables → Actions:
   - secret `CLOUDFLARE_API_TOKEN` (scope: Cloudflare Pages → Edit)
   - secret `CLOUDFLARE_ACCOUNT_ID`
   - variable `CLOUDFLARE_PROJECT_NAME` (the Pages project name)

Until these exist, `deploy.yml` will fail at the wrangler step — safe, since nothing else depends on it.

## How to publish (the day-to-day)

1. Merge feature PRs to `main` as usual.
2. When ready to ship, open the release PR release-please maintains ("chore(main): release x.y.z"), sanity-check
   the changelog, and **merge it**.
3. That's it — the tag triggers the deploy; watch the `Deploy to Cloudflare Pages` action go green and the new
   version appear in the Settings footer on `writtten.com`.
