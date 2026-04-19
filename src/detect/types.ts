import type { FrameworkSlug } from '../frameworks/slugs.js'

export interface DetectedFramework {
  slug: FrameworkSlug
  source: 'dep' | 'config' | 'glob' // how it was found
  version?: string // e.g. "^29.0.0" from package.json
  note?: string // optional human-readable note (e.g. aliased slug explanation)
}

export interface FrameworkSuggestion {
  slug: FrameworkSlug
  reason: string // human-readable e.g. "project has React; consider Playwright for E2E"
}

export interface DetectorResult {
  matched: boolean // true if this language was found in the project
  language: string // human-readable e.g. "TypeScript", "Go"
  languageVersion?: string // e.g. "1.23" from go.mod
  frameworks: DetectedFramework[]
  suggestions: FrameworkSuggestion[]
}

export interface Detector {
  readonly id: string // 'node' | 'go' | 'python' | ...
  detect(projectRoot: string): Promise<DetectorResult>
}
