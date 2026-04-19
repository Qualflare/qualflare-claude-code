import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir as osTmpdir } from 'os'
import { claudeCodeInstaller } from '../src/install/claude-code.js'
import { readIfExists, atomicWrite } from '../src/util/fs-safe.js'

describe('claudeCodeInstaller', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(osTmpdir(), 'qf-claude-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  const templateInput = {
    projectName: 'test-project',
    frameworks: ['jest', 'playwright'],
    wizardVersion: '0.1.0',
  }

  it('creates SKILL.md on first run', async () => {
    const result = await claudeCodeInstaller.install({ projectRoot: tmpDir, templateInput })

    const skillPath = join(tmpDir, '.claude/skills/qualflare-write-tests/SKILL.md')
    const content = await readIfExists(skillPath)
    expect(content).not.toBeNull()
    expect(content).toContain('qualflare-write-tests')

    const fileAction = result.files.find((f) => f.path === skillPath)
    expect(fileAction?.action).toBe('wrote')
  })

  it('is idempotent — second run returns exists for skill file', async () => {
    const input = { projectRoot: tmpDir, templateInput }
    await claudeCodeInstaller.install(input)
    const result2 = await claudeCodeInstaller.install(input)

    const skillPath = join(tmpDir, '.claude/skills/qualflare-write-tests/SKILL.md')
    const fileAction = result2.files.find((f) => f.path === skillPath)
    expect(fileAction?.action).toBe('exists')
  })

  it('upserts CLAUDE.md marker block', async () => {
    await claudeCodeInstaller.install({ projectRoot: tmpDir, templateInput })

    const claudeMd = await readIfExists(join(tmpDir, 'CLAUDE.md'))
    expect(claudeMd).toContain('<!-- BEGIN qualflare-ai -->')
    expect(claudeMd).toContain('<!-- END qualflare-ai -->')
  })

  it('preserves existing CLAUDE.md content outside markers', async () => {
    const claudeMdPath = join(tmpDir, 'CLAUDE.md')
    await atomicWrite(claudeMdPath, '# My Existing Content\n\nSome existing docs.\n')

    await claudeCodeInstaller.install({ projectRoot: tmpDir, templateInput })

    const content = await readIfExists(claudeMdPath)
    expect(content).toContain('# My Existing Content')
    expect(content).toContain('<!-- BEGIN qualflare-ai -->')
  })
})
