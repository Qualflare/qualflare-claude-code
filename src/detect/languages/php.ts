import { readFile } from 'fs/promises'
import { join } from 'path'
import type { DetectedFramework, Detector, DetectorResult } from '../types.js'
import type { FrameworkSlug } from '../../frameworks/slugs.js'

// ---------------------------------------------------------------------------
// composer.json shape (partial)
// ---------------------------------------------------------------------------

interface ComposerJson {
  require?: Record<string, string>
  'require-dev'?: Record<string, string>
  config?: {
    platform?: {
      php?: string
    }
  }
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function parseComposerJson(raw: string): ComposerJson | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    return parsed as ComposerJson
  } catch {
    return null
  }
}

function packageToSlug(packageName: string): FrameworkSlug | null {
  const lower = packageName.toLowerCase()
  if (lower === 'phpunit/phpunit') return 'phpunit'
  if (lower === 'behat/behat') return 'cucumber'
  return null
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const phpDetector: Detector = {
  id: 'php',

  async detect(projectRoot: string): Promise<DetectorResult> {
    const composerPath = join(projectRoot, 'composer.json')
    let raw: string
    try {
      raw = await readFile(composerPath, 'utf8')
    } catch {
      return {
        matched: false,
        language: 'PHP',
        frameworks: [],
        suggestions: [],
      }
    }

    const composer = parseComposerJson(raw)
    if (!composer) {
      console.warn(`[qualflare-ai] Warning: could not parse ${composerPath}`)
      return {
        matched: true,
        language: 'PHP',
        frameworks: [],
        suggestions: [],
      }
    }

    const allDeps: Record<string, string> = {
      ...composer.require,
      ...composer['require-dev'],
    }

    const frameworks: DetectedFramework[] = []
    const slugsSeen = new Set<FrameworkSlug>()

    for (const [pkg, version] of Object.entries(allDeps)) {
      const slug = packageToSlug(pkg)
      if (slug && !slugsSeen.has(slug)) {
        slugsSeen.add(slug)
        frameworks.push({
          slug,
          source: 'dep',
          version: typeof version === 'string' ? version : undefined,
        })
      }
    }

    // Extract PHP version from config.platform.php
    let languageVersion: string | undefined
    if (
      isRecord(composer.config) &&
      isRecord(composer.config['platform']) &&
      typeof composer.config['platform']['php'] === 'string'
    ) {
      languageVersion = composer.config['platform']['php']
    }

    return {
      matched: true,
      language: 'PHP',
      languageVersion,
      frameworks,
      suggestions: [],
    }
  },
}
