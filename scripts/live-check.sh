#!/usr/bin/env bash
#
# Live-model sanity check for the section-eval prompt.
#
# Sources API keys into the shell environment WITHOUT printing them, then runs
# the gated live harness (src/model/livecheck.live.test.ts). The harness reads
# keys from process.env, hits each provider you have a key for, and reports the
# model's output + a few quality signals. It never logs a key.
#
# Keys live in .env.test.local (gitignored — copy .env.test.local.example):
#   OPENAI, ANTHROPIC, GEMINI_FREE, GEMINI_PAID
# ./.env.local (VITE_GEMINI_API_KEY) is also sourced as a gemini fallback, plus
# whatever is already exported in your shell. Later sources win.
#
# Usage:
#   scripts/live-check.sh                          # every provider with a key
#   scripts/live-check.sh --provider openai        # (forwarded to vitest)
#
# Any extra args are forwarded to vitest.

set -euo pipefail
cd "$(dirname "$0")/.."

# --provider <id> narrows to one provider (openai|gemini|anthropic); the rest is
# forwarded to vitest. It maps to LIVE_CHECK_PROVIDER, which the harness reads.
provider=""
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --provider) provider="${2:-}"; shift 2 ;;
    --provider=*) provider="${1#*=}"; shift ;;
    *) args+=("$1"); shift ;;
  esac
done

# Source key files silently. `set -a` exports every var they define; the leading
# `set +x`/no-echo means values never reach the terminal or an agent transcript.
load() { if [ -f "$1" ]; then set -a; # shellcheck disable=SC1090
  . "$1"; set +a; echo "· loaded keys from $1"; fi; }

load "./.env.local"        # dev env (VITE_GEMINI_API_KEY) — used as a gemini fallback
load "./.env.test.local"   # repo-local live-test keys (gitignored); wins

# Report which providers are armed — names only, never values.
armed=""
[ -n "${OPENAI:-}" ]                                          && armed="$armed openai"
[ -n "${GEMINI_FREE:-${GEMINI_PAID:-${VITE_GEMINI_API_KEY:-}}}" ] && armed="$armed gemini"
[ -n "${ANTHROPIC:-}" ]                                       && armed="$armed anthropic"
if [ -z "$armed" ]; then
  echo "No keys found. Add at least one to .env.test.local (copy .env.test.local.example)." >&2
  exit 1
fi
echo "· providers armed:${armed}"

[ -n "$provider" ] && echo "· narrowed to: $provider"
# ${args[@]+…} guards against an empty array under `set -u` on bash 3.2 (macOS).
LIVE_CHECK=1 LIVE_CHECK_PROVIDER="$provider" \
  npx vitest run src/model/livecheck.live.test.ts ${args[@]+"${args[@]}"}
