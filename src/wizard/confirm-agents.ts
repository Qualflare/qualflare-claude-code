import { cancel, isCancel, multiselect } from '@clack/prompts'
import type { AgentHint } from '../util/env-hints.js'
import type { AgentId } from '../install/types.js'

export interface AgentConfirmInput {
  hints: AgentHint[]
  yesMode: boolean
}

const AGENT_DISPLAY_NAMES: Record<AgentId, string> = {
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  continue: 'Continue.dev',
}

const ALL_AGENTS: AgentId[] = ['claude-code', 'cursor', 'codex', 'gemini', 'continue']

export async function confirmAgents(input: AgentConfirmInput): Promise<AgentId[]> {
  const { hints, yesMode } = input

  const hintMap = new Map<AgentId, AgentHint>(hints.map((h) => [h.id, h]))
  const detectedIds = hints.filter((h) => h.detected).map((h) => h.id)

  if (yesMode) {
    return detectedIds
  }

  const options = ALL_AGENTS.map((id) => {
    const hint = hintMap.get(id)
    const detected = hint?.detected ?? false
    return {
      value: id,
      label: AGENT_DISPLAY_NAMES[id],
      hint: detected ? 'detected' : undefined,
    }
  })

  const selected = await multiselect({
    message: 'Which AI coding agents do you use in this project?',
    options,
    initialValues: detectedIds,
    required: false,
  })

  if (isCancel(selected)) {
    cancel('Setup cancelled.')
    process.exit(0)
  }

  return selected as AgentId[]
}
