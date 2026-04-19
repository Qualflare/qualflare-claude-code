import { readFile } from 'fs/promises'
import { join } from 'path'
import { parse as parseToml } from 'smol-toml'
import type { DetectedFramework, Detector, DetectorResult } from '../types.js'
import type { FrameworkSlug } from '../../frameworks/slugs.js'

// ---------------------------------------------------------------------------
// TOML shape helpers
// ---------------------------------------------------------------------------

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function depToSlug(depName: string): FrameworkSlug | null {
  const lower = depName.toLowerCase()
  if (lower === 'pytest' || lower.startsWith('pytest-')) return 'python'
  if (lower === 'behave') return 'cucumber'
  return null
}

// ---------------------------------------------------------------------------
// pyproject.toml parsing
// ---------------------------------------------------------------------------

interface PyprojectResult {
  deps: string[]
  pythonVersion?: string
}

function extractFromPyproject(toml: Record<string, unknown>): PyprojectResult {
  const deps: string[] = []
  let pythonVersion: string | undefined

  // [tool.poetry.dependencies]
  if (isRecord(toml['tool'])) {
    const tool = toml['tool']
    if (isRecord(tool['poetry'])) {
      const poetry = tool['poetry']
      if (isRecord(poetry['dependencies'])) {
        const poetryDeps = poetry['dependencies']
        for (const key of Object.keys(poetryDeps)) {
          deps.push(key)
        }
        // Python version from poetry
        if (typeof poetryDeps['python'] === 'string') {
          pythonVersion = poetryDeps['python']
        }
      }
      // dev-dependencies
      if (isRecord(poetry['dev-dependencies'])) {
        for (const key of Object.keys(poetry['dev-dependencies'])) {
          deps.push(key)
        }
      }
      // group.dev.dependencies (Poetry 1.2+)
      if (isRecord(poetry['group'])) {
        for (const groupVal of Object.values(poetry['group'])) {
          if (isRecord(groupVal) && isRecord(groupVal['dependencies'])) {
            for (const key of Object.keys(groupVal['dependencies'])) {
              deps.push(key)
            }
          }
        }
      }
    }
  }

  // [project] (PEP 621)
  if (isRecord(toml['project'])) {
    const project = toml['project']
    // requires-python
    if (typeof project['requires-python'] === 'string') {
      pythonVersion = project['requires-python']
    }
    // dependencies
    if (Array.isArray(project['dependencies'])) {
      for (const dep of project['dependencies']) {
        if (typeof dep === 'string') {
          // Strip version specifiers: e.g. "pytest>=7.0" → "pytest"
          const name = dep.split(/[>=<![\s]/)[0]
          if (name) deps.push(name)
        }
      }
    }
    // optional-dependencies
    if (isRecord(project['optional-dependencies'])) {
      for (const optGroup of Object.values(project['optional-dependencies'])) {
        if (Array.isArray(optGroup)) {
          for (const dep of optGroup) {
            if (typeof dep === 'string') {
              const name = dep.split(/[>=<![\s]/)[0]
              if (name) deps.push(name)
            }
          }
        }
      }
    }
  }

  return { deps, pythonVersion }
}

// ---------------------------------------------------------------------------
// requirements.txt parsing (line scan)
// ---------------------------------------------------------------------------

function extractFromRequirements(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('-'))
    .map((l) => {
      // Strip version specifiers and extras
      return l.split(/[>=<![\s;]/)[0].trim()
    })
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const pythonDetector: Detector = {
  id: 'python',

  async detect(projectRoot: string): Promise<DetectorResult> {
    const pyprojectPath = join(projectRoot, 'pyproject.toml')
    const requirementsPath = join(projectRoot, 'requirements.txt')

    let depNames: string[] = []
    let languageVersion: string | undefined
    let matched = false

    // Try pyproject.toml first
    try {
      const raw = await readFile(pyprojectPath, 'utf8')
      matched = true
      try {
        const toml = parseToml(raw)
        const result = extractFromPyproject(toml as Record<string, unknown>)
        depNames = result.deps
        languageVersion = result.pythonVersion
      } catch {
        console.warn(`[qualflare-ai] Warning: could not parse ${pyprojectPath}`)
      }
    } catch {
      // pyproject.toml not found — try requirements.txt
    }

    if (!matched) {
      try {
        const raw = await readFile(requirementsPath, 'utf8')
        matched = true
        depNames = extractFromRequirements(raw)
      } catch {
        // requirements.txt not found either
      }
    }

    if (!matched) {
      return {
        matched: false,
        language: 'Python',
        frameworks: [],
        suggestions: [],
      }
    }

    // Map deps to frameworks
    const frameworks: DetectedFramework[] = []
    const slugsSeen = new Set<FrameworkSlug>()

    for (const dep of depNames) {
      const slug = depToSlug(dep)
      if (slug && !slugsSeen.has(slug)) {
        slugsSeen.add(slug)
        frameworks.push({ slug, source: 'dep' })
      }
    }

    return {
      matched: true,
      language: 'Python',
      languageVersion,
      frameworks,
      suggestions: [],
    }
  },
}
