#!/usr/bin/env bash
#
# Reproducible sourcing for the V1 base-rate corpus study (field_validation.md § V1).
#
# Assembles a STRATIFIED corpus of real, public, license-clear markdown docs into
# a LOCAL, gitignored dir (default ./.v1-corpus), one subfolder per doc type. Only
# this script (public URLs, no corpus content) is committed — the downloaded docs
# stay local (local-first invariant #5; audit-#5 privacy).
#
# Real confidential PRDs are not public, so the "spec/PRD" slice uses open-source
# RFCs / design docs as a PROXY, and the "prd" slice uses PRD-shaped web-platform
# explainers. State this plainly wherever the numbers are reported.
#
# Requires: gh (authenticated), curl, awk. Usage:  bash fetch-corpus.sh [target-dir]
set -euo pipefail

ROOT="${1:-$(pwd)/.v1-corpus}"
mkdir -p "$ROOT/spec" "$ROOT/decision" "$ROOT/comms" "$ROOT/prd"
MAN="$ROOT/manifest.csv"
echo "doc_type,local_file,source_url,bytes,license" > "$MAN"

# fetch_dir: top-N .md in a GitHub repo dir within a byte band -> <bucket>/<prefix>-NN.md
fetch_dir () { # repo path bucket prefix count minb maxb license [start]
  local repo="$1" p="$2" bucket="$3" prefix="$4" count="$5" minb="$6" maxb="$7" lic="$8" n="${9:-1}"
  gh api "repos/$repo/contents/$p" --paginate \
    -q '.[] | select(.name|endswith(".md")) | "\(.size)\t\(.download_url)\t\(.name)"' 2>/dev/null \
  | awk -F'\t' -v lo="$minb" -v hi="$maxb" '$1>=lo && $1<=hi' | sort -rn | head -n "$count" \
  | while IFS=$'\t' read -r size url name; do
      local out="$bucket/${prefix}-$(printf '%02d' "$n").md"
      curl -fsSL "$url" -o "$ROOT/$out" && echo "$bucket,$out,$url,$size,$lic" >> "$MAN" \
        && echo "  ✓ $out ($size) <- $name"
      n=$((n+1))
    done
}

# fetch_url: a single explicit raw URL -> <bucket>/<name>
fetch_url () { # url bucket name license
  local url="$1" bucket="$2" name="$3" lic="$4" out="$2/$3"
  if curl -fsSL "$url" -o "$ROOT/$out" 2>/dev/null && [ -s "$ROOT/$out" ]; then
    local sz; sz=$(wc -c < "$ROOT/$out" | tr -d ' ')
    echo "$bucket,$out,$url,$sz,$lic" >> "$MAN"; echo "  ✓ $out ($sz)"
  else echo "  ✗ skip $url"; rm -f "$ROOT/$out"; fi
}

echo "== spec (10): RFCs / design docs as PRD proxy =="
fetch_dir rust-lang/rfcs text spec rust-rfc 6 12000 55000 "MIT/Apache-2.0"
fetch_dir rust-lang/rfcs text spec rust-rfc 2 30000 46000 "MIT/Apache-2.0" 7
fetch_dir reactjs/rfcs text spec react-rfc 2 8000 55000 "MIT"

echo "== decision (4): Cosmos SDK ADRs =="
fetch_dir cosmos/cosmos-sdk docs/architecture decision cosmos-adr 4 8000 40000 "Apache-2.0"

echo "== comms (3): Rust blog announcements =="
fetch_dir rust-lang/blog.rust-lang.org content comms rust-blog 3 6000 25000 "MIT/Apache-2.0"

echo "== prd (2): PRD-shaped web-platform explainers =="
fetch_url "https://raw.githubusercontent.com/WICG/view-transitions/main/explainer.md" prd explainer-01.md "CC-BY/W3C"
fetch_url "https://raw.githubusercontent.com/WICG/soft-navigations/main/README.md"     prd explainer-02.md "CC-BY/W3C"

echo "== done =="
for d in prd spec decision comms; do echo "  $d: $(ls "$ROOT/$d" 2>/dev/null | wc -l | tr -d ' ')"; done
echo "manifest: $MAN"
