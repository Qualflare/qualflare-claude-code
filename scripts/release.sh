#!/usr/bin/env bash
# Usage: bash scripts/release.sh <new-version>
# Example: bash scripts/release.sh 0.11.0
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

NEW_VERSION="${1:-}"
if [[ -z "$NEW_VERSION" ]]; then
  echo "Usage: bash scripts/release.sh <new-version>" >&2
  exit 1
fi

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be semver (e.g. 0.11.0)" >&2
  exit 1
fi

echo "==> Checking for uncommitted changes..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree has uncommitted changes. Commit or stash first." >&2
  exit 1
fi

echo "==> Validating framework slugs..."
bash scripts/check-slugs.sh

echo "==> Running hook tests..."
node --test hooks/stop-hook.test.mjs

echo "==> Bumping version in .claude-plugin/plugin.json to $NEW_VERSION..."
node -e "
const fs = require('fs');
const p = '.claude-plugin/plugin.json';
const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
obj.version = process.argv[1];
fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
" "$NEW_VERSION"

echo "==> Updating Plugin version in skills/qf-init/SKILL.md..."
sed -i '' "s/- Plugin version: [0-9]*\.[0-9]*\.[0-9]*/- Plugin version: $NEW_VERSION/" \
  skills/qf-init/SKILL.md

echo "==> Staging changed files..."
git add .claude-plugin/plugin.json skills/qf-init/SKILL.md

echo "==> Committing release..."
git commit -m "chore: release v$NEW_VERSION"

echo "==> Tagging v$NEW_VERSION..."
git tag "v$NEW_VERSION"

echo ""
echo "Release v$NEW_VERSION ready."
echo "Push with: git push && git push --tags"
