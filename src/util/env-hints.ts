/**
 * Detect which AI coding agents are likely installed in the user's environment.
 */

import { access } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentId = 'claude-code' | 'cursor' | 'codex' | 'gemini' | 'continue'

export interface AgentHint {
  id: AgentId
  name: string
  detected: boolean
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect which agents are likely present.
 * Returns all 5 agents in order: claude-code, cursor, codex, gemini, continue.
 */
export async function detectAgents(): Promise<AgentHint[]> {
  const home = homedir()
  const cwd = process.cwd()

  const results = await Promise.all([
    detectClaudeCode(home),
    detectCursor(home, cwd),
    detectCodex(home),
    detectGemini(home),
    detectContinue(home),
  ])

  return results
}

// ---------------------------------------------------------------------------
// Per-agent heuristics
// ---------------------------------------------------------------------------

async function detectClaudeCode(home: string): Promise<AgentHint> {
  const dirExists = await dirAccessible(join(home, '.claude'))
  return {
    id: 'claude-code',
    name: 'Claude Code',
    detected: dirExists,
    confidence: 'high',
    reason: dirExists ? '~/.claude/ directory found' : '~/.claude/ directory not found',
  }
}

async function detectCursor(home: string, cwd: string): Promise<AgentHint> {
  const homeDirExists = await dirAccessible(join(home, '.cursor'))
  if (homeDirExists) {
    return {
      id: 'cursor',
      name: 'Cursor',
      detected: true,
      confidence: 'high',
      reason: '~/.cursor/ directory found',
    }
  }

  const cwdDirExists = await dirAccessible(join(cwd, '.cursor'))
  if (cwdDirExists) {
    return {
      id: 'cursor',
      name: 'Cursor',
      detected: true,
      confidence: 'high',
      reason: '.cursor/ directory found in project',
    }
  }

  const sessionEnv = process.env['CURSOR_SESSION']
  if (sessionEnv) {
    return {
      id: 'cursor',
      name: 'Cursor',
      detected: true,
      confidence: 'medium',
      reason: '$CURSOR_SESSION environment variable is set',
    }
  }

  return {
    id: 'cursor',
    name: 'Cursor',
    detected: false,
    confidence: 'high',
    reason: '~/.cursor/ directory not found',
  }
}

async function detectCodex(home: string): Promise<AgentHint> {
  const dirExists = await dirAccessible(join(home, '.codex'))
  return {
    id: 'codex',
    name: 'Codex',
    detected: dirExists,
    confidence: 'high',
    reason: dirExists ? '~/.codex/ directory found' : '~/.codex/ directory not found',
  }
}

async function detectGemini(home: string): Promise<AgentHint> {
  const dirExists = await dirAccessible(join(home, '.gemini'))
  return {
    id: 'gemini',
    name: 'Gemini',
    detected: dirExists,
    confidence: 'high',
    reason: dirExists ? '~/.gemini/ directory found' : '~/.gemini/ directory not found',
  }
}

async function detectContinue(home: string): Promise<AgentHint> {
  const dirExists = await dirAccessible(join(home, '.continue'))
  return {
    id: 'continue',
    name: 'Continue',
    detected: dirExists,
    confidence: 'high',
    reason: dirExists ? '~/.continue/ directory found' : '~/.continue/ directory not found',
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function dirAccessible(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath)
    return true
  } catch {
    return false
  }
}
