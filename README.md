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
/qualflare-init
```

This detects your tech stack, writes `.qualflare/test-state.md`, and optionally enables the Stop hook.

## Commands

| Command | What it does |
|---------|-------------|
| `/qualflare-init` | First-time setup: detect stack, write state file |
| `/qualflare-cover` | Generate tests for code you just changed |
| `/qualflare-run` | Run tests and upload results to Qualflare |
| `/qualflare-state` | Show current Qualflare state for this project |
| `/qualflare-hook on\|off` | Toggle the post-session test suggestion |

## Stop hook

When enabled during `/qualflare-init`, the Stop hook fires at the end of each Claude Code session and prints a one-line nudge if you edited source files without updating tests:

```
🔍 Qualflare: 2 source file(s) changed without test updates. Run /qualflare-cover to add coverage.
```

Toggle it any time with `/qualflare-hook on` or `/qualflare-hook off`.

## Requirements

- Claude Code
- [Qualflare CLI (`qf`)](https://qualflare.com/docs/cli) installed in PATH
- Run `qf login` to authenticate before uploading results

## Update

```
/plugin update qualflare
```
