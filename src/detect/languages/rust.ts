import { readFile } from 'fs/promises'
import { join } from 'path'
import { parse as parseToml } from 'smol-toml'
import type { Detector, DetectorResult } from '../types.js'

// ---------------------------------------------------------------------------
// Cargo.toml shape (partial)
// ---------------------------------------------------------------------------

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const rustDetector: Detector = {
  id: 'rust',

  async detect(projectRoot: string): Promise<DetectorResult> {
    const cargoPath = join(projectRoot, 'Cargo.toml')
    let raw: string
    try {
      raw = await readFile(cargoPath, 'utf8')
    } catch {
      return {
        matched: false,
        language: 'Rust',
        frameworks: [],
        suggestions: [],
      }
    }

    let languageVersion: string | undefined

    try {
      const toml = parseToml(raw)
      if (isRecord(toml['package'])) {
        const pkg = toml['package']
        if (typeof pkg['rust-version'] === 'string') {
          languageVersion = pkg['rust-version']
        } else if (typeof pkg['edition'] === 'string') {
          languageVersion = pkg['edition']
        }
      }
    } catch {
      console.warn(`[qualflare-ai] Warning: could not parse ${cargoPath}`)
    }

    return {
      matched: true,
      language: 'Rust',
      languageVersion,
      frameworks: [],
      suggestions: [
        {
          slug: 'junit',
          reason:
            'cargo-nextest can output JUnit XML; install cargo-nextest and configure CI to output junit.xml',
        },
      ],
    }
  },
}
