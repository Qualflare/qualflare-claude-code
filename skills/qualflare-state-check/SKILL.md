---
name: qualflare-state-check
description: >
  Show the current Qualflare state for this project — detected frameworks, test
  counts, hook setting, and last upload info. Use when the user runs
  /qualflare-state, asks "what does Qualflare know about this project?", or
  asks about their current Qualflare setup.
allowed-tools: Read Bash(qf:*)
---

## Step 1 — Read state files

Read both of the following files:
- `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md`
- `$CLAUDE_PROJECT_DIR/.qualflare/config.json`

If `test-state.md` does not exist, tell the user:
> "No Qualflare state file found. Please run `/qualflare-init` first to set up the integration."

Stop here — do not proceed without the state file.

If `config.json` does not exist, treat the hook as "not configured" and note it in the output.

---

## Step 2 — Display state

Print a tidy summary using information from the state files. Use this format:

```
Qualflare State

Project: <name from test-state.md>
Generated: <timestamp from test-state.md>

Frameworks in use:
  jest          — 42 test files (src/**/*.test.ts)
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
- **Frameworks in use**: list each detected framework with its test file count and glob pattern, as recorded in `test-state.md`. If counts are not recorded, omit them.
- **Frameworks suggested**: list any frameworks mentioned as suggestions in `test-state.md` (frameworks that were detected but are not yet active).
- **Conventions**: include any test naming patterns, coverage thresholds, or other conventions recorded in `test-state.md`. Omit this section if no conventions are recorded.
- **Stop hook**: read `config.json` for the hook enabled/disabled status. If `config.json` does not exist, show "not configured — run `/qualflare-init` to enable".
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
  /qualflare-cover   — generate tests for changed code
  /qualflare-run     — run tests and upload results
  /qualflare-hook on|off — toggle the Stop hook
  /qualflare-init    — re-run setup (refreshes test-state.md)
```
