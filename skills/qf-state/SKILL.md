---
name: qf-state
description: >
  Show the current Qualflare state for this project — detected frameworks, test
  counts, hook setting, and last upload info. Use when the user runs
  /qf-state, asks "what does Qualflare know about this project?", or
  asks about their current Qualflare setup.
allowed-tools: Read Glob Bash(qf:*) Bash(printenv:*)
---

## Step 1 — Read state files

Read both of the following files:
- `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`
- `$CLAUDE_PROJECT_DIR/.qualflare/config.json`

If `test-state.md` does not exist, tell the user:
> "No Qualflare state file found. Please run `/qf-init` first to set up the integration."

Stop here — do not proceed without the state file.

If `config.json` does not exist, treat the hook as "not configured" and note it in the output.

From `test-state.md`, extract:
- **Project name** from `## Project`
- **Generated timestamp** from `## Project`
- **Package list** from `## Packages` table (if present). If the table is absent (legacy format), create a synthetic single entry: `{ path: "(root)", qualflareProject: <project name> }`.
- **Frameworks in use** from `## Frameworks in use` table — including the `Package` column if present. If the table has no `Package` column (legacy format), treat all rows as belonging to `(root)`.
- **Frameworks suggested** from `## Frameworks suggested` section.
- **Conventions** from `## Conventions` section.

---

## Step 2 — Display state

For each framework row in `## Frameworks in use`, use `Glob` to re-count test files live. Use the glob patterns from the framework-slugs reference (stored at `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`). Scope each Glob to the package's top-level paths from the `Top-level paths` column. Exclude results under `node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `.git/`, `__pycache__/`.

**Single-package format** (package list has exactly one entry, i.e., `(root)`):

```
Qualflare State

Project: <name from test-state.md>
Generated: <timestamp from test-state.md>

Frameworks in use:
  jest          — 44 test files (src/**/*.test.ts)  [was 42 at init]
  playwright    — 18 test files (e2e/**/*.spec.ts)

Frameworks suggested:
  cypress       — alternative E2E coverage

Conventions:
  Test naming: *.test.ts
  Coverage threshold: 80%

Stop hook: ✅ enabled  (or ❌ disabled)

Qualflare backend: QF_API_KEY not set ⚠️
```

**Multi-package format** (package list has more than one entry):

```
Qualflare State

Project: <name from test-state.md>
Generated: <timestamp from test-state.md>

Packages (2):

  packages/web  →  @acme/web
    jest         — 44 test files (packages/web/src/**/*.test.ts)  [was 42 at init]
    playwright   — 18 test files (e2e/**/*.spec.ts)

  packages/api  →  acme-api
    golang       — 15 test files (packages/api/**/*_test.go)

  packages/utils  →  acme-utils
    (no frameworks detected)

Frameworks suggested:
  cypress       — alternative E2E coverage

Conventions:
  Test naming: *.test.ts
  Coverage threshold: 80%

Stop hook: ✅ enabled  (or ❌ disabled)

Qualflare backend: QF_API_KEY not set ⚠️
```

Field guidance:
- **Project**: the project name from `test-state.md`.
- **Generated**: the timestamp recorded when `test-state.md` was last written.
- **Packages (N)**: shown only in multi-package format. Lists every package from `## Packages`, grouped as a block. Packages with no rows in `## Frameworks in use` show `(no frameworks detected)`.
- **Frameworks in use** (single-package) / per-package framework rows (multi-package): show each framework with its **live** test file count (from the fresh Glob), the glob pattern, and optionally a `[was N at init]` suffix if the live count differs from the count stored in `test-state.md`. If counts are not stored in `test-state.md`, omit the suffix.
- **Frameworks suggested**: list any frameworks mentioned as suggestions in `test-state.md`. Omit this section if none.
- **Conventions**: include any test naming patterns, coverage thresholds, or other conventions recorded in `test-state.md`. Omit this section if no conventions are recorded.
- **Stop hook**: read `config.json` for the hook enabled/disabled status. If `config.json` does not exist, show "not configured — run `/qf-init` to enable".
- **Qualflare backend**: determined in Step 3 below.

---

## Step 3 — Check CLI and API key

Run `qf version` to verify the CLI is installed:
- **Exit 0:** CLI is available. Note the version string.
- **Exit 127 or not found:** add: "qf CLI not found. Install it from https://qualflare.com/docs/cli"

If CLI is available, run `printenv QF_API_KEY`:
- **Non-empty output:** show `Qualflare backend: QF_API_KEY configured ✅`
- **Empty output:** show `Qualflare backend: QF_API_KEY not set ⚠️ — set it with: export QF_API_KEY=<your-key>  (https://qualflare.com/settings/api-keys)`

Note: the Qualflare CLI authenticates via the `QF_API_KEY` environment variable or the `--api-key` flag. There is no `qf login` command.

---

## Step 4 — Suggest next steps

Always end the output with:

```
Available commands:
  /qf-cover   — generate tests for changed code
  /qf-run     — run tests and upload results
  /qf-fix     — fix failing tests from the last run
  /qf-doctor  — health check: CLI, auth, config, drift
  /qf-update  — refresh file counts in test-state.md
  /qf-hook on|off — toggle the Stop hook
  /qf-init    — re-run setup (refreshes test-state.md)
```
