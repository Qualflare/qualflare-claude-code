import { readFile } from 'fs/promises'
import { join } from 'path'
import type { DetectedFramework, Detector, DetectorResult, FrameworkSuggestion } from '../types.js'
import type { FrameworkSlug } from '../../frameworks/slugs.js'

// ---------------------------------------------------------------------------
// Dependency → slug mapping
// ---------------------------------------------------------------------------

const DEP_SLUG_MAP: Record<string, FrameworkSlug> = {
  jest: 'jest',
  '@jest/core': 'jest',
  'babel-jest': 'jest',
  vitest: 'jest', // vitest detected; upload results as jest
  mocha: 'mocha',
  '@playwright/test': 'playwright',
  playwright: 'playwright',
  cypress: 'cypress',
  'selenium-webdriver': 'selenium',
  webdriverio: 'selenium',
  testcafe: 'testcafe',
  newman: 'newman',
  '@cucumber/cucumber': 'cucumber',
  cucumber: 'cucumber',
}

// Notes for specific deps (e.g. aliased ones)
const DEP_NOTES: Record<string, string> = {
  vitest: 'vitest detected; upload results as jest',
  webdriverio: 'webdriverio detected; mapped to selenium slug',
}

// ---------------------------------------------------------------------------
// Package.json shape (partial)
// ---------------------------------------------------------------------------

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function parsePackageJson(raw: string): PackageJson | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    return parsed as PackageJson
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// E2E slugs for suggestion logic
// ---------------------------------------------------------------------------

const E2E_SLUGS = new Set<FrameworkSlug>(['playwright', 'cypress', 'selenium', 'testcafe'])
const API_SLUGS = new Set<FrameworkSlug>(['newman', 'k6'])

const FRONTEND_DEPS = ['react', 'vue', 'svelte']
const BACKEND_DEPS = ['express', 'fastify', 'hono']

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const nodeDetector: Detector = {
  id: 'node',

  async detect(projectRoot: string): Promise<DetectorResult> {
    const pkgPath = join(projectRoot, 'package.json')
    let raw: string
    try {
      raw = await readFile(pkgPath, 'utf8')
    } catch {
      return {
        matched: false,
        language: 'JavaScript',
        frameworks: [],
        suggestions: [],
      }
    }

    const pkg = parsePackageJson(raw)
    if (!pkg) {
      // Parse error
      console.warn(`[qualflare-ai] Warning: could not parse ${pkgPath}`)
      return {
        matched: true,
        language: 'JavaScript',
        frameworks: [],
        suggestions: [],
      }
    }

    const allDeps: Record<string, string> = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    }

    // Determine language label
    const isTypeScript = 'typescript' in allDeps
    const language = isTypeScript ? 'TypeScript' : 'JavaScript'

    // Detect frameworks from deps
    const frameworks: DetectedFramework[] = []
    const slugsSeen = new Set<FrameworkSlug>()

    for (const [dep, version] of Object.entries(allDeps)) {
      const slug = DEP_SLUG_MAP[dep]
      if (slug && !slugsSeen.has(slug)) {
        slugsSeen.add(slug)
        const note = DEP_NOTES[dep]
        frameworks.push({
          slug,
          source: 'dep',
          version: typeof version === 'string' ? version : undefined,
          ...(note ? { note } : {}),
        })
      }
    }

    // Detect k6 from scripts (if script value contains "k6 run")
    if (pkg.scripts) {
      for (const scriptValue of Object.values(pkg.scripts)) {
        if (typeof scriptValue === 'string' && scriptValue.includes('k6 run')) {
          if (!slugsSeen.has('k6')) {
            slugsSeen.add('k6')
            frameworks.push({ slug: 'k6', source: 'config' })
          }
          break
        }
      }
    }

    // Build suggestions
    const suggestions: FrameworkSuggestion[] = []

    const hasE2E = frameworks.some((f) => E2E_SLUGS.has(f.slug))
    const hasApi = frameworks.some((f) => API_SLUGS.has(f.slug))

    const hasFrontendDep = FRONTEND_DEPS.some((d) => d in allDeps)
    const hasBackendDep = BACKEND_DEPS.some((d) => d in allDeps)

    if (hasFrontendDep && !hasE2E) {
      const foundDeps = FRONTEND_DEPS.filter((d) => d in allDeps).join(', ')
      suggestions.push({
        slug: 'playwright',
        reason: `project has ${foundDeps}; consider Playwright for E2E`,
      })
    }

    if (hasBackendDep && !hasApi) {
      const foundDeps = BACKEND_DEPS.filter((d) => d in allDeps).join(', ')
      suggestions.push({
        slug: 'newman',
        reason: `project has ${foundDeps}; consider Newman for API testing`,
      })
    }

    return {
      matched: true,
      language,
      frameworks,
      suggestions,
    }
  },
}
