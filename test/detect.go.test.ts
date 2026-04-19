import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { goDetector } from '../src/detect/languages/go.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES = join(__dirname, 'fixtures')

describe('goDetector', () => {
  it('detects golang slug from go.mod', async () => {
    const result = await goDetector.detect(join(FIXTURES, 'go'))
    expect(result.matched).toBe(true)
    expect(result.frameworks.map((f) => f.slug)).toContain('golang')
  })

  it('extracts go version', async () => {
    const result = await goDetector.detect(join(FIXTURES, 'go'))
    expect(result.languageVersion).toBe('1.22')
  })

  it('returns matched=false for directory without go.mod', async () => {
    const result = await goDetector.detect(join(FIXTURES, 'node-jest'))
    expect(result.matched).toBe(false)
  })
})
