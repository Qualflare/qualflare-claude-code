#!/usr/bin/env bash
# check-slugs.sh — verify that the Framework slugs in the CLI's Go source and
# skills/qf-init/references/framework-slugs.md are the same set.
#
# Usage: bash scripts/check-slugs.sh
#        QF_CLI_DIR=/path/to/qualflare-cli bash scripts/check-slugs.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# QF_CLI_DIR, when set, points at a qualflare-cli checkout and wins. Otherwise
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

if [[ -n "${QF_CLI_DIR:-}" ]]; then
  CLI_ROOT="$QF_CLI_DIR"
else
  CLI_ROOT="$(cd "$QUALFLARE_AI_ROOT/.." && pwd)/qualflare-cli"
fi
GO_FILE="$CLI_ROOT/internal/core/domain/models.go"
SLUGS_MD="$REPO_ROOT/skills/qf-init/references/framework-slugs.md"

if [[ ! -f "$GO_FILE" ]]; then
  echo "ERROR: Go source not found at $GO_FILE" >&2
  exit 1
fi

if [[ ! -f "$SLUGS_MD" ]]; then
  echo "ERROR: framework-slugs.md not found at $SLUGS_MD" >&2
  exit 1
fi

# The comparison itself lives in slugs.mjs (tested by slugs.test.mjs). It reads
# AllFrameworks() — the list the CLI's --format validation uses — accepts
# hyphenated slugs such as `qualflare-json`, and fails in BOTH directions: a CLI
# slug missing from the docs, or a doc slug the CLI no longer accepts.
exec node "$SCRIPT_DIR/slugs.mjs" --go "$GO_FILE" --docs "$SLUGS_MD"
