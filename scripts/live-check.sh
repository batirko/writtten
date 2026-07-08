#!/usr/bin/env bash
#
# Live-model sanity check for the section-eval prompt.
#
# Sources API keys into the shell environment WITHOUT printing them, then runs
# the gated live harness (src/model/livecheck.live.test.ts). The harness reads
# keys from process.env, hits each provider you have a key for, and reports the
# model's output + a few quality signals. It never logs a key.
#
# Key sources (later ones win), all optional:
#   1. ~/.config/writtten/test-keys.env   — cross-session store (chmod 600)
#   2. ./.env.local                        — repo dev env (VITE_GEMINI_API_KEY)
#   3. whatever is already exported in your shell
#
# Usage:
#   scripts/live-check.sh                 # check every provider you have a key for
#   scripts/live-check.sh --provider openai
#
# Any extra args are forwarded to vitest.

set -euo pipefail
cd "$(dirname "$0")/.."

# Source key files silently. `set -a` exports every var they define; the leading
# `set +x`/no-echo means values never reach the terminal or an agent transcript.
load() { if [ -f "$1" ]; then set -a; # shellcheck disable=SC1090
  . "$1"; set +a; echo "· loaded keys from $1"; fi; }

load "$HOME/.config/writtten/test-keys.env"
load "./.env.local"

# Report which providers are armed — names only, never values.
armed=""
[ -n "${OPENAI_API_KEY:-}" ]                                  && armed="$armed openai"
[ -n "${GEMINI_API_KEY:-${VITE_GEMINI_API_KEY:-}}" ]         && armed="$armed gemini"
[ -n "${ANTHROPIC_API_KEY:-}" ]                              && armed="$armed anthropic"
if [ -z "$armed" ]; then
  echo "No keys found. Add at least one to ~/.config/writtten/test-keys.env" >&2
  exit 1
fi
echo "· providers armed:${armed}"

LIVE_CHECK=1 npx vitest run src/model/livecheck.live.test.ts "$@"
