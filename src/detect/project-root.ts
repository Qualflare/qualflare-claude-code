import { access } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'

/**
 * Marker files/dirs that indicate a project root (checked in order).
 */
const ROOT_MARKERS = [
  '.git',
  'package.json',
  'go.mod',
  'pyproject.toml',
  'Cargo.toml',
  'pom.xml',
  'Gemfile',
  'composer.json',
]

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function hasMarker(dir: string): Promise<boolean> {
  for (const marker of ROOT_MARKERS) {
    if (await pathExists(join(dir, marker))) {
      return true
    }
  }
  return false
}

/**
 * Resolves the project root from startDir (defaults to process.cwd()).
 * Returns the highest directory (closest to cwd) that contains any ROOT_MARKER.
 * If none found, returns startDir as fallback.
 */
export async function findProjectRoot(startDir?: string): Promise<string> {
  const start = resolve(startDir ?? process.cwd())
  const home = homedir()

  let current = start

  while (true) {
    if (await hasMarker(current)) {
      return current // closest ancestor wins — return immediately
    }

    if (current === home || current === dirname(home)) break

    const parent = dirname(current)
    // Stop if we can't go further up (reached filesystem root)
    if (parent === current) break

    current = parent
  }

  return start // fallback if no match
}
