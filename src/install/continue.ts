import { join, relative } from 'path'
import { createFileIfAbsent, ensureDir } from '../util/fs-safe.js'
import { logger } from '../util/logger.js'
import { renderContinueRules } from '../render/templates/index.js'
import type { Installer, InstallerInput, InstallerResult } from './types.js'

export const continueInstaller: Installer = {
  id: 'continue',

  async install(input: InstallerInput): Promise<InstallerResult> {
    const { projectRoot, templateInput } = input
    const files: InstallerResult['files'] = []

    // .continue/rules/qualflare.md
    const rulesPath = join(projectRoot, '.continue', 'rules', 'qualflare.md')
    await ensureDir(join(projectRoot, '.continue', 'rules'))
    const result = await createFileIfAbsent(rulesPath, renderContinueRules(templateInput))
    const rel = relative(projectRoot, rulesPath)
    if (result === 'wrote') {
      logger.wrote(rel)
    } else {
      logger.skipped(rel)
    }
    files.push({ path: rulesPath, action: result })

    return { agentId: 'continue', files }
  },
}
