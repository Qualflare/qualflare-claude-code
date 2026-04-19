---
name: qualflare-init
description: >
  First-time Qualflare setup for this project. Detects languages and test
  frameworks, writes .qualflare/test-state.md, and configures the optional
  Stop hook. Use when the user runs /qualflare-init or asks to "set up
  Qualflare" or "initialize Qualflare".
allowed-tools: Read Write Edit Bash(git:*) Bash(mkdir:*) Bash(node:*)
---

You are executing the `qualflare-init` skill. Follow every step below in order. Do not skip steps or reorder them.

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

> "I couldn't find a recognizable project root in the current directory. Please `cd` to your project root and run `/qualflare-init` again."

Do not proceed past this step if no root indicator is found.

---

## Step 2 — Detect stack via subagent

Tell the user: "Detecting your project's tech stack..."

Then dispatch a fresh **Explore subagent** (a subordinate Claude Code agent with its own tool calls) with the following brief. Include the brief verbatim — substitute `$CLAUDE_PROJECT_DIR` with the actual project directory path and `${CLAUDE_PLUGIN_ROOT}` with the actual path to the plugin's installed directory:

> "You are a project stack detector. Read the manifest and config files in the project at: `$CLAUDE_PROJECT_DIR`.
>
> Your goal: identify all programming languages, test frameworks in use, and test file locations.
>
> **What to read:** `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, `Gemfile`, `composer.json`, `pom.xml`, `build.gradle`, `.nvmrc`, `.python-version`, and any framework config files (`jest.config.*`, `playwright.config.*`, `cypress.config.*`, `.rspec`, `phpunit.xml`, `sonar-project.properties`).
>
> **Framework slugs:** You MUST map every framework you detect to exactly one of the canonical slugs listed in the file at: `${CLAUDE_PLUGIN_ROOT}/skills/qualflare-init/references/framework-slugs.md`. Read that file first. Use ONLY slugs from that list.
>
> **Glob test files:** For each detected framework, use the globs from the reference file to estimate the test file count (use `find` or `ls` with glob). Report: slug, estimated test count, top-level test directories.
>
> **Suggestions:** If you see strong indicators for a framework the project doesn't currently use (e.g., React SPA with no E2E framework), note it as a suggestion.
>
> **Return a structured report with these sections:**
> 1. Languages detected (list)
> 2. Frameworks in use: table of slug | file count | top-level paths
> 3. Frameworks suggested (not yet installed): list of slug + reason
> 4. Naming conventions observed (e.g., `*.test.ts`, `*_test.go`)
> 5. Coverage threshold (from `jest.config.*`, `pyproject.toml`, etc. — or 'none detected')"

Wait for the subagent to complete and collect its structured report.

---

## Step 3 — Confirm with user

Present the detection report from Step 2 to the user in a readable format. Then ask:

> "Does this look right? You can correct any framework names, add missing ones, or remove incorrect ones."

Accept any corrections the user provides. Update your in-memory list of detected frameworks and notes accordingly.

After the user confirms the framework list, ask one more question:

> "Any notes about test conventions in this project? (Or press Enter to skip)"

Accept free-text input. If the user presses Enter or provides nothing, record this as "None".

---

## Step 4 — Write `.qualflare/test-state.md`

If `.qualflare/test-state.md` already exists, tell the user:

> "`.qualflare/test-state.md` already exists. I'll overwrite it with the updated information."

Create the `.qualflare/` directory if it does not exist:

```bash
mkdir -p $CLAUDE_PROJECT_DIR/.qualflare
```

Write (or overwrite) `$CLAUDE_PROJECT_DIR/.qualflare/test-state.md` with the following template. Fill in all `<placeholder>` values using the information gathered in Steps 2 and 3:

- `<project-name>`: infer from `package.json` `"name"` field, `go.mod` module path, or the directory name as a fallback.
- `<languages>`: comma-separated list of detected languages (e.g., `TypeScript, Go`).
- `<ISO 8601 timestamp>`: current date and time in ISO 8601 format (e.g., `2026-04-19T14:32:00Z`).
- Framework table rows: one row per confirmed framework slug, with language, file count, and top-level paths from the subagent report.
- `<suggestions>`: bullet list of suggested frameworks with reasons, or `None` if empty.
- `<naming-pattern>`: the observed naming convention (e.g., `*.test.ts`, `*_test.go`).
- `<coverage-threshold>`: the detected coverage threshold, or `none detected`.
- `<user-notes>`: the user's free-text notes from Step 3, or `None`.

```markdown
<!-- qualflare-test-state v:1 -->
# Qualflare Test State

> Source of truth for AI coding agents working on this project's tests.
> Regenerate with `/qualflare-init`.

## Project
- Name: <project-name>
- Languages: <languages>
- Generated at: <ISO 8601 timestamp>
- Plugin version: 0.1.0

## Frameworks in use
| Slug | Language | File count | Top-level paths |
|------|----------|------------|-----------------|
<one row per detected framework>

## Frameworks suggested (not yet installed)
<bullet list, or "None" if empty>

## Conventions
- Test naming: <naming-pattern>
- Coverage threshold: <coverage-threshold>

## Notes
<user-notes>

## Qualflare backend
- Workspace: <unset — run `qf login` to connect>
- Project: <unset>
```

---

## Step 5 — Ask about Stop hook

Ask the user:

> "Enable the post-session test suggestion hook? After each Claude Code session where source files changed without matching test edits, it prints a one-line suggestion to run /qualflare-cover. This is a passive nudge only — it never writes code automatically.
>
> You can toggle it later with `/qualflare-hook on` or `/qualflare-hook off`."

Accept `yes`, `no`, `y`, or `n` (case-insensitive). Treat any variant of "yes"/"y" as `true` and any variant of "no"/"n" as `false`.

Create `.qualflare/` if not already done. Write `$CLAUDE_PROJECT_DIR/.qualflare/config.json` with the following content, substituting `<true or false>` with the boolean result:

```json
{
  "version": 1,
  "stopHookEnabled": <true or false>
}
```

---

## Step 6 — Update CLAUDE.md

Read `$CLAUDE_PROJECT_DIR/CLAUDE.md` if it exists.

Determine which case applies:

**Case A — CLAUDE.md does not exist:** Create it with only the marker block (see content below).

**Case B — CLAUDE.md exists and already contains `<!-- BEGIN qualflare-ai -->`:** Replace only the content between `<!-- BEGIN qualflare-ai -->` and `<!-- END qualflare-ai -->`. Do not modify any content outside those markers.

**Case C — CLAUDE.md exists but does not contain `<!-- BEGIN qualflare-ai -->`:** Append the full marker block (markers + content) at the very end of the file. Do not modify any existing content.

The marker block to write (substitute `<slugs>` with a comma-separated list of confirmed framework slugs from Step 3):

```
<!-- BEGIN qualflare-ai -->
## Qualflare Test Integration

This project uses [Qualflare](https://qualflare.com) for test management.

### Quick reference
- Test state: `.qualflare/test-state.md` — read this at session start
- Upload results: `qf upload <results-file>`
- Frameworks: <slugs>
- Skill: `qualflare-test-gen` — use when asked to write or improve tests
- Command: `/qualflare-cover` — generate tests for changed code
- Command: `/qualflare-run` — run tests and upload results to Qualflare
- Command: `/qualflare-state` — inspect current Qualflare state
<!-- END qualflare-ai -->
```

**Critical rules:**
- Never remove or alter content outside the markers.
- Never duplicate the marker block.
- The markers themselves must appear on their own lines exactly as shown above.

---

## Step 7 — Outro

Print the following summary to the user:

```
✅ Qualflare initialized!

Created:
  .qualflare/test-state.md     — project test context
  .qualflare/config.json       — hook setting
  CLAUDE.md                    — updated with Qualflare section

Next steps:
  /qualflare-cover   — generate tests for changed code
  /qualflare-run     — run tests and upload to Qualflare
  qf login           — connect to your Qualflare workspace (if not done yet)
```

---

## Edge cases

- **`.qualflare/test-state.md` already exists:** Overwrite it after informing the user (as described in Step 4). Do not ask for confirmation beyond the note — the user already triggered re-init by running `/qualflare-init`.
- **CLAUDE.md markers already exist:** Update the content between the markers in-place. Do not append a second block. Do not touch content outside the markers. (Case B above.)
- **User provides no notes in Step 3:** Record `None` in the `## Notes` section.
- **Subagent detects vitest:** Map it to the `jest` slug. Note in the framework table: `jest (vitest)`.
- **Subagent detects cargo-test (Rust):** Do not assign a slug. Include a warning note in `.qualflare/test-state.md` under `## Notes` that cargo-test is detected but not yet uploadable to Qualflare.
- **No test frameworks detected at all:** Do not abort. Write the state file with an empty framework table and add a note: "No test frameworks detected automatically. Edit this file manually to add framework entries."
