import { glob } from 'tinyglobby'
import type { FrameworkSlug } from '../frameworks/slugs.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestFileResult {
  slug: FrameworkSlug
  count: number
  topDirs: string[] // unique top-level directories containing matches (relative to projectRoot)
}

// ---------------------------------------------------------------------------
// Glob patterns per slug
// ---------------------------------------------------------------------------

const GLOBS: Partial<Record<FrameworkSlug, string[]>> = {
  jest: ['**/*.test.{js,jsx,ts,tsx,mjs}', '**/__tests__/**/*.{js,ts,tsx,mjs}'],
  mocha: ['test/**/*.{js,ts}', 'tests/**/*.{js,ts}'],
  golang: ['**/*_test.go'],
  python: ['**/test_*.py', '**/*_test.py', 'tests/**/*.py'],
  rspec: ['spec/**/*_spec.rb'],
  phpunit: ['tests/**/*Test.php', 'test/**/*Test.php'],
  playwright: [
    'e2e/**/*.spec.{ts,js}',
    'tests/e2e/**/*.spec.{ts,js}',
    'playwright/**/*.spec.{ts,js}',
    'playwright.config.{ts,js}',
  ],
  cypress: ['cypress/e2e/**/*.cy.{ts,js}', 'cypress/integration/**/*.{ts,js}'],
  selenium: ['tests/**/*selenium*.{js,ts,java}'],
  cucumber: ['features/**/*.feature', 'test/**/*.feature'],
  karate: ['src/test/**/*.feature', 'karate/**/*.feature'],
  junit: ['src/test/**/*Test.java', 'src/test/**/*Tests.java'],
  newman: [], // no test files — detected via config only
  k6: ['**/*.k6.{js,ts}', 'scripts/performance/**/*.{js,ts}'],
  // security tools: no test files per se
  zap: [],
  trivy: [],
  snyk: [],
  sonarqube: [],
  testcafe: [],
}

// ---------------------------------------------------------------------------
// Ignored directories
// ---------------------------------------------------------------------------

const IGNORE = ['**/node_modules/**', '**/vendor/**', '**/.git/**', '**/dist/**', '**/build/**', '**/coverage/**']

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * For each slug in `slugs`, glob the test files and return counts.
 * Ignores node_modules, vendor, .git, dist, build, coverage.
 */
export async function scanTestFiles(projectRoot: string, slugs: FrameworkSlug[]): Promise<TestFileResult[]> {
  const results = await Promise.all(
    slugs.map(async (slug): Promise<TestFileResult> => {
      const patterns = GLOBS[slug]

      if (!patterns || patterns.length === 0) {
        return { slug, count: 0, topDirs: [] }
      }

      let files: string[]
      try {
        files = await glob(patterns, {
          cwd: projectRoot,
          ignore: IGNORE,
          onlyFiles: true,
        })
      } catch {
        files = []
      }

      // Compute unique top-level directories
      // tinyglobby returns paths relative to cwd (projectRoot)
      const topDirSet = new Set<string>()
      for (const file of files) {
        const firstSlash = file.indexOf('/')
        const topDir = firstSlash === -1 ? '.' : file.slice(0, firstSlash)
        topDirSet.add(topDir)
      }

      return {
        slug,
        count: files.length,
        topDirs: Array.from(topDirSet).sort(),
      }
    }),
  )

  return results
}
