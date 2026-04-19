import { relative } from 'path'
import { log, outro } from '@clack/prompts'

export interface OutroInput {
  projectRoot: string
  installedAgents: string[]
  testStatePath: string
}

export function showOutro(input: OutroInput): void {
  const displayPath = relative(input.projectRoot, input.testStatePath)
  log.success(`Created: ${displayPath}`)
  for (const agent of input.installedAgents) {
    log.success(`Configured: ${agent}`)
  }
  outro('All done! Next steps: run `qf upload <results>` to sync test results.')
}
