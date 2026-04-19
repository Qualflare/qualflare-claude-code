import { readFile } from 'fs/promises'
import { join } from 'path'
import type { DetectedFramework, Detector, DetectorResult } from '../types.js'

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const goDetector: Detector = {
  id: 'go',

  async detect(projectRoot: string): Promise<DetectorResult> {
    const goModPath = join(projectRoot, 'go.mod')
    let raw: string
    try {
      raw = await readFile(goModPath, 'utf8')
    } catch {
      return {
        matched: false,
        language: 'Go',
        frameworks: [],
        suggestions: [],
      }
    }

    // Parse go.mod line by line
    const lines = raw.split('\n')
    let languageVersion: string | undefined

    for (const line of lines) {
      const trimmed = line.trim()

      // Extract Go version from "go X.YY" directive
      const goVersionMatch = /^go\s+(\d+\.\d+(?:\.\d+)?)/.exec(trimmed)
      if (goVersionMatch) {
        languageVersion = goVersionMatch[1]
      }
    }

    // Always add golang slug if go.mod exists
    const frameworks: DetectedFramework[] = [{ slug: 'golang', source: 'config' }]

    // Check for cucumber/godog
    const lowerRaw = raw.toLowerCase()
    if (lowerRaw.includes('cucumber') || lowerRaw.includes('godog')) {
      frameworks.push({ slug: 'cucumber', source: 'dep' })
    }

    // Check for karate
    if (lowerRaw.includes('karate')) {
      frameworks.push({ slug: 'karate', source: 'dep' })
    }

    return {
      matched: true,
      language: 'Go',
      languageVersion,
      frameworks,
      suggestions: [],
    }
  },
}
