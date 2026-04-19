#!/usr/bin/env bash
# check-slugs.sh — verify that every Framework slug in the Go source
# is referenced in skills/qualflare-init/references/framework-slugs.md
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# qualflare-ai lives inside the Astrais monorepo alongside qualflare-cli.
# Resolve the monorepo root via git: the .git directory's parent is the
# qualflare-ai checkout root, and qualflare-cli is a sibling of that.
GIT_COMMON_DIR="$(git -C "$REPO_ROOT" rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -n "$GIT_COMMON_DIR" ]]; then
  # git-common-dir may be relative; make it absolute
  case "$GIT_COMMON_DIR" in
    /*) ;;
    *) GIT_COMMON_DIR="$REPO_ROOT/$GIT_COMMON_DIR" ;;
  esac
  QUALFLARE_AI_ROOT="$(cd "$GIT_COMMON_DIR/.." && pwd)"
else
  # Fallback: assume a plain checkout where REPO_ROOT == qualflare-ai root
  QUALFLARE_AI_ROOT="$REPO_ROOT"
fi

ASTRAIS_ROOT="$(cd "$QUALFLARE_AI_ROOT/.." && pwd)"
GO_FILE="$ASTRAIS_ROOT/qualflare-cli/internal/core/domain/models.go"
SLUGS_MD="$REPO_ROOT/skills/qualflare-init/references/framework-slugs.md"

if [[ ! -f "$GO_FILE" ]]; then
  echo "ERROR: Go source not found at $GO_FILE" >&2
  exit 1
fi

if [[ ! -f "$SLUGS_MD" ]]; then
  echo "ERROR: framework-slugs.md not found at $SLUGS_MD" >&2
  exit 1
fi

# Extract slugs from lines like: FrameworkFoo Framework = "bar"
# Use perl for cross-platform regex (macOS grep lacks -P).
# Avoid mapfile (bash 4+) for macOS compatibility; use a while-read loop instead.
SLUGS=()
while IFS= read -r slug; do
  SLUGS+=("$slug")
done < <(perl -ne 'if (/Framework\w+\s+Framework\s*=\s*"(\w+)"/) { print "$1\n" }' "$GO_FILE")

if [[ ${#SLUGS[@]} -eq 0 ]]; then
  echo "ERROR: No slugs found in $GO_FILE — check the pattern" >&2
  exit 1
fi

MISSING=()
for slug in "${SLUGS[@]}"; do
  if ! grep -qF "\`${slug}\`" "$SLUGS_MD" && ! grep -qF "\"${slug}\"" "$SLUGS_MD"; then
    MISSING+=("$slug")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: The following slug(s) from models.go are missing in framework-slugs.md:" >&2
  for slug in "${MISSING[@]}"; do
    echo "  - $slug" >&2
  done
  exit 1
fi

echo "✅ All ${#SLUGS[@]} slugs accounted for in framework-slugs.md"
