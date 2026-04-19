export type AgentId = 'claude-code' | 'cursor' | 'codex' | 'gemini' | 'continue'

export interface InstallerInput {
  projectRoot: string
  templateInput: import('../render/templates/index.js').AgentTemplateInput
}

export interface InstallerResult {
  agentId: AgentId
  files: Array<{
    path: string // absolute path
    action: 'wrote' | 'skipped' | 'appended' | 'exists'
  }>
}

export interface Installer {
  readonly id: AgentId
  install(input: InstallerInput): Promise<InstallerResult>
}
