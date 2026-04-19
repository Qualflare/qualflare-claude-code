import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { XMLParser } from 'fast-xml-parser'
import type { DetectedFramework, Detector, DetectorResult } from '../types.js'
import type { FrameworkSlug } from '../../frameworks/slugs.js'

const MAX_POM_SIZE = 100 * 1024 // 100 KB

// ---------------------------------------------------------------------------
// pom.xml parsing
// ---------------------------------------------------------------------------

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function artifactIdToSlug(artifactId: string): { slug: FrameworkSlug; note?: string } | null {
  const lower = artifactId.toLowerCase()
  if (lower.includes('junit')) return { slug: 'junit' }
  if (lower.includes('karate')) return { slug: 'karate' }
  if (lower.includes('cucumber')) return { slug: 'cucumber' }
  if (lower.includes('testng')) return { slug: 'junit', note: 'testng detected; mapped to junit slug' }
  return null
}

async function detectFromPom(pomPath: string): Promise<DetectedFramework[]> {
  let fileSize: number
  try {
    const s = await stat(pomPath)
    fileSize = s.size
  } catch {
    return []
  }

  if (fileSize > MAX_POM_SIZE) {
    console.warn(`[qualflare-ai] Warning: ${pomPath} is > 100KB, skipping XML parse`)
    return []
  }

  let raw: string
  try {
    raw = await readFile(pomPath, 'utf8')
  } catch {
    return []
  }

  let parsed: unknown
  try {
    const parser = new XMLParser({ ignoreAttributes: false })
    parsed = parser.parse(raw)
  } catch {
    console.warn(`[qualflare-ai] Warning: could not parse ${pomPath}`)
    return []
  }

  if (!isRecord(parsed)) return []

  const project = isRecord((parsed as Record<string, unknown>)['project'])
    ? (parsed as Record<string, unknown>)['project'] as Record<string, unknown>
    : null
  if (!project) return []

  // Collect artifactIds from dependencies and plugins
  const artifactIds: string[] = []

  // Standard dependencies
  const deps = project['dependencies']
  if (isRecord(deps)) {
    const depList = deps['dependency']
    const items = Array.isArray(depList) ? depList : depList ? [depList] : []
    for (const item of items) {
      if (isRecord(item) && typeof item['artifactId'] === 'string') {
        artifactIds.push(item['artifactId'])
      }
    }
  }

  // Build plugins (for maven-surefire, karate-maven, etc.)
  const build = project['build']
  if (isRecord(build)) {
    const plugins = build['plugins']
    if (isRecord(plugins)) {
      const pluginList = plugins['plugin']
      const items = Array.isArray(pluginList) ? pluginList : pluginList ? [pluginList] : []
      for (const item of items) {
        if (isRecord(item) && typeof item['artifactId'] === 'string') {
          artifactIds.push(item['artifactId'])
        }
      }
    }
  }

  const frameworks: DetectedFramework[] = []
  const slugsSeen = new Set<FrameworkSlug>()

  for (const id of artifactIds) {
    const result = artifactIdToSlug(id)
    if (result && !slugsSeen.has(result.slug)) {
      slugsSeen.add(result.slug)
      frameworks.push({ slug: result.slug, source: 'dep' })
    }
  }

  return frameworks
}

// ---------------------------------------------------------------------------
// build.gradle parsing (line scan)
// ---------------------------------------------------------------------------

function gradleLineToSlug(line: string): { slug: FrameworkSlug; note?: string } | null {
  const lower = line.toLowerCase()
  if (lower.includes('junit')) return { slug: 'junit' }
  if (lower.includes('karate')) return { slug: 'karate' }
  if (lower.includes('cucumber')) return { slug: 'cucumber' }
  if (lower.includes('testng')) return { slug: 'junit', note: 'testng detected; mapped to junit slug' }
  return null
}

async function detectFromGradle(gradlePath: string): Promise<DetectedFramework[]> {
  let raw: string
  try {
    raw = await readFile(gradlePath, 'utf8')
  } catch {
    return []
  }

  const frameworks: DetectedFramework[] = []
  const slugsSeen = new Set<FrameworkSlug>()

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) continue

    const result = gradleLineToSlug(trimmed)
    if (result && !slugsSeen.has(result.slug)) {
      slugsSeen.add(result.slug)
      frameworks.push({ slug: result.slug, source: 'dep' })
    }
  }

  return frameworks
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const javaDetector: Detector = {
  id: 'java',

  async detect(projectRoot: string): Promise<DetectorResult> {
    const pomPath = join(projectRoot, 'pom.xml')
    const gradlePath = join(projectRoot, 'build.gradle')
    const gradleKtsPath = join(projectRoot, 'build.gradle.kts')

    let hasPom = false
    let resolvedGradleFile: string | null = null

    try {
      await stat(pomPath)
      hasPom = true
    } catch {
      // no pom.xml
    }

    try { await stat(gradlePath); resolvedGradleFile = gradlePath } catch { /* not found */ }
    if (!resolvedGradleFile) {
      try { await stat(gradleKtsPath); resolvedGradleFile = gradleKtsPath } catch { /* not found */ }
    }

    const hasGradle = resolvedGradleFile !== null

    if (!hasPom && !hasGradle) {
      return {
        matched: false,
        language: 'Java',
        frameworks: [],
        suggestions: [],
      }
    }

    let frameworks: DetectedFramework[] = []

    if (hasPom) {
      // Prefer pom.xml over gradle
      frameworks = await detectFromPom(pomPath)
    } else if (resolvedGradleFile) {
      frameworks = await detectFromGradle(resolvedGradleFile)
    }

    return {
      matched: true,
      language: 'Java',
      frameworks,
      suggestions: [],
    }
  },
}
