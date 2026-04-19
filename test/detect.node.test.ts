import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { nodeDetector } from '../src/detect/languages/node.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES = join(__dirname, 'fixtures')

describe('nodeDetector', () => {
  it('detects jest from devDependencies', async () => {
    const result = await nodeDetector.detect(join(FIXTURES, 'node-jest'))
    expect(result.matched).toBe(true)
    const slugs = result.frameworks.map((f) => f.slug)
    expect(slugs).toContain('jest')
  })

  it('detects playwright from devDependencies', async () => {
    const result = await nodeDetector.detect(join(FIXTURES, 'node-jest'))
    const slugs = result.frameworks.map((f) => f.slug)
    expect(slugs).toContain('playwright')
  })

  it('returns JavaScript language for fixture without typescript dep', async () => {
    const result = await nodeDetector.detect(join(FIXTURES, 'node-jest'))
    // fixture has react but no typescript dep → language is JavaScript
    expect(result.language).toBe('JavaScript')
  })

  it('suggests playwright when react is present and no E2E found', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'qf-test-'))
    try {
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ devDependencies: { react: '^18.0.0', jest: '^29.0.0' } }),
      )
      const result = await nodeDetector.detect(tmpDir)
      const suggestionSlugs = result.suggestions.map((s) => s.slug)
      expect(suggestionSlugs).toContain('playwright')
    } finally {
      await rm(tmpDir, { recursive: true })
    }
  })

  it('returns matched=false for directory without package.json', async () => {
    const result = await nodeDetector.detect(join(FIXTURES, 'go'))
    expect(result.matched).toBe(false)
  })
})
