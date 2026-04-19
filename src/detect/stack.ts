import type { DetectedFramework, DetectorResult, FrameworkSuggestion } from './types.js'
import { nodeDetector } from './languages/node.js'
import { goDetector } from './languages/go.js'
import { pythonDetector } from './languages/python.js'
import { rubyDetector } from './languages/ruby.js'
import { javaDetector } from './languages/java.js'
import { phpDetector } from './languages/php.js'
import { rustDetector } from './languages/rust.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StackResult {
  detectors: (DetectorResult & { id: string })[]
  /** Convenience: flat list of all unique frameworks found */
  allFrameworks: DetectedFramework[]
  allSuggestions: FrameworkSuggestion[]
  /** Language from first matched detector */
  primaryLanguage: string
}

// ---------------------------------------------------------------------------
// Source priority for deduplication
// ---------------------------------------------------------------------------

const SOURCE_PRIORITY: Record<DetectedFramework['source'], number> = {
  dep: 3,
  config: 2,
  glob: 1,
}

// ---------------------------------------------------------------------------
// All detectors
// ---------------------------------------------------------------------------

const DETECTORS = [
  nodeDetector,
  goDetector,
  pythonDetector,
  rubyDetector,
  javaDetector,
  phpDetector,
  rustDetector,
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Runs all detectors in parallel and aggregates results.
 */
export async function detectStack(projectRoot: string): Promise<StackResult> {
  const results = await Promise.all(
    DETECTORS.map(async (detector) => {
      try {
        const result = await detector.detect(projectRoot)
        return { id: detector.id, ...result }
      } catch (err) {
        console.warn(`[qualflare-ai] Warning: detector "${detector.id}" threw:`, err)
        return {
          id: detector.id,
          matched: false,
          language: detector.id,
          frameworks: [],
          suggestions: [],
        }
      }
    }),
  )

  // Dedupe allFrameworks by slug, keeping highest-confidence source
  const frameworkMap = new Map<string, DetectedFramework>()
  for (const result of results) {
    for (const fw of result.frameworks) {
      const existing = frameworkMap.get(fw.slug)
      if (!existing) {
        frameworkMap.set(fw.slug, fw)
      } else {
        const existingPriority = SOURCE_PRIORITY[existing.source]
        const newPriority = SOURCE_PRIORITY[fw.source]
        if (newPriority > existingPriority) {
          frameworkMap.set(fw.slug, fw)
        }
      }
    }
  }

  const allFrameworks = Array.from(frameworkMap.values())

  // Collect all suggestions (dedupe by slug)
  const suggestionMap = new Map<string, FrameworkSuggestion>()
  for (const result of results) {
    for (const sug of result.suggestions) {
      if (!suggestionMap.has(sug.slug)) {
        suggestionMap.set(sug.slug, sug)
      }
    }
  }
  const allSuggestions = Array.from(suggestionMap.values())

  // Primary language = language from first matched detector
  const firstMatched = results.find((r) => r.matched)
  const primaryLanguage = firstMatched?.language ?? 'Unknown'

  return {
    detectors: results,
    allFrameworks,
    allSuggestions,
    primaryLanguage,
  }
}
