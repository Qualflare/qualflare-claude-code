---
name: qf-state
description: >
  Show the current Qualflare state for this project — detected frameworks, test
  counts, hook setting, and last upload info. Use when the user runs
  /qf-state, asks "what does Qualflare know about this project?", or
  asks about their current Qualflare setup.
allowed-tools: Read Glob Bash(qf:*)
---

## Step 1 — Read state files

Read both of the following files:
- `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`
- `$CLAUDE_PROJECT_DIR/.qualflare/config.json`

If `test-state.md` does not exist, tell the user:
> "No Qualflare state file found. Please run `/qf-init` first to set up the integration."

Stop here — do not proceed without the state file.

If `config.json` does not exist, treat the hook as "not configured" and note it in the output.

---

## Step 2 — Display state

For each framework slug listed in `test-state.md`, use `Glob` to re-count test files live using the glob patterns from the framework-slugs reference (stored at `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`). Exclude results under `node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `.git/`, `__pycache__/`.

Print a tidy summary. Use this format:

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

Qualflare backend: not connected (run `qf login`)
```

Field guidance:
- **Project**: the project name from `test-state.md`.
- **Generated**: the timestamp recorded when `test-state.md` was last written.
- **Frameworks in use**: list each detected framework with its **live** test file count (from the fresh Glob), the glob pattern, and optionally a `[was N at init]` suffix if the live count differs from the count stored in `test-state.md`. If counts are not stored in `test-state.md`, omit the suffix.
- **Frameworks suggested**: list any frameworks mentioned as suggestions in `test-state.md` (frameworks that were detected but are not yet active).
- **Conventions**: include any test naming patterns, coverage thresholds, or other conventions recorded in `test-state.md`. Omit this section if no conventions are recorded.
- **Stop hook**: read `config.json` for the hook enabled/disabled status. If `config.json` does not exist, show "not configured — run `/qf-init` to enable".
- **Qualflare backend**: determined in Step 3 below.

---

## Step 3 — Run `qf status`

Attempt to run:

```bash
qf status
```

- If the command succeeds (exit code 0), append its output below the state summary under a "Backend Status" heading.
- If the command is not found (exit code 127 or similar), add:
  > "qf CLI not found. Install it from https://qualflare.com/docs/cli and run `qf login`."
- If the command exits non-zero with output containing `auth`, `token`, `unauthorized`, `401`, or `login`, add:
  > "Not connected to Qualflare backend. Run `qf login` to connect."
- For any other non-zero exit, show the error output as-is.

---

## Step 4 — Suggest next steps

Always end the output with:

```
Available commands:
  /qf-cover   — generate tests for changed code
  /qf-run     — run tests and upload results
  /qf-hook on|off — toggle the Stop hook
  /qf-init    — re-run setup (refreshes test-state.md)
```
