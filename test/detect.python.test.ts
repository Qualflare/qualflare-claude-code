import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { pythonDetector } from '../src/detect/languages/python.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES = join(__dirname, 'fixtures')

describe('pythonDetector', () => {
  it('detects python (pytest) slug from pyproject.toml', async () => {
    const result = await pythonDetector.detect(join(FIXTURES, 'python'))
    expect(result.matched).toBe(true)
    expect(result.frameworks.map((f) => f.slug)).toContain('python')
  })

  it('returns matched=false for directory without pyproject.toml or requirements.txt', async () => {
    const result = await pythonDetector.detect(join(FIXTURES, 'node-jest'))
    expect(result.matched).toBe(false)
  })
})
