import { execSync } from "node:child_process";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json" with { type: "json" };

// Build-stamp: the semver from package.json (release-please owns it) plus the
// short git SHA of the built commit, so a bug report can be pinned to an exact
// build. On a hosted CI build the SHA comes from the checked-out commit; if git
// isn't available (rare) we degrade to "unknown" rather than fail the build.
function gitSha(): string {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA.slice(0, 7);
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify(gitSha()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'writtten',
        short_name: 'writtten',
        description: 'An un-AI-slop editor',
        theme_color: '#fafaf8',
        background_color: '#fafaf8',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: [
          {
            src: 'screenshots/screenshot-wide.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide'
          },
          {
            src: 'screenshots/screenshot-narrow.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow'
          }
        ]
      }
    })
  ],
  test: {
    exclude: [
      // record.test.ts makes live API calls to populate fixture recordings.
      // It runs only via `npm run eval:record`, never in the default CI suite.
      "**/eval-fixtures/record.test.ts",
      // Standard vitest/vite excludes (keep in sync with vitest defaults):
      "**/node_modules/**",
      "**/dist/**",
      // Per-session parallel-work git worktrees live under .worktrees/ (gitignored);
      // don't run other branches' test copies in this tree's suite.
      "**/.worktrees/**",
    ],
  },
});
