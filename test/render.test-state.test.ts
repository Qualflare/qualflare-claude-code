import { describe, it, expect } from 'vitest'
import { renderTestState } from '../src/render/test-state.js'
import type { TestStateInput } from '../src/render/test-state.js'

describe('renderTestState', () => {
  const baseInput: TestStateInput = {
    projectName: 'my-project',
    wizardVersion: '0.1.0',
    stackResult: {
      detectors: [
        {
          id: 'node',
          matched: true,
          language: 'TypeScript',
          languageVersion: undefined,
          frameworks: [{ slug: 'jest', source: 'dep' }],
          suggestions: [],
        },
      ],
      allFrameworks: [{ slug: 'jest', source: 'dep' }],
      allSuggestions: [],
      primaryLanguage: 'TypeScript',
    },
    testFiles: [
      { slug: 'jest', count: 42, topDirs: ['src', 'tests'] },
    ],
    confirmedFrameworks: ['jest'],
    userNotes: '',
    qualflareWorkspaceSlug: undefined,
    qualflareProjectSlug: undefined,
  }

  it('starts with the version comment', () => {
    const output = renderTestState(baseInput)
    expect(output).toMatch(/^<!-- qualflare-ai v1 -->/)
  })

  it('includes project name', () => {
    const output = renderTestState(baseInput)
    expect(output).toContain('my-project')
  })

  it('includes jest in the frameworks table', () => {
    const output = renderTestState(baseInput)
    expect(output).toContain('| jest |')
    expect(output).toContain('42')
  })

  it('includes qf upload in test conventions', () => {
    const output = renderTestState(baseInput)
    expect(output).toContain('qf upload')
  })

  it('sanitizes userNotes with --> sequence', () => {
    const output = renderTestState({ ...baseInput, userNotes: 'done --> next' })
    // The rendered notes section should have --> escaped to --\>
    expect(output).toContain('--\\>')
    // The raw --> sequence should not appear in the Notes section
    const notesSection = output.split('## Notes')[1] ?? ''
    expect(notesSection).not.toContain('-->')
  })

  it('shows unset workspace slug when not provided', () => {
    const output = renderTestState(baseInput)
    expect(output).toContain('unset')
  })
})
