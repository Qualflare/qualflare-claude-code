import path, { join, relative } from 'path'
import { ensureDir, upsertMarkerInFile } from '../util/fs-safe.js'
import { logger } from '../util/logger.js'
import { renderGeminiMd } from '../render/templates/index.js'
import type { Installer, InstallerInput, InstallerResult } from './types.js'

export const geminiInstaller: Installer = {
  id: 'gemini',

  async install(input: InstallerInput): Promise<InstallerResult> {
    const { projectRoot, templateInput } = input
    const files: InstallerResult['files'] = []

    // GEMINI.md — upsert marker block
    const geminiMdPath = join(projectRoot, 'GEMINI.md')
    await ensureDir(path.dirname(geminiMdPath))
    const result = await upsertMarkerInFile(geminiMdPath, renderGeminiMd(templateInput))
    const rel = relative(projectRoot, geminiMdPath)
    if (result === 'skipped') {
      logger.skipped(rel)
    } else if (result === 'appended') {
      logger.appended(rel)
    } else {
      logger.wrote(rel)
    }
    files.push({ path: geminiMdPath, action: result })

    return { agentId: 'gemini', files }
  },
}
