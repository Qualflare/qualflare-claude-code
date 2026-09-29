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
│   │       └── framework-slugs.md   # 27 canonical slugs — keep in sync with Go source
│   ├── qf-cover/  # Generate tests for changed source files
│   ├── qf-run/  # Run tests + qf <identifier> collect
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
    ├── check-slugs.sh            # Verify framework-slugs.md matches the CLI's Go source
    ├── slugs.mjs                 # Slug parity logic (Go source or `qf list-formats` output)
    ├── validate-manifests.mjs    # plugin.json / marketplace.json checks (name, version sync, semver)
    ├── release.sh
    └── *.test.mjs                # node --test
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

It reads the CLI checkout named by `QF_CLI_DIR`, or the Astrais monorepo sibling
`qualflare-cli/`, and exits 1 if the first column of the Slug Reference Table (or the
globs table) differs from the CLI's `AllFrameworks()` in either direction. CI also
builds the CLI and compares against the real `qf list-formats` output
(`node scripts/slugs.mjs --list-formats <file>`), and runs weekly so new CLI slugs
turn it red without a plugin change.

**On every version bump:** the plugin version in `test-state.md` is written dynamically at `/qf-init` time by reading `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` — no manual update required.

## Testing the hook locally

```bash
node --test hooks/*.test.mjs scripts/*.test.mjs   # or: npm test
node scripts/validate-manifests.mjs
claude plugin validate .
```

All tests must pass. `validate-manifests.mjs` fails when `plugin.json` and the
`marketplace.json` entry disagree on name or version, so bump both (`scripts/release.sh`
does).

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
