import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { StackResult } from '../detect/stack.js'
import type { TestFileResult } from '../detect/tests.js'
import { FRAMEWORK_BY_CATEGORY } from '../frameworks/slugs.js'
import type { FrameworkCategory, FrameworkSlug } from '../frameworks/slugs.js'

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface TestStateInput {
  /** Inferred from package.json name, go.mod module, or dirname */
  projectName: string
  /** From package.json version */
  wizardVersion: string
  stackResult: StackResult
  testFiles: TestFileResult[]
  /** User-supplied free text from wizard prompt */
  userNotes: string
  qualflareWorkspaceSlug?: string
  qualflareProjectSlug?: string
  /** Slugs the user confirmed (subset of detected) */
  confirmedFrameworks: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up the category for a slug by scanning FRAMEWORK_BY_CATEGORY.
 * Returns 'unit' as a fallback for unknown slugs.
 */
function categoryForSlug(slug: string): FrameworkCategory {
  for (const [cat, slugs] of Object.entries(FRAMEWORK_BY_CATEGORY) as [FrameworkCategory, FrameworkSlug[]][]) {
    if (slugs.includes(slug as FrameworkSlug)) return cat
  }
  return 'unit'
}

/**
 * Look up the language for a slug from the stackResult detectors array.
 * Prefers matched detectors to avoid attributing shared slugs (e.g. 'cucumber') to the wrong language.
 */
function languageForSlug(slug: string, stackResult: StackResult): string {
  // Pass 1: only matched detectors (avoids attributing shared slugs like 'cucumber' to wrong language)
  for (const detector of stackResult.detectors) {
    if (detector.matched && detector.frameworks.some((fw) => fw.slug === slug)) {
      return detector.language
    }
  }
  // Pass 2: any detector (fallback for unusual configs)
  for (const detector of stackResult.detectors) {
    if (detector.frameworks.some((fw) => fw.slug === slug)) {
      return detector.language
    }
  }
  return '—'
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

/**
 * Renders the full .qualflare/test-state.md content as a string.
 */
export function renderTestState(input: TestStateInput): string {
  const {
    projectName,
    wizardVersion,
    stackResult,
    testFiles,
    userNotes,
    qualflareWorkspaceSlug,
    qualflareProjectSlug,
    confirmedFrameworks,
  } = input

  // Matched languages (from detectors that matched)
  const matchedLanguages = stackResult.detectors
    .filter((d) => d.matched)
    .map((d) => d.language)
    .join(', ') || '—'

  // Build the frameworks table rows
  const testFileMap = new Map<string, TestFileResult>(testFiles.map((tf) => [tf.slug, tf]))

  const frameworkRows = confirmedFrameworks
    .map((slug) => {
      const category = categoryForSlug(slug)
      const language = languageForSlug(slug, stackResult)
      const tf = testFileMap.get(slug)
      const count = tf && tf.count > 0 ? String(tf.count) : '—'
      const topDirs = tf && tf.topDirs.length > 0
        ? tf.topDirs.map((p) => p.replace(/\|/g, '\\|')).join(', ')
        : '—'
      return `| ${slug} | ${category} | ${language} | ${count} | ${topDirs} |`
    })
    .join('\n')

  // Suggestions section
  const suggestionsFromStack = stackResult.allSuggestions.filter(
    (s) => !confirmedFrameworks.includes(s.slug),
  )

  const suggestionsBlock =
    suggestionsFromStack.length > 0
      ? suggestionsFromStack.map((s) => `- ${s.slug} — ${s.reason}`).join('\n')
      : '- None detected'

  // Notes block
  const safeNotes = userNotes.replace(/-->/g, '--\\>').trim()
  const notesBlock = safeNotes || '(none)'

  // Workspace / project slugs
  const workspaceDisplay = qualflareWorkspaceSlug ?? 'unset — run `qf login`'
  const projectDisplay = qualflareProjectSlug ?? 'unset'

  // ISO 8601 timestamp
  const generatedAt = new Date().toISOString()

  return `<!-- qualflare-ai v1 -->
# Qualflare Test State

> Source of truth for AI coding agents working on this project's tests.
> Regenerate with: \`npx qualflare-ai\`

## Project
- **Name**: ${projectName}
- **Languages**: ${matchedLanguages}
- **Generated at**: ${generatedAt}
- **Wizard version**: ${wizardVersion}

## Frameworks in use

| Slug | Category | Language | Files | Top-level paths |
|------|----------|----------|-------|-----------------|
${frameworkRows}

## Frameworks suggested (not yet installed)
${suggestionsBlock}

## Test conventions
- Upload results: \`qf upload <results-file>\` (see \`qf list-formats\` for supported formats)
- Config file: \`qualflare.yaml\` or \`.qualflarerc\` in project root
- API key env var: \`QF_API_KEY\`

## Notes
${notesBlock}

## Qualflare backend
- Workspace slug: ${workspaceDisplay}
- Project slug: ${projectDisplay}
`
}

// ---------------------------------------------------------------------------
// inferProjectName
// ---------------------------------------------------------------------------

/**
 * Infer project name from cwd, package.json name, or go.mod module line.
 * Falls back to the directory's basename if neither file exists.
 */
export async function inferProjectName(projectRoot: string): Promise<string> {
  // Try package.json first
  try {
    const pkgPath = join(projectRoot, 'package.json')
    const raw = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as { name?: string }
    if (typeof pkg.name === 'string' && pkg.name.trim()) {
      // Strip npm scope prefix if present (e.g. "@org/name" → "name")
      const name = pkg.name.trim()
      return name.startsWith('@') ? name.split('/')[1] ?? name : name
    }
  } catch {
    // file not found or parse error — fall through
  }

  // Try go.mod
  try {
    const goModPath = join(projectRoot, 'go.mod')
    const raw = await readFile(goModPath, 'utf-8')
    const moduleLine = raw
      .split('\n')
      .find((line) => line.startsWith('module '))
    if (moduleLine) {
      const modulePath = moduleLine.replace(/^module\s+/, '').trim()
      // Use the last segment of the module path as the project name
      const parts = modulePath.split('/')
      const last = parts[parts.length - 1]
      if (last) return last
    }
  } catch {
    // file not found or parse error — fall through
  }

  // Fall back to directory basename
  return basename(projectRoot)
}
