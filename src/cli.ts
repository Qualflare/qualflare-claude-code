#!/usr/bin/env node
import { cac } from 'cac'
import { runWizard } from './wizard/run.js'

const cli = cac('qualflare-ai')

cli
  .command('', 'Run the Qualflare AI setup wizard')
  .option('--yes, -y', 'Non-interactive mode: accept all defaults')
  .option('--cwd <dir>', 'Project root directory (default: auto-detect)')
  .option('--agents <ids>', 'Comma-separated agent IDs to install (claude-code,cursor,codex,gemini,continue)')
  .action(async (options) => {
    const agents = options.agents
      ? (options.agents as string).split(',').map((s: string) => s.trim())
      : undefined
    await runWizard({
      cwd: options.cwd as string | undefined,
      yes: options.yes as boolean | undefined,
      agents: agents as import('./install/types.js').AgentId[] | undefined,
    })
  })

cli.help()
cli.version('0.1.0')
cli.parse()
