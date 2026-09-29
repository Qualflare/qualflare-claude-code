#!/usr/bin/env bash
# check-report-fixtures.sh — feed every fixture under tests/fixtures/reports/ to
# `qf validate --format <slug>`, where <slug> is the file's basename
# (mocha.json -> mocha) or, for a directory, its name (junit/*.xml -> junit).
#
# The fixtures are real output of the runner commands in skills/qf-run/SKILL.md
# (scripts/check-skills.mjs fails if a runner row has no fixture in its parser's
# format), so this proves the CLI parses what /qf-run produces.
#
# Usage: bash scripts/check-report-fixtures.sh [path-to-qf]   (default: qf on PATH)
set -euo pipefail

QF="${1:-qf}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES="$REPO_ROOT/tests/fixtures/reports"

if ! command -v "$QF" >/dev/null 2>&1; then
  echo "ERROR: qf CLI not found ($QF)" >&2
  exit 1
fi

fail=0
checked=0
for entry in "$FIXTURES"/*; do
  name="$(basename "$entry")"
  if [[ -d "$entry" ]]; then
    slug="$name"
    files=("$entry"/*)
  else
    slug="${name%.*}"
    files=("$entry")
  fi
  if out="$("$QF" validate --format "$slug" "${files[@]}" 2>&1)"; then
    echo "ok   $slug (${#files[@]} file(s))"
  else
    echo "FAIL $slug" >&2
    echo "$out" | sed 's/^/     /' >&2
    fail=1
  fi
  checked=$((checked + 1))
done

if [[ $checked -eq 0 ]]; then
  echo "ERROR: no fixtures under $FIXTURES" >&2
  exit 1
fi
exit $fail
