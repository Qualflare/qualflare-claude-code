import type { AgentId, Installer, InstallerInput, InstallerResult } from './types.js'
import { claudeCodeInstaller } from './claude-code.js'
import { cursorInstaller } from './cursor.js'
import { codexInstaller } from './codex.js'
import { geminiInstaller } from './gemini.js'
import { continueInstaller } from './continue.js'

export type { AgentId, InstallerInput, InstallerResult } from './types.js'

const INSTALLERS: Map<AgentId, Installer> = new Map([
  ['claude-code', claudeCodeInstaller],
  ['cursor', cursorInstaller],
  ['codex', codexInstaller],
  ['gemini', geminiInstaller],
  ['continue', continueInstaller],
])

/**
 * Returns the list of all available installer IDs.
 */
export function availableInstallers(): AgentId[] {
  return Array.from(INSTALLERS.keys())
}

/**
 * Run a single installer by ID.
 * Throws an Error for unknown IDs.
 */
export async function runInstaller(agentId: AgentId, input: InstallerInput): Promise<InstallerResult> {
  const installer = INSTALLERS.get(agentId)
  if (!installer) {
    throw new Error(`[qualflare-ai] Unknown agent installer: "${agentId}"`)
  }
  return installer.install(input)
}

/**
 * Run multiple installers sequentially (not parallel — avoids interleaved log output).
 */
export async function runInstallers(agentIds: AgentId[], input: InstallerInput): Promise<InstallerResult[]> {
  const results: InstallerResult[] = []
  for (const agentId of agentIds) {
    results.push(await runInstaller(agentId, input))
  }
  return results
}
