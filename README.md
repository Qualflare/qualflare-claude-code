# qualflare-ai — Claude Code Plugin

A [Claude Code](https://claude.ai/code) plugin that connects your coding sessions to [Qualflare](https://qualflare.com) for test management and reporting.

## Install

```bash
# In Claude Code
/plugin marketplace add Astrais/qualflare-ai
/plugin install qualflare@qualflare
```

## Set up your project

Run once in any project:
```
/qf-init
```

This detects your tech stack, writes `.qualflare/test-state.md`, and optionally enables the Stop hook.

## Commands

| Command | What it does |
|---------|-------------|
| `/qf-init` | First-time setup: detect stack, write state file |
| `/qf-cover` | Generate tests for code you just changed |
| `/qf-run` | Run tests and upload results to Qualflare |
| `/qf-fix` | Fix failing tests from the last run |
| `/qf-doctor` | Health check: CLI, API key, config, drift |
| `/qf-update` | Refresh file counts without re-running setup |
| `/qf-state` | Show current Qualflare state for this project |
| `/qf-hook on\|off` | Toggle the post-session test suggestion |

## Stop hook

When enabled during `/qf-init`, the Stop hook fires at the end of each Claude Code session and prints a one-line nudge if you edited source files without updating tests:

```
🔍 Qualflare: 2 source file(s) changed without test updates. Run /qf-cover to add coverage.
```

Toggle it any time with `/qf-hook on` or `/qf-hook off`.

## Requirements

- Claude Code
- [Qualflare CLI (`qf`)](https://qualflare.com/docs/cli) installed in PATH
- `QF_API_KEY` environment variable set (get your key from https://qualflare.com/settings/api-keys)

## Update

```
/plugin update qualflare
```
