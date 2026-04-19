// ---------------------------------------------------------------------------
// Agent template input
// ---------------------------------------------------------------------------

export interface AgentTemplateInput {
  projectName: string
  /** Confirmed framework slug list */
  frameworks: string[]
  wizardVersion: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bulletList(items: string[]): string {
  return items.map((s) => `- ${s}`).join('\n')
}

function commaSeparated(items: string[]): string {
  return items.join(', ')
}

// ---------------------------------------------------------------------------
// Claude Code — SKILL.md
// (.claude/skills/qualflare-write-tests/SKILL.md)
// ---------------------------------------------------------------------------

export function renderClaudeSkill(input: AgentTemplateInput): string {
  return `---
name: qualflare-write-tests
description: Write or improve tests for this project following Qualflare conventions. Use when the user asks to add tests, improve coverage, or create test cases.
---

# Qualflare Write Tests Skill

## Project context
Read \`.qualflare/test-state.md\` at the start of every session to understand the project's test landscape.

## Frameworks in use
${bulletList(input.frameworks)}

## Writing tests
- Follow existing test file naming conventions (see test-state.md "Top-level paths")
- Match the style of adjacent test files in the same directory
- Prefer small, focused test cases over large integration tests unless the user specifies otherwise

## Uploading results
After running tests, upload results with:
\`\`\`
qf upload <results-file>
\`\`\`
Run \`qf list-formats\` to see supported output formats.

## Qualflare conventions
- Test naming: describe what the code should DO, not what it IS
- Always add a descriptive failure message to assertions
- Group related tests in describe/suite blocks
`
}

// ---------------------------------------------------------------------------
// Claude Code — command
// (.claude/commands/qualflare-sync.md)
// ---------------------------------------------------------------------------

export function renderClaudeCommand(_input: AgentTemplateInput): string {
  return `Sync this project's test state with Qualflare.

Steps:
1. Read \`.qualflare/test-state.md\` to understand the current test inventory
2. Run the project's test suite (ask the user which command if unclear)
3. Upload results: \`qf upload <results-file>\`
4. Report what was uploaded (framework, test count, pass/fail summary)

If \`QF_API_KEY\` is not set, remind the user to run \`qf login\` first.
`
}

// ---------------------------------------------------------------------------
// Claude Code — CLAUDE.md snippet
// (marker-block content for CLAUDE.md)
// ---------------------------------------------------------------------------

export function renderClaudeMdSnippet(input: AgentTemplateInput): string {
  return `## Qualflare Test Integration

This project uses [Qualflare](https://qualflare.com) for test management.

### Quick reference
- Test state: \`.qualflare/test-state.md\` — read this at session start
- Upload results: \`qf upload <results-file>\`
- Frameworks: ${commaSeparated(input.frameworks)}
- Skill: \`qualflare-write-tests\` — use when asked to write or improve tests
- Command: \`/qualflare-sync\` — sync test results to Qualflare
`
}

// ---------------------------------------------------------------------------
// Cursor rules
// (.cursor/rules/qualflare.mdc)
// ---------------------------------------------------------------------------

export function renderCursorRules(input: AgentTemplateInput): string {
  return `---
description: Qualflare test management integration. Apply when working on tests.
globs: ["**/*.test.*", "**/*.spec.*", "**/*_test.*", "**/test_*.*"]
alwaysApply: false
---

# Qualflare Test Conventions

Read \`.qualflare/test-state.md\` at the start of any test-related session.

## Frameworks
${bulletList(input.frameworks)}

## Upload results
\`\`\`
qf upload <results-file>   # see qf list-formats
\`\`\`
`
}

// ---------------------------------------------------------------------------
// Codex CLI — AGENTS.md snippet
// (marker-block content for AGENTS.md)
// ---------------------------------------------------------------------------

export function renderAgentsMd(input: AgentTemplateInput): string {
  return `## Qualflare Test Integration

Read \`.qualflare/test-state.md\` at session start.
Frameworks: ${commaSeparated(input.frameworks)}
Upload: \`qf upload <results-file>\` (run \`qf list-formats\` for formats)
`
}

// ---------------------------------------------------------------------------
// Gemini CLI — GEMINI.md snippet
// (marker-block content for GEMINI.md — same as AGENTS.md)
// ---------------------------------------------------------------------------

export function renderGeminiMd(input: AgentTemplateInput): string {
  return renderAgentsMd(input)
}

// ---------------------------------------------------------------------------
// Continue.dev
// (.continue/rules/qualflare.md)
// ---------------------------------------------------------------------------

export function renderContinueRules(input: AgentTemplateInput): string {
  return `# Qualflare Test Integration

Read \`.qualflare/test-state.md\` at the start of test-related work.

Frameworks in use: ${commaSeparated(input.frameworks)}
Upload: \`qf upload <results-file>\`
`
}
