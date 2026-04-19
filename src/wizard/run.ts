import { createRequire } from 'module'
import { join } from 'path'
import { log, spinner } from '@clack/prompts'
import { findProjectRoot } from '../detect/project-root.js'
import { detectStack } from '../detect/stack.js'
import { scanTestFiles } from '../detect/tests.js'
import { detectAgents } from '../util/env-hints.js'
import { inferProjectName, renderTestState } from '../render/test-state.js'
import { ensureDir, atomicWrite } from '../util/fs-safe.js'
import { runInstallers } from '../install/index.js'
import type { AgentId } from '../install/types.js'
import type { AgentTemplateInput } from '../render/templates/index.js'
import { showIntro } from './intro.js'
import { showOutro } from './outro.js'
import { confirmFrameworks } from './confirm-frameworks.js'
import { confirmAgents } from './confirm-agents.js'

// ---------------------------------------------------------------------------
// Load package.json version
// ---------------------------------------------------------------------------

const _require = createRequire(import.meta.url)
const _pkg = _require('../package.json') as { version: string }
const WIZARD_VERSION = _pkg.version

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WizardOptions {
  cwd?: string
  yes?: boolean
  agents?: AgentId[]
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runWizard(options: WizardOptions): Promise<void> {
  // Step 1: Show intro
  showIntro(WIZARD_VERSION)

  // Step 2: Find project root
  const projectRoot = await findProjectRoot(options.cwd ?? process.cwd())

  // Step 3: Detect stack (with spinner)
  const stackSpinner = spinner()
  stackSpinner.start('Detecting tech stack…')
  const stackResult = await detectStack(projectRoot)
  stackSpinner.stop(
    stackResult.primaryLanguage !== 'Unknown'
      ? `Stack detected: ${stackResult.primaryLanguage}`
      : 'Stack detection complete',
  )

  const detectedSlugs = stackResult.allFrameworks.map((fw) => fw.slug as import('../frameworks/slugs.js').FrameworkSlug)

  // Step 4: Scan test files (with spinner)
  const scanSpinner = spinner()
  scanSpinner.start('Scanning test files…')
  const testFiles = await scanTestFiles(projectRoot, detectedSlugs)
  const totalTestFiles = testFiles.reduce((sum, tf) => sum + tf.count, 0)
  scanSpinner.stop(`Scan complete — ${totalTestFiles} test file(s) found`)

  // Step 5: Confirm frameworks
  const { confirmedFrameworks, userNotes } = await confirmFrameworks({
    stackResult,
    testFiles,
    yesMode: options.yes ?? false,
  })

  // Step 6: Write .qualflare/test-state.md
  const projectName = await inferProjectName(projectRoot)
  const testStateContent = renderTestState({
    projectName,
    wizardVersion: WIZARD_VERSION,
    stackResult,
    testFiles,
    userNotes,
    confirmedFrameworks,
  })

  const qualflareDir = join(projectRoot, '.qualflare')
  const testStatePath = join(qualflareDir, 'test-state.md')

  await ensureDir(qualflareDir)
  await atomicWrite(testStatePath, testStateContent)
  log.success('Created .qualflare/test-state.md')

  // Step 7: Confirm and install agents
  let selectedAgents: AgentId[]

  if (options.agents && options.agents.length > 0) {
    selectedAgents = options.agents
  } else {
    const hints = await detectAgents()
    selectedAgents = await confirmAgents({
      hints,
      yesMode: options.yes ?? false,
    })
  }

  const templateInput: AgentTemplateInput = {
    projectName,
    frameworks: confirmedFrameworks,
    wizardVersion: WIZARD_VERSION,
  }

  const installerResults = await runInstallers(selectedAgents, {
    projectRoot,
    templateInput,
  })

  const installedAgentNames = installerResults.map((r) => {
    // Map agentId to a display name
    const names: Record<AgentId, string> = {
      'claude-code': 'Claude Code',
      cursor: 'Cursor',
      codex: 'Codex',
      gemini: 'Gemini CLI',
      continue: 'Continue.dev',
    }
    return names[r.agentId]
  })

  // Step 8: Show outro
  showOutro({
    projectRoot,
    installedAgents: installedAgentNames,
    testStatePath,
  })
}
