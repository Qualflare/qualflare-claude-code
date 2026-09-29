---
name: qf-init
description: >
  First-time Qualflare setup for this project. Detects languages and test
  frameworks, writes .qualflare/test-state.md, and configures the optional
  Stop hook. Use when the user runs /qf-init or asks to "set up
  Qualflare" or "initialize Qualflare".
allowed-tools: Read Write Edit Glob Bash(git:*) Bash(mkdir:*) Bash(node:*) Bash(qf:*)
---

You are executing the `qf-init` skill. Follow every step below in order. Do not skip steps or reorder them.

---

## Step 1 — Verify project root

Check whether the current working directory (`$CLAUDE_PROJECT_DIR`) contains at least one of the following:

- `.git/`
- `package.json`
- `go.mod`
- `pyproject.toml`
- `Cargo.toml`
- `Gemfile`
- `composer.json`
- `pom.xml`
- `build.gradle`

Use the Read tool to check for these files. If **none** of them is present, stop and tell the user:

> "I couldn't find a recognizable project root in the current directory. Please `cd` to your project root and run `/qf-init` again."

Do not proceed past this step if no root indicator is found.

---

## Step 2 — Detect workspaces

Check whether the project is a monorepo by looking for any of these signals at `$CLAUDE_PROJECT_DIR`:

1. **npm/pnpm workspaces**: Read `package.json`. If it contains a top-level `workspaces` key (either an array or an object with a `packages` array), the project is a monorepo.
2. **pnpm workspace file**: Check whether `pnpm-workspace.yaml` exists.
3. **Multiple Go modules**: Use Glob with pattern `**/go.mod`. If more than one file is found and at least two are in subdirectories matching `apps/`, `services/`, `packages/`, `cmd/`, or `libs/`, the project is a monorepo.
4. **Multiple Python packages**: Use Glob with pattern `**/pyproject.toml`. If more than one file is found under `apps/`, `services/`, `packages/`, or `libs/`, the project is a monorepo.

**If NO signal matches — single-package project:**

Create a synthetic package list with one entry:
- Path: `(root)`
- Name: inferred from the root manifest — value of `package.json` `"name"` field, last segment of `go.mod` module path (e.g., `module github.com/acme/api` → `api`), `pyproject.toml` `[project].name`, or the project directory name as a fallback.

Proceed to Step 3 with this single-entry list.

**If ANY signal matches — monorepo:**

Enumerate packages. The source depends on the signal:
- **npm/pnpm workspaces**: resolve the workspace glob patterns (e.g., `packages/*`) from `package.json` `workspaces` or `pnpm-workspace.yaml` `packages:` to get the actual subdirectory list. Use Glob to expand each pattern.
- **Multiple go.mod**: each directory containing a `go.mod` (other than the root, if there is a root one) is a package.
- **Multiple pyproject.toml**: each directory containing a `pyproject.toml` (other than the root) is a package.

For each package directory found, build a package entry:
- **Path**: directory path relative to `$CLAUDE_PROJECT_DIR` (e.g., `packages/web`).
- **Name**: read the manifest in that directory — `package.json` `"name"`, last segment of `go.mod` module path, `pyproject.toml` `[project].name`. If no manifest or no name field, fall back to the directory path itself.

**Edge case:** If workspace declarations exist but no matching directories are found on disk, treat the project as single-package and emit a note: "Workspace configuration found but no matching package directories exist — treating as single-package."

---

## Step 3 — Detect stack via subagent

Tell the user: `"Detecting your project's tech stack..."`

For monorepos with more than one package: `"Detecting tech stack for <N> packages..."`

Dispatch **one Explore subagent per package**. Each subagent is scoped to its package directory. Compute `<PACKAGE_DIR>` per package:
- If the package path is `(root)`: `<PACKAGE_DIR>` = `$CLAUDE_PROJECT_DIR`
- Otherwise: `<PACKAGE_DIR>` = `$CLAUDE_PROJECT_DIR/<package-path>`

Use this brief verbatim for each subagent — substitute `<PACKAGE_DIR>` and `${CLAUDE_PLUGIN_ROOT}` with actual paths:

> "You are a project stack detector. Read the manifest and config files in the package at: `<PACKAGE_DIR>`. Only report frameworks for files under this package directory — do not scan the whole repository.
>
> Your goal: identify all programming languages, test frameworks in use, and test file locations.
>
> **What to read:** `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `Gemfile`, `composer.json`, `pom.xml`, `build.gradle`, `.nvmrc`, `.python-version`, and any framework config files (`jest.config.*`, `playwright.config.*`, `cypress.config.*`, `.rspec`, `phpunit.xml`, `sonar-project.properties`).
>
> **Framework slugs:** You MUST map every framework you detect to exactly one of the canonical slugs listed in the file at: `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`. Read that file first. Use ONLY slugs from that list.
>
> **Glob test files:** For each detected framework, use the `Glob` tool with the glob patterns from the reference file to estimate the test file count. Report: slug, estimated test count, top-level test directories (paths relative to `$CLAUDE_PROJECT_DIR`, not `<PACKAGE_DIR>`).
>
> **Suggestions:** If you see strong indicators for a framework the project doesn't currently use (e.g., React SPA with no E2E framework), note it as a suggestion.
>
> **Return a structured report with these sections:**
> 1. Languages detected (list)
> 2. Frameworks in use: table of slug | file count | top-level paths (relative to project root)
> 3. Frameworks suggested (not yet installed): list of slug + reason
> 4. Naming conventions observed (e.g., `*.test.ts`, `*_test.go`)
> 5. Coverage threshold (from `jest.config.*`, `pyproject.toml`, etc. — or 'none detected')"

Wait for all subagents to complete. Collect each package's structured report.

---

## Step 4 — Confirm with user

Present the detection results in a readable format. For monorepos, group results by package:

```
packages/web  (@acme/web)
  jest (TypeScript) — 42 test files    src/**/*.test.ts
  playwright (TypeScript) — 18 test files    e2e/**/*.spec.ts

packages/api  (acme-api)
  golang (Go) — 15 test files    **/*_test.go
```

For single-package projects, use the flat format without package headers.

Then ask:

> "Does this look right? You can correct any framework names, add missing ones, or remove incorrect ones."

Accept any corrections the user provides. Update your in-memory list of detected frameworks and notes accordingly.

After the user confirms the framework list, ask one more question:

> "Any notes about test conventions in this project? (Or press Enter to skip)"

Accept free-text input. If the user presses Enter or provides nothing, record this as "None".

---

## Step 5 — Write `.qualflare/test-state.md`

If `.qualflare/test-state.md` already exists, tell the user:

> "`.qualflare/test-state.md` already exists. I'll overwrite it with the updated information."

Create the `.qualflare/` directory if it does not exist:

```bash
mkdir -p $CLAUDE_PROJECT_DIR/.qualflare
```

Write (or overwrite) `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md` using the template below. Fill in all `<placeholder>` values from Steps 3 and 4:

- `<project-name>`: for single-package, infer from root manifest; for monorepos, use the directory name or a descriptive label.
- `<languages>`: comma-separated list of all detected languages across all packages (e.g., `TypeScript, Go`).
- `<ISO 8601 timestamp>`: current date and time in ISO 8601 format (e.g., `2026-04-20T14:32:00Z`).
- `<plugin-version>`: read the `version` field from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` (e.g., `0.16.0`).
- `## Packages` table: one row per package with `Path` and a derived `Identifier` (see derivation rule below). For single-package: one row with path `(root)`.
- `## Frameworks in use` table: one row per (package, framework) pair including the `Package` column. For single-package: use `(root)` in the Package column.
- `<suggestions>`: bullet list of suggested frameworks with reasons, or `None` if empty.
- `<naming-pattern>`: the observed naming convention (e.g., `*.test.ts`, `*_test.go`).
- `<coverage-threshold>`: the detected coverage threshold, or `none detected`.
- `<user-notes>`: the user's free-text notes from Step 3, or `None`.

**Identifier derivation:** For each package, derive an `Identifier` from its name by:
1. Lowercasing the name.
2. Replacing every character outside `[a-z0-9_-]` with `-` (this covers `@`, `/`, `.`, whitespace, etc.).
3. Collapsing runs of `-` into a single `-`.
4. Trimming leading and trailing `-`.
5. If the result is empty or starts with anything other than `[a-z0-9]` (e.g., would otherwise begin with `_`), prepend the literal string `pkg-`.
6. If the result matches a CLI-reserved name — `login`, `logout`, `projects`, `version`, `list-formats`, `formats`, `lf`, `help`, `completion`, `__complete` — prepend the literal string `pkg-`. (E.g., a package called `help` becomes `pkg-help`.)
7. Truncating to 63 characters.

The identifier must match `^[a-z0-9][a-z0-9_-]{0,62}$` and is used as the local CLI alias passed to `qf <identifier> collect …`. Examples: `@acme/web` → `acme-web`, `Acme.Api` → `acme-api`, `my pkg` → `my-pkg`, `help` → `pkg-help`.

```markdown
<!-- qualflare-test-state v:1 -->
# Qualflare Test State

> Source of truth for AI coding agents working on this project's tests.
> Regenerate with `/qf-init`.

## Project
- Name: <project-name>
- Languages: <languages>
- Generated at: <ISO 8601 timestamp>
- Plugin version: <plugin-version>

## Packages
| Path | Identifier |
|------|------------|
<one row per package>

## Frameworks in use
| Package | Slug | Language | File count | Top-level paths |
|---------|------|----------|------------|-----------------|
<one row per (package, framework) pair>

## Frameworks suggested (not yet installed)
<bullet list, or "None" if empty>

## Conventions
- Test naming: <naming-pattern>
- Coverage threshold: <coverage-threshold>

## Notes
<user-notes>
```

**Single-package example:**
```markdown
## Packages
| Path | Identifier |
|------|------------|
| (root) | my-app |

## Frameworks in use
| Package | Slug | Language | File count | Top-level paths |
|---------|------|----------|------------|-----------------|
| (root) | jest | TypeScript | 42 | src/**/*.test.ts |
```

**Monorepo example:**
```markdown
## Packages
| Path | Identifier |
|------|------------|
| packages/web | acme-web |
| packages/api | acme-api |

## Frameworks in use
| Package | Slug | Language | File count | Top-level paths |
|---------|------|----------|------------|-----------------|
| packages/web | jest | TypeScript | 42 | packages/web/src/**/*.test.ts |
| packages/api | golang | Go | 15 | packages/api/**/*_test.go |
```

---

## Step 6 — Set up authentication

Run:
```bash
qf version
```

If the CLI is unavailable (exit 127 or command not found), tell the user:
> "`qf` CLI not found. Install it first from https://qualflare.com/docs/cli, then re-run `/qf-init`."
Stop here.

If the `## Packages` table has no `Identifier` values (the user skipped that input), tell the user:
> "No project identifiers configured in test-state.md. Edit `.qualflare/test-state.md` to fill in the `Identifier` column, then run `/qf-init` again or run `qf login <identifier> <token>` for each one manually."

Stop here — skip the rest of Step 6.

Run:
```bash
qf projects
```

Capture the set of identifiers that are already saved. Two output shapes to handle:
- The literal hint `No projects configured. Run 'qf login <identifier> <token>' to get started.` → treat as zero configured.
- One identifier per line → parse into a set.

Build `missing` = the list of `Identifier` values from `## Packages` that are **not** present in the saved set.

If `missing` is empty: print `✅  All project identifiers are already authenticated.` and proceed to Step 7.

Otherwise, for **each identifier in `missing`**, in order:

1. Print exactly:
   ```
   🔑 Need a token for `<identifier>`.
      Create one at: https://app.qualflare.com/project/<identifier>/settings/access-tokens
      Paste the token below (or type `skip` to authenticate this identifier later):
   ```
2. **Stop and wait for the user's next message.** Treat the message as the raw token string (trimmed of whitespace).
3. If the message is the literal word `skip` (case-insensitive) or is empty:
   - Print: `⏭  Skipped <identifier> — run \`qf login <identifier> <token>\` later.`
   - Continue to the next missing identifier.
4. Run:
   ```bash
   qf login <identifier> <pasted-token>
   ```
5. **On exit 0:** print `✅  Saved credentials for <identifier>.`
6. **On non-zero exit:** print the first line of stderr, then re-prompt once:
   ```
   Token rejected. Paste a fresh token for `<identifier>` (or `skip`):
   ```
   Repeat steps 2-5 for this identifier. If it fails a second time, print:
   > `⚠️  Could not save credentials for <identifier> after 2 attempts. Run \`qf login <identifier> <token>\` manually before running \`/qf-run\`.`
   Then continue to the next missing identifier.

After processing all missing identifiers, re-run `qf projects` and confirm that every non-skipped identifier from `## Packages` now appears in the output. If any expected identifier is still missing, print:
> `⚠️  Identifier \`<id>\` still not saved — run \`qf login <id> <token>\` before using \`/qf-run\`.`

---

## Step 7 — Ask about Stop hook (was Step 6)

Ask the user:

> "Enable the post-session test suggestion hook? After each Claude Code session where source files changed without matching test edits, it prints a one-line suggestion to run /qf-cover. This is a passive nudge only — it never writes code automatically.
>
> You can toggle it later with `/qf-hook on` or `/qf-hook off`."

Accept `yes`, `no`, `y`, or `n` (case-insensitive). Treat any variant of "yes"/"y" as `true` and any variant of "no"/"n" as `false`.

Create `.qualflare/` if not already done. Write `$CLAUDE_PROJECT_DIR/.qualflare/config.json` with the following content, substituting `<true or false>` with the boolean result:

```json
{
  "version": 1,
  "stopHookEnabled": <true or false>
}
```

---

## Step 8 — Update CLAUDE.md

Read `$CLAUDE_PROJECT_DIR/CLAUDE.md` if it exists.

Determine which case applies:

**Case A — CLAUDE.md does not exist:** Create it with only the marker block (see content below).

**Case B — CLAUDE.md exists and already contains `<!-- BEGIN qualflare-ai -->`:** Replace only the content between `<!-- BEGIN qualflare-ai -->` and `<!-- END qualflare-ai -->`. Do not modify any content outside those markers.

**Case C — CLAUDE.md exists but does not contain `<!-- BEGIN qualflare-ai -->`:** Append the full marker block (markers + content) at the very end of the file. Do not modify any existing content.

The marker block to write — substitute `<slugs>` with a comma-separated list of all confirmed framework slugs from Step 4, and include the `<packages-line>` only when applicable (see rule below):

```
<!-- BEGIN qualflare-ai -->
## Qualflare Test Integration

This project uses [Qualflare](https://qualflare.com) for test management.

### Session startup
At the start of every session, read `.qualflare/test-state.md` silently before responding. This gives you the current framework list, package layout, naming conventions, and test context — so `/qf-cover`, `/qf-run`, and `/qf-fix` are context-aware from the first message.

### Quick reference
- Test state: `.qualflare/test-state.md` — auto-read at session start (see above)
- Upload results: `qf <identifier> collect <results-file>` (identifier from `## Packages`)
- Frameworks: <slugs>
<packages-line>
- Skill: `qf-cover` — use when asked to write or improve tests
- Command: `/qf-cover` — generate tests for changed code
- Command: `/qf-run` — run tests and upload results to Qualflare
- Command: `/qf-fix` — fix failing tests from the last run
- Command: `/qf-doctor` — health check: CLI, auth, config, file-count drift
- Command: `/qf-update` — refresh file counts in test-state.md
- Command: `/qf-state` — inspect current Qualflare state
- Command: `/qf-init` — re-run setup (re-detect frameworks, reset state)
<!-- END qualflare-ai -->
```

**`<packages-line>` rule:**
- If the project has **more than one package**: emit exactly `- Packages: <N> (see .qualflare/test-state.md ## Packages for the list)` where `<N>` is the package count.
- If the project is **single-package**: omit this line entirely (do not emit a blank line in its place).

**Critical rules:**
- Never remove or alter content outside the markers.
- Never duplicate the marker block.
- The markers themselves must appear on their own lines exactly as shown above.

---

## Step 9 — Outro

Run `qf projects` to list the locally configured CLI identifiers. Two cases to handle:

- **Output is the literal hint** `No projects configured. Run 'qf login <identifier> <token>' to get started.` → treat as zero configured.
- **Output is one identifier per line** → parse into a set.

Cross-reference the identifiers in the `## Packages` table against this set. Build a list of `Identifier` values that are missing locally.

Print the following summary. Include the `⚠️  Authenticate` block **only** when one or more identifiers are still not configured after Step 6 (i.e., were skipped, failed twice, or the CLI wasn't found):

```
✅ Qualflare initialized!

Created:
  .qualflare/test-state.md     — project test context
  .qualflare/config.json       — hook setting
  CLAUDE.md                    — updated with Qualflare section

Next steps:
  /qf-cover   — generate tests for changed code
  /qf-run     — run tests and upload to Qualflare
  /qf-update  — refresh file counts after adding tests
  ⚠️  Still need to authenticate before running /qf-run:
      qf login <identifier-1> <token>
      qf login <identifier-2> <token>
      Get tokens at https://app.qualflare.com/project/<identifier>/settings/access-tokens
```

Emit one `qf login <identifier> <token>` line per identifier that is still missing from `qf projects`. Omit the entire `⚠️  Authenticate` block if every identifier in `## Packages` is configured.

If `qf` itself is not on PATH (the command exits 127 / not found), still print the summary and append:

```
  ⚠️  qf CLI not found on PATH. Install it from https://qualflare.com/docs/cli, then run `qf login <identifier> <token>` for each package above.
```

---

## Edge cases

- **`.qualflare/test-state.md` already exists:** Overwrite it after informing the user (as described in Step 5). Do not ask for confirmation beyond the note — the user already triggered re-init by running `/qf-init`.
- **CLAUDE.md markers already exist:** Update the content between the markers in-place. Do not append a second block. Do not touch content outside the markers. (Case B above.)
- **User provides no notes in Step 4:** Record `None` in the `## Notes` section.
- **Subagent detects vitest:** Use the `jest` slug (the CLI reads `vitest` with the same parser, and /qf-run's `jest` row runs Vitest). Write exactly `jest` in the Slug column — never `jest (vitest)`, which breaks slug lookups; mention Vitest under `## Notes` instead.
- **Subagent detects cargo-test (Rust):** Do not assign a slug. Include a warning note in `.qualflare/test-state.md` under `## Notes` that cargo-test is detected but not yet uploadable to Qualflare.
- **No test frameworks detected at all:** Do not abort. Write the state file with an empty framework table and add a note: "No test frameworks detected automatically. Edit this file manually to add framework entries."
- **Workspace declarations found but no package directories on disk:** Treat as single-package. Emit a note in the outro.
- **Package has no detected frameworks:** Include it in `## Packages` table but omit it from `## Frameworks in use`. Note it in the outro with: "No frameworks detected in `<package-path>` — edit `.qualflare/test-state.md` manually to add entries."
- **`package.json` lacks a `name` field:** Fall back to the directory path as the Qualflare project name. Do not prompt the user.
