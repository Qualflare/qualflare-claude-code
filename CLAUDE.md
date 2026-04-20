# qualflare-ai — Claude Code Plugin Developer Guide

## What is this?

`qualflare-ai` is a Claude Code plugin for [Qualflare](https://qualflare.com), a test management and reporting platform. Users install it via the Claude Code plugin marketplace and run `/qf-init` to set up their project.

## Plugin structure

```
qualflare-ai/
├── .claude-plugin/
│   ├── plugin.json          # Plugin manifest (name, version, description)
│   └── marketplace.json     # Marketplace listing
├── skills/
│   ├── qf-init/      # First-time setup (detection, test-state.md, hook opt-in)
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── framework-slugs.md   # 19 canonical slugs — keep in sync with Go source
│   ├── qf-cover/  # Generate tests for changed source files
│   ├── qf-run/  # Run tests + qf upload
│   ├── qf-fix/  # Fix failing tests from last run
│   ├── qf-doctor/  # Health check: CLI, auth, config, drift
│   ├── qf-update/  # Refresh file counts in test-state.md
│   └── qf-state/ # Inspect current state
├── commands/
│   ├── qf-init.md
│   ├── qf-cover.md
│   ├── qf-run.md
│   ├── qf-fix.md
│   ├── qf-doctor.md
│   ├── qf-update.md
│   ├── qf-state.md
│   └── qf-hook.md
├── hooks/
│   ├── hooks.json           # Registers the Stop hook
│   ├── stop-hook.mjs        # Node script: reads transcript, suggests /qf-cover
│   └── stop-hook.test.mjs   # Tests (node --test)
└── scripts/
    └── check-slugs.sh       # Verify framework-slugs.md matches Go source
```

## How to update skills or commands

1. Edit the relevant `SKILL.md` or `commands/*.md` file.
2. Bump the version in `.claude-plugin/plugin.json`.
3. Commit and push. Users who run `/plugin update qualflare` will get the new version.

## Keeping framework slugs in sync

`skills/qf-init/references/framework-slugs.md` mirrors the Go constants in:
```
qualflare-cli/internal/core/domain/models.go
```

**Run before every release:**
```bash
bash scripts/check-slugs.sh
```

This script exits 1 if any slug in the Go source is not reflected in the markdown reference.

**On every version bump:** update `- Plugin version:` in `skills/qf-init/SKILL.md` (the test-state.md template) to match the new version in `.claude-plugin/plugin.json`.

## Testing the hook locally

```bash
node --test hooks/stop-hook.test.mjs
```

All 22 tests must pass.

## How to test the plugin locally

From a scratch project directory:
```
/plugin marketplace add /absolute/path/to/qualflare-ai
/plugin install qualflare@qualflare
/qf-init
```

## Marker-block convention

Skills that write to user files use this marker format:
```
<!-- BEGIN qualflare-ai -->
...qualflare-managed content...
<!-- END qualflare-ai -->
```

Never modify content outside these markers. The `qf-init` skill enforces this for `CLAUDE.md` updates.
