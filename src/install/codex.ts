import { join, relative } from 'path'
import { upsertMarkerInFile } from '../util/fs-safe.js'
import { logger } from '../util/logger.js'
import { renderAgentsMd } from '../render/templates/index.js'
import type { Installer, InstallerInput, InstallerResult } from './types.js'

export const codexInstaller: Installer = {
  id: 'codex',

  async install(input: InstallerInput): Promise<InstallerResult> {
    const { projectRoot, templateInput } = input
    const files: InstallerResult['files'] = []

    // AGENTS.md — upsert marker block
    const agentsMdPath = join(projectRoot, 'AGENTS.md')
    const result = await upsertMarkerInFile(agentsMdPath, renderAgentsMd(templateInput))
    const rel = relative(projectRoot, agentsMdPath)
    if (result === 'skipped') {
      logger.skipped(rel)
    } else {
      logger.wrote(rel)
    }
    files.push({ path: agentsMdPath, action: result })

    return { agentId: 'codex', files }
  },
}
