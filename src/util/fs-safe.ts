/**
 * Safe filesystem operations for installer use.
 * All writes that touch existing user files go through marker-block utilities.
 */

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { extractMarkerBlock, hasMarkerBlock, upsertMarkerBlock, wrapInMarkers } from './markers.js'

// Re-export FrameworkSlug so installers can import from this module if needed.
export type { FrameworkSlug } from '../frameworks/slugs.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UpsertResult = 'wrote' | 'skipped' | 'appended'
export type CreateResult = 'wrote' | 'exists'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Read file content; return null if the file does not exist.
 */
export async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') return null
    throw err
  }
}

/**
 * Ensure a directory exists (mkdir -p equivalent).
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

/**
 * Write content atomically: write to a temp file in the same directory,
 * then rename to the target path. Creates parent directories if needed.
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath)
  await ensureDir(dir)

  // Write to a temp file in the same directory, then rename (avoids cross-device EXDEV errors)
  const tmp = join(dir, `.qualflare-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  try {
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, filePath)
  } catch (err) {
    // Best-effort cleanup of the temp file
    try {
      const { unlink } = await import('fs/promises')
      await unlink(tmp)
    } catch {
      // ignore cleanup failures
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Marker-block operations
// ---------------------------------------------------------------------------

/**
 * Upsert a marker block in a file.
 *
 * - File doesn't exist → creates it with just the marker block → 'wrote'
 * - File exists with marker, content identical → no write → 'skipped'
 * - File exists with marker, content differs → replaces marker block → 'wrote'
 * - File exists without marker → appends marker block to end → 'appended'
 */
export async function upsertMarkerInFile(
  filePath: string,
  newContent: string,
  tag?: string,
): Promise<UpsertResult> {
  const existing = await readIfExists(filePath)

  if (existing === null) {
    // File does not exist — create with marker block
    await atomicWrite(filePath, wrapInMarkers(newContent, tag) + '\n')
    return 'wrote'
  }

  if (hasMarkerBlock(existing, tag)) {
    const currentBlock = extractMarkerBlock(existing, tag) ?? ''
    // Normalise for idempotency comparison (strip surrounding newlines)
    const normalisedCurrent = currentBlock.replace(/^\n/, '').replace(/\n$/, '')
    const normalisedNew = newContent.replace(/^\n/, '').replace(/\n$/, '')

    if (normalisedCurrent === normalisedNew) {
      return 'skipped'
    }

    const updated = upsertMarkerBlock(existing, newContent, tag)
    await atomicWrite(filePath, updated)
    return 'wrote'
  }

  // File exists but has no marker — append
  const updated = upsertMarkerBlock(existing, newContent, tag)
  await atomicWrite(filePath, updated)
  return 'appended'
}

/**
 * Safely create a new file.
 * - If file already exists → returns 'exists' without touching it.
 * - If file doesn't exist → creates parent dir + writes file → returns 'wrote'.
 */
export async function createFileIfAbsent(filePath: string, content: string): Promise<CreateResult> {
  const existing = await readIfExists(filePath)
  if (existing !== null) return 'exists'

  await atomicWrite(filePath, content)
  return 'wrote'
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
