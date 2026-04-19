/**
 * Marker-block utilities for safely merging generated content into user files.
 *
 * Marker format:
 *   <!-- BEGIN qualflare-ai -->
 *   <content>
 *   <!-- END qualflare-ai -->
 */

/** The marker tag used in all generated blocks. */
export const MARKER_TAG = 'qualflare-ai'

/** Returns the full BEGIN marker line. */
export function beginMarker(tag = MARKER_TAG): string {
  return `<!-- BEGIN ${tag} -->`
}

/** Returns the full END marker line. */
export function endMarker(tag = MARKER_TAG): string {
  return `<!-- END ${tag} -->`
}

/**
 * Extracts the content between marker tags from a file's text.
 * Returns null if no marker block is found.
 * The returned content does NOT include the marker lines themselves.
 */
export function extractMarkerBlock(fileContent: string, tag = MARKER_TAG): string | null {
  const begin = beginMarker(tag)
  const end = endMarker(tag)

  const startIdx = fileContent.indexOf(begin)
  if (startIdx === -1) return null

  const contentStart = startIdx + begin.length
  const endIdx = fileContent.indexOf(end, contentStart)
  if (endIdx === -1) return null

  return fileContent.slice(contentStart, endIdx)
}

/** Returns true if the file contains a marker block. */
export function hasMarkerBlock(fileContent: string, tag = MARKER_TAG): boolean {
  return fileContent.includes(beginMarker(tag))
}

/**
 * Replaces the content between markers in an existing file.
 * If no marker block exists, appends the full block to the end.
 * Preserves all content outside the markers unchanged.
 */
export function upsertMarkerBlock(
  fileContent: string,
  newBlockContent: string,
  tag = MARKER_TAG,
): string {
  const begin = beginMarker(tag)
  const end = endMarker(tag)

  const startIdx = fileContent.indexOf(begin)
  if (startIdx === -1) {
    // No existing block — append to end
    const separator = fileContent.length > 0 && !fileContent.endsWith('\n') ? '\n' : ''
    return fileContent + separator + wrapInMarkers(newBlockContent, tag) + '\n'
  }

  const endIdx = fileContent.indexOf(end, startIdx + begin.length)
  if (endIdx === -1) {
    // Malformed: begin without end — append full block to end
    const separator = fileContent.length > 0 && !fileContent.endsWith('\n') ? '\n' : ''
    return fileContent + separator + wrapInMarkers(newBlockContent, tag) + '\n'
  }

  // Replace the full block (including marker lines)
  const before = fileContent.slice(0, startIdx)
  const after = fileContent.slice(endIdx + end.length)

  return before + wrapInMarkers(newBlockContent, tag) + after
}

/**
 * Wraps content in marker tags, returning the full block string.
 * The block ends with a newline after the END marker.
 */
export function wrapInMarkers(content: string, tag = MARKER_TAG): string {
  const begin = beginMarker(tag)
  const end = endMarker(tag)

  // Ensure content has a trailing newline before the end marker
  const normalised = content.endsWith('\n') ? content : content + '\n'

  return `${begin}\n${normalised}${end}`
}
