#!/usr/bin/env bash
# Pushes app variables from .env.local to Vercel (production + preview) without printing values.
# Usage: scripts/sync-env.sh VAR1 VAR2 ...   (only non-empty values are sent; existing ones are replaced)
set -euo pipefail
cd "$(dirname "$0")/.."
SCOPE=mesa-cd25
v() { npx --yes vercel@latest "$@" --scope "$SCOPE"; }

for name in "$@"; do
  value=$(grep -E "^${name}=" .env.local | head -1 | cut -d= -f2- || true)
  if [ -z "$value" ]; then echo "  $name: empty in .env.local, skipped"; continue; fi
  for target in production preview; do
    v env rm "$name" "$target" --yes >/dev/null 2>&1 || true
    if printf '%s' "$value" | v env add "$name" "$target" >/dev/null 2>&1; then
      echo "  $name → $target: set (${#value} chars)"
    else
      echo "  $name → $target: FAILED"
    fi
  done
done
