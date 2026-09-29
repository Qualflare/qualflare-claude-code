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
│   └── qf-hook.md           # The only command: every other /qf-* is a skill (see below)
├── hooks/
│   ├── hooks.json           # Registers the Stop hook
│   ├── stop-hook.mjs        # Node script: reads transcript, suggests /qf-cover
│   └── stop-hook.test.mjs   # Tests (node --test)
├── scripts/
│   ├── check-slugs.sh            # Verify framework-slugs.md matches the CLI's Go source
│   ├── slugs.mjs                 # Slug parity logic (Go source or `qf list-formats` output)
│   ├── validate-manifests.mjs    # plugin.json / marketplace.json checks (name, version sync, semver)
│   ├── check-skills.mjs          # Static checks on skill/command markdown
│   ├── check-report-fixtures.sh  # qf validate every report fixture (needs qf)
│   ├── release.sh
│   └── *.test.mjs                # node --test
└── tests/fixtures/reports/       # Real output of each /qf-run runner command
```

## How to update skills or commands

1. Edit the relevant `SKILL.md` (or `commands/qf-hook.md`).
2. Run `node scripts/check-skills.mjs` and `npm test`.
3. Release with `bash scripts/release.sh <version>` — it bumps `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` together.
4. Push. Users who run `/plugin update qualflare` get the new version.

### Skills, not commands

Every `/qf-*` entry point except `/qf-hook` is a skill in `skills/<name>/SKILL.md`; put its `argument-hint` in the SKILL.md frontmatter. **Never add a `commands/<name>.md` with the same name as a skill**: the command body loads in place of the skill, so a one-line "use the X skill" wrapper hides every instruction in the SKILL.md (this shipped in every release up to 0.18.0). `check-skills.mjs` fails on the collision. The plugin docs say to prefer `skills/` for new plugins.

### Rules `check-skills.mjs` enforces

- **Project paths:** write `${CLAUDE_PROJECT_DIR}` (braced). Claude Code substitutes the braced form in skill text; the bare `$CLAUDE_PROJECT_DIR` is left as-is, and the Bash tool has no such variable, so commands would target `/.qualflare/...`. Quote substituted paths in shell commands.
- **Tokens:** never ask the user to paste a token into the chat, and never put one on `qf login`'s argv. Tell the user to run `qf login <identifier>` in their own terminal (hidden prompt).
- **Report formats:** each `/qf-run` runner must write the format its CLI parser reads (`PARSER_FORMAT` in the script, taken from `qualflare-cli/internal/adapters/parsers`), and must have a real fixture under `tests/fixtures/reports/`. CI runs `scripts/check-report-fixtures.sh`, which feeds each fixture to `qf validate --format <slug>`.
- **Uploads:** no hardcoded `--environment` (the server 404s names the project lacks); classify `qf` failures by exit code (3 auth, 4 forbidden, 5 not found, 7 transient), never by stderr keywords; use the login-free `qf validate`, not `qf <identifier> validate`.
- **Argument modes:** a `/qf-x <placeholder>` in any skill must be declared in `qf-x`'s `argument-hint`.

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
node scripts/check-skills.mjs
claude plugin validate .
```

All tests must pass. `validate-manifests.mjs` fails when `plugin.json` and the
`marketplace.json` entry disagree on name or version, so bump both (`scripts/release.sh`
does). `check-skills.mjs` fails on the skill-markdown defect classes it lists.

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
