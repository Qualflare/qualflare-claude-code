import { join, relative } from 'path'
import { createFileIfAbsent, ensureDir } from '../util/fs-safe.js'
import { logger } from '../util/logger.js'
import { renderCursorRules } from '../render/templates/index.js'
import type { Installer, InstallerInput, InstallerResult } from './types.js'

export const cursorInstaller: Installer = {
  id: 'cursor',

  async install(input: InstallerInput): Promise<InstallerResult> {
    const { projectRoot, templateInput } = input
    const files: InstallerResult['files'] = []

    // .cursor/rules/qualflare.mdc
    const rulesPath = join(projectRoot, '.cursor', 'rules', 'qualflare.mdc')
    await ensureDir(join(projectRoot, '.cursor', 'rules'))
    const result = await createFileIfAbsent(rulesPath, renderCursorRules(templateInput))
    const rel = relative(projectRoot, rulesPath)
    if (result === 'wrote') {
      logger.wrote(rel)
    } else {
      logger.skipped(rel)
    }
    files.push({ path: rulesPath, action: result })

    return { agentId: 'cursor', files }
  },
}
