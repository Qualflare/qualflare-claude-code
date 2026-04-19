import { intro, note } from '@clack/prompts'

export function showIntro(version: string): void {
  intro('qualflare-ai')
  note(
    `Setup wizard v${version}\n` +
      'Detects your project tech stack, creates .qualflare/test-state.md,\n' +
      'and installs Qualflare AI agent plugins.',
    'Qualflare AI',
  )
}
