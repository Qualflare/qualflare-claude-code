import { readFile } from 'fs/promises'
import { join } from 'path'
import type { DetectedFramework, Detector, DetectorResult } from '../types.js'
import type { FrameworkSlug } from '../../frameworks/slugs.js'

// ---------------------------------------------------------------------------
// Line → slug mapping
// ---------------------------------------------------------------------------

function lineToSlug(line: string): FrameworkSlug | null {
  // Match gem declarations like: gem 'rspec', gem "rspec-rails", etc.
  const gemMatch = /gem\s+['"]([^'"]+)['"]/.exec(line)
  if (!gemMatch) return null

  const gemName = gemMatch[1].toLowerCase()
  if (gemName === 'rspec' || gemName === 'rspec-rails') return 'rspec'
  if (gemName === 'cucumber' || gemName === 'cucumber-rails') return 'cucumber'
  return null
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const rubyDetector: Detector = {
  id: 'ruby',

  async detect(projectRoot: string): Promise<DetectorResult> {
    const gemfilePath = join(projectRoot, 'Gemfile')
    let raw: string
    try {
      raw = await readFile(gemfilePath, 'utf8')
    } catch {
      return {
        matched: false,
        language: 'Ruby',
        frameworks: [],
        suggestions: [],
      }
    }

    const frameworks: DetectedFramework[] = []
    const slugsSeen = new Set<FrameworkSlug>()

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const slug = lineToSlug(trimmed)
      if (slug && !slugsSeen.has(slug)) {
        slugsSeen.add(slug)
        frameworks.push({ slug, source: 'dep' })
      }
    }

    return {
      matched: true,
      language: 'Ruby',
      frameworks,
      suggestions: [],
    }
  },
}
