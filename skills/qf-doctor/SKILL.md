---
name: qf-doctor
description: >
  Diagnose the Qualflare setup for this project. Checks CLI installation,
  authentication, config validity, test-state.md freshness, live file-count
  drift, and framework tooling availability. Use when the user runs /qf-doctor,
  asks "is Qualflare set up correctly?", or encounters unexpected behavior from
  other qf commands.
allowed-tools: Read Glob Bash(qf:*) Bash(go:*) Bash(npx:*) Bash(python:*) Bash(php:*) Bash(bundle:*) Bash(mvn:*) Bash(gradle:*)
---

Run all checks in order. Collect results as `{ label, status, detail, fix? }` where `status` is one of `ok`, `warn`, or `error`. Print the full report at the end (Step 7) — do not print intermediate results as you go.

---

## Step 1 — Check qf CLI

Run:
```bash
qf version --short
```

- **Exit 0:** status `ok` — label "CLI". Strip the leading `qf ` prefix from the output to extract the bare version number (e.g., output `qf 1.2.3` → version `1.2.3`). Detail: `qf <version>`.
- **Exit 127 or command not found:** status `error` — label "CLI", detail "qf CLI not found", fix `Install from https://qualflare.com/docs/cli`.
- **Any other non-zero:** status `warn` — label "CLI", detail the stderr/stdout output (first line).

Record whether the CLI is available (`cliAvailable = exit code 0`) and the parsed version string. Use this flag to skip Step 2 if false.

---

## Step 2 — Check authentication

> **Skip if `cliAvailable === false`.**

This step depends on the per-package identifiers in `## Packages` of `test-state.md`.

- If `test-state.md` is missing, defer the auth check entirely — Step 4 will surface the missing state file as an error.
- If `test-state.md` exists but the `## Packages` table is absent or has no rows, emit a single result entry: status `error` — label "Auth", detail "no `## Packages` table in test-state.md", fix `/qf-init`. Then skip the per-identifier loop below.
- Otherwise, parse `## Packages` to get the list of `Identifier` values and continue.

Run:
```bash
qf projects
```

Two output shapes to handle:
- The CLI's hint `No projects configured. Run 'qf login <identifier> <token>' to get started.` → treat as zero configured.
- One identifier per line → parse into a set.

Cross-reference each `Identifier` from `## Packages` against the configured set. Emit one result entry per package:

- **Identifier present in `qf projects`:** status `ok` — label `Auth (${identifier})`, detail `configured`.
- **Identifier absent:** status `warn` — label `Auth (${identifier})`, detail `not configured`, fix `qf login ${identifier}` — run it in your own terminal; it asks for the token at a hidden prompt (get your token from https://qualflare.com/settings/api-keys). Never solicit the token in the chat.

For single-package projects, omit the `(${identifier})` suffix from the label and use just `Auth`.

Tokens live in `~/.config/qualflare/config.toml` (or platform equivalent) after `qf login` — there is no environment-variable fallback.

**If `QF_API_KEY` is set in the environment:**

Add an extra `warn` entry: label "Legacy env var", detail "`QF_API_KEY` is set but the CLI ignores it — remove it to avoid confusion. Use `qf login <identifier>` in your terminal instead."

---

## Step 2b — Live framework slug drift check

> **Skip if `cliAvailable === false`.**

Run:
```bash
qf list-formats
```

Parse the output to collect the set of slugs the installed CLI reports. Each framework line has the format `  - <slug>` (two spaces, a dash, a space, then the slug). Extract just the slug by stripping the leading `  - ` prefix. Lines that do not start with `  - ` (category headers, blank lines) are skipped. Compare the resulting set against the slugs listed in `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`.

- **CLI slug missing from docs:** status `warn` — label "Slug drift", detail "CLI supports `<slug>` but it is not in framework-slugs.md — plugin may not detect this framework", fix "update plugin".
- **Doc slug missing from CLI:** status `warn` — label "Slug drift", detail "`<slug>` in framework-slugs.md but not in CLI — may be a renamed or removed framework".
- **No drift:** status `ok` — label "Slug sync", detail "all <N> slugs match".

---

## Step 3 — Check config.json

Attempt to read `${CLAUDE_PROJECT_DIR}/.qualflare/config.json`.

- **File missing:** status `error` — label "Config", detail "`.qualflare/config.json` not found", fix `/qf-init`.
- **File exists but invalid JSON:** status `error` — label "Config", detail "config.json is not valid JSON", fix `/qf-init`.
- **Valid JSON, `stopHookEnabled` missing:** status `warn` — label "Config", detail "`stopHookEnabled` field missing", fix `/qf-init`.
- **Valid JSON, `stopHookEnabled === false`:** status `ok` — label "Config", detail "stop hook disabled (toggle: `/qf-hook on`)".
- **Valid JSON, `stopHookEnabled === true`:** status `ok` — label "Config", detail "stop hook enabled".

Record `configOk = (status !== 'error')`.

**Hook registration check (separate result entry):**

Attempt to read `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json`.

- **File readable AND contains a `Stop` key with at least one hook entry:** status `ok` — label "Hook registration", detail "stop hook registered in hooks.json".
- **File readable but `Stop` key is missing or empty:** status `warn` — label "Hook registration", detail "stop hook not found in hooks.json — the nudge may not fire", fix "reinstall the plugin or check your Claude Code hooks configuration".
- **File not readable:** status `warn` — label "Hook registration", detail "hooks.json not readable — cannot verify hook registration".

---

## Step 4 — Check test-state.md

Attempt to read `${CLAUDE_PROJECT_DIR}/.qualflare/test-state.md`.

- **File missing:** status `error` — label "State file", detail "`.qualflare/test-state.md` not found", fix `/qf-init`. Set `stateOk = false`. Skip Steps 5 and 6 (they depend on the state file).
- **File exists:** Set `stateOk = true`. Parse the following fields:
  - `Generated at:` timestamp (ISO 8601). Calculate `ageDays = floor((now − timestamp) / 86400000)`.
  - `Plugin version:` value.

**Age check:**
- `ageDays < 7`: status `ok` — detail `${ageDays} day(s) old`.
- `7 ≤ ageDays ≤ 30`: status `ok` — detail `${ageDays} day(s) old`.
- `30 < ageDays ≤ 60`: status `warn` — detail `${ageDays} day(s) old — getting stale`, fix `/qf-update` or `/qf-init`.
- `ageDays > 60`: status `error` — detail `${ageDays} day(s) old — stale`, fix `/qf-init`.

Label for the age check: "State file age".

**Plugin version check (separate result entry):**

Read the current plugin version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. Compare with the version recorded in `test-state.md`:
- Versions match: status `ok` — label "Plugin version", detail `v${version}`.
- Versions differ: status `warn` — label "Plugin version", detail `state has v${stateVersion}, current is v${currentVersion}`, fix `/qf-init`.
- `plugin.json` cannot be read: status `warn` — label "Plugin version", detail "could not read plugin version from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` — plugin root may be misconfigured".

---

## Step 5 — Check live file counts (drift detection)

> **Skip if `stateOk === false`.**

Parse the `## Packages` table and `## Frameworks in use` table from `test-state.md`. Build the same per-package work queue as `/qf-run` Step 1.

Skip any slug whose glob cell is `*(skip counting)*` (no test-file glob). For each other (package, slug) row, use the Glob tool to re-count live test files using the patterns from `${CLAUDE_PLUGIN_ROOT}/skills/qf-init/references/framework-slugs.md`. Scope each Glob to the package's `Top-level paths` column. Exclude results under `node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `.git/`, `__pycache__/`.

Compare `liveCount` against `storedCount` (from the `File count` column):

- **`storedCount === 0` AND `liveCount === 0`:** status `ok` — no files, consistent.
- **`storedCount > 0` AND `liveCount === 0`:** status `error` — label `${slug} (${package})`, detail `0 live files, ${storedCount} stored — test files may have moved or been deleted`, fix `/qf-init`.
- **Drift within ±10% OR within ±5 files (either condition holds):** status `ok` — label `${slug} (${package})`, detail `${liveCount} live (stored: ${storedCount})`.
- **Drift > 10% AND > 5 files (both must exceed threshold):** status `warn` — label `${slug} (${package})`, detail `${liveCount} live vs ${storedCount} stored (${delta > 0 ? '+' : ''}${delta} files)`, fix `/qf-update`.

For single-package projects, omit the package name from the label: label `${slug}`.

---

## Step 6 — Check framework tooling availability

> **Skip if `stateOk === false`.**

For each unique slug in `## Frameworks in use`, run the version command from the table below. Run from `${CLAUDE_PROJECT_DIR}` (or the package `cwd` for monorepos). If a slug appears in multiple packages, check once per unique `cwd`.

| Slug | Version command |
|------|----------------|
| jest | Read `package.json` in the package `cwd`. If `devDependencies` or `dependencies` contains `"vitest"`, run `npx vitest --version`; otherwise run `npx jest --version`. |
| mocha | `npx mocha --version` |
| playwright | `npx playwright --version` |
| cypress | `npx cypress --version` |
| golang | `go version` |
| python | `python -m pytest --version` |
| rspec | `bundle exec rspec --version` |
| phpunit | `php ./vendor/bin/phpunit --version` |
| junit | check `mvn --version` OR `gradle --version` depending on whether `pom.xml` or `build.gradle` is present |
| cucumber | `npx cucumber-js --version` |

Skip tooling checks for slugs with no standard local runner (`ctrf`, `qualflare-json`, `detox`, `selenium`, `testcafe`, `karate`, `testng`, `maestro`, `xctest`, `espresso`, `newman`, `k6`, `zap`, `trivy`, `snyk`, `sonarqube`) — these require platform-specific toolchains or CI/cloud setups and are not expected to be present in every dev environment.

For each checked tool:
- **Exit 0:** status `ok` — label `${slug} tooling`, detail the first line of stdout (version string).
- **Exit non-zero or not found:** status `warn` — label `${slug} tooling`, detail "not found", fix the appropriate install command (e.g., `npm install` for JS frameworks, `go install` for Go, `pip install pytest` for Python).

---

## Step 7 — Print health report

Collect all result entries. Print in this format:

```
Qualflare Doctor  ·  <project-name>

Setup
  CLI                ✅  qf 1.2.3
  Auth (acme-web)    ✅  configured
  Auth (acme-api)    ⚠️  not configured
  Slug sync          ✅  all 27 slugs match
  Config             ✅  stop hook enabled
  State file age     ⚠️  34 day(s) old — getting stale
  Plugin version     ⚠️  state has v0.4.0, current is v0.7.0

File counts
  jest               ✅  47 live  (stored: 42)
  playwright         ✅  18 live  (stored: 18)
  golang             ⚠️  67 live vs 42 stored (+25 files)

Framework tooling
  jest tooling       ✅  29.7.0
  playwright tooling ✅  1.40.0
  golang tooling     ✅  go1.21.5 linux/amd64

Overall: 2 warning(s), 0 error(s)

Suggested fixes:
  /qf-update         — refresh file counts in test-state.md
  /qf-init           — re-run setup (updates plugin version in state)
```

**Formatting rules:**
- Group results under "Setup", "File counts", "Framework tooling" headings. Omit a heading entirely if it has no entries.
- Align the label column to the longest label in each group (use spaces).
- Show `✅` for `ok`, `⚠️` for `warn`, `❌` for `error`.
- "Overall" line: count errors and warnings separately. Use:
  - `All checks passed ✅` when zero errors and zero warnings.
  - `N warning(s), 0 error(s)` for warnings only.
  - `0 warning(s), N error(s) — Qualflare needs attention before running /qf-run` for errors.
  - `N warning(s), N error(s) — Qualflare needs attention` for both.
- "Suggested fixes": list only the unique fix commands from all non-ok results. Deduplicate. Omit if overall is all-ok.
- For single-package projects, omit the `(package)` suffix from file-count labels.

---

## Step 8 — Suggest next step

After printing the report:

- If overall is all-ok: tell the user "Everything looks good. Run `/qf-run` to execute your tests."
- If any `error` entries exist: tell the user "Fix the errors above before running other qf commands."
- If only `warn` entries: tell the user "Warnings won't block usage but may cause stale results."
