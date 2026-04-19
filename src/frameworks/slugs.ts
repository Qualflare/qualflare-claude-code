/**
 * Canonical Qualflare framework slugs.
 *
 * IMPORTANT: This list MUST stay in sync with the Go constants defined in:
 *   /Users/ibrahim/Astrais/qualflare-cli/internal/core/domain/models.go
 *
 * Any time a framework is added or renamed in that file, update this list
 * to match exactly — slug strings must be identical character-for-character.
 */

// ---------------------------------------------------------------------------
// Canonical slug list (mirrors Go AllFrameworks())
// ---------------------------------------------------------------------------

export const FRAMEWORK_SLUGS = [
  // Unit Testing
  'junit',
  'python',
  'golang',
  'jest',
  'mocha',
  'rspec',
  'phpunit',
  // BDD
  'cucumber',
  'karate',
  // E2E
  'playwright',
  'cypress',
  'selenium',
  'testcafe',
  // API
  'newman',
  'k6',
  // Security
  'zap',
  'trivy',
  'snyk',
  'sonarqube',
] as const

/** Union type of all valid Qualflare framework slugs. */
export type FrameworkSlug = (typeof FRAMEWORK_SLUGS)[number]

/** Category of a testing framework, mirroring Go's FrameworkCategory. */
export type FrameworkCategory = 'unit' | 'bdd' | 'e2e' | 'api' | 'security'

// ---------------------------------------------------------------------------
// Grouped by category
// ---------------------------------------------------------------------------

export const FRAMEWORK_BY_CATEGORY: Record<FrameworkCategory, FrameworkSlug[]> = {
  unit: ['junit', 'python', 'golang', 'jest', 'mocha', 'rspec', 'phpunit'],
  bdd: ['cucumber', 'karate'],
  e2e: ['playwright', 'cypress', 'selenium', 'testcafe'],
  api: ['newman', 'k6'],
  security: ['zap', 'trivy', 'snyk', 'sonarqube'],
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/** Returns true if `s` is a valid Qualflare framework slug. */
export function isFrameworkSlug(s: string): s is FrameworkSlug {
  return (FRAMEWORK_SLUGS as readonly string[]).includes(s)
}

// ---------------------------------------------------------------------------
// Detectable extras
//
// Frameworks the wizard can DETECT (and help set up) but which do not have a
// direct Qualflare upload format.  Each entry maps to the closest Qualflare
// slug for upload purposes (or null if there is no reasonable mapping).
// ---------------------------------------------------------------------------

export const DETECTABLE_EXTRAS = [
  {
    name: 'vitest',
    language: 'typescript',
    nearestSlug: 'jest' as FrameworkSlug,
    note: 'vitest produces jest-compatible output via @vitest/ui; upload as jest',
  },
  {
    name: 'cargo-test',
    language: 'rust',
    nearestSlug: null,
    note: 'Rust built-in test runner; no direct Qualflare upload support yet',
  },
] as const
