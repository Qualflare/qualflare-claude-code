import { join } from 'path'
import { relative } from 'path'
import { createFileIfAbsent, ensureDir, upsertMarkerInFile } from '../util/fs-safe.js'
import { logger } from '../util/logger.js'
import { renderClaudeCommand, renderClaudeMdSnippet, renderClaudeSkill } from '../render/templates/index.js'
import type { Installer, InstallerInput, InstallerResult } from './types.js'

export const claudeCodeInstaller: Installer = {
  id: 'claude-code',

  async install(input: InstallerInput): Promise<InstallerResult> {
    const { projectRoot, templateInput } = input
    const files: InstallerResult['files'] = []

    // 1. .claude/skills/qualflare-write-tests/SKILL.md
    const skillPath = join(projectRoot, '.claude', 'skills', 'qualflare-write-tests', 'SKILL.md')
    await ensureDir(join(projectRoot, '.claude', 'skills', 'qualflare-write-tests'))
    const skillResult = await createFileIfAbsent(skillPath, renderClaudeSkill(templateInput))
    const skillRel = relative(projectRoot, skillPath)
    if (skillResult === 'wrote') {
      logger.wrote(skillRel)
    } else {
      logger.exists(skillRel)
    }
    files.push({ path: skillPath, action: skillResult })

    // 2. .claude/commands/qualflare-sync.md
    const commandPath = join(projectRoot, '.claude', 'commands', 'qualflare-sync.md')
    await ensureDir(join(projectRoot, '.claude', 'commands'))
    const commandResult = await createFileIfAbsent(commandPath, renderClaudeCommand(templateInput))
    const commandRel = relative(projectRoot, commandPath)
    if (commandResult === 'wrote') {
      logger.wrote(commandRel)
    } else {
      logger.exists(commandRel)
    }
    files.push({ path: commandPath, action: commandResult })

    // 3. CLAUDE.md — upsert marker block
    const claudeMdPath = join(projectRoot, 'CLAUDE.md')
    const claudeMdResult = await upsertMarkerInFile(claudeMdPath, renderClaudeMdSnippet(templateInput))
    const claudeMdRel = relative(projectRoot, claudeMdPath)
    if (claudeMdResult === 'skipped') {
      logger.skipped(claudeMdRel)
    } else if (claudeMdResult === 'appended') {
      logger.appended(claudeMdRel)
    } else {
      logger.wrote(claudeMdRel)
    }
    files.push({ path: claudeMdPath, action: claudeMdResult })

    return { agentId: 'claude-code', files }
  },
}
