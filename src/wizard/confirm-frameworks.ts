import { cancel, isCancel, log, multiselect, text } from '@clack/prompts'
import { FRAMEWORK_BY_CATEGORY, FRAMEWORK_SLUGS } from '../frameworks/slugs.js'
import type { FrameworkSlug } from '../frameworks/slugs.js'
import type { StackResult } from '../detect/stack.js'
import type { TestFileResult } from '../detect/tests.js'

export interface FrameworkConfirmInput {
  stackResult: StackResult
  testFiles: TestFileResult[]
  yesMode: boolean
}

export interface FrameworkConfirmResult {
  confirmedFrameworks: FrameworkSlug[]
  userNotes: string
}

// Order slugs by category: unit → bdd → e2e → api → security
const ORDERED_SLUGS: FrameworkSlug[] = [
  ...FRAMEWORK_BY_CATEGORY.unit,
  ...FRAMEWORK_BY_CATEGORY.bdd,
  ...FRAMEWORK_BY_CATEGORY.e2e,
  ...FRAMEWORK_BY_CATEGORY.api,
  ...FRAMEWORK_BY_CATEGORY.security,
]

function categoryForSlug(slug: FrameworkSlug): string {
  for (const [cat, slugs] of Object.entries(FRAMEWORK_BY_CATEGORY)) {
    if ((slugs as readonly string[]).includes(slug)) return cat
  }
  return 'unit'
}

export async function confirmFrameworks(input: FrameworkConfirmInput): Promise<FrameworkConfirmResult> {
  const { stackResult, testFiles, yesMode } = input

  const detectedSlugs = stackResult.allFrameworks.map((fw) => fw.slug as FrameworkSlug)

  if (detectedSlugs.length === 0) {
    log.info('No test frameworks detected automatically.')
  } else {
    // Build file count map
    const fileCountMap = new Map<string, number>(testFiles.map((tf) => [tf.slug, tf.count]))
    const summaryLines = detectedSlugs.map((slug) => {
      const count = fileCountMap.get(slug)
      const countStr = count !== undefined && count > 0 ? ` (${count} files)` : ''
      return `  • ${slug}${countStr}`
    })
    log.info(`Detected frameworks:\n${summaryLines.join('\n')}`)
  }

  if (yesMode) {
    return {
      confirmedFrameworks: detectedSlugs,
      userNotes: '',
    }
  }

  // Build multiselect options
  const options = ORDERED_SLUGS.map((slug) => ({
    value: slug,
    label: `${slug}  [${categoryForSlug(slug)}]`,
    hint: detectedSlugs.includes(slug) ? 'detected' : undefined,
  }))

  const selected = await multiselect({
    message: 'Confirm frameworks in use (space to toggle, enter to confirm):',
    options,
    initialValues: detectedSlugs,
    required: false,
  })

  if (isCancel(selected)) {
    cancel('Setup cancelled.')
    process.exit(0)
  }

  const userNotesResult = await text({
    message: 'Any notes about your testing setup? (optional)',
    placeholder: '',
  })

  if (isCancel(userNotesResult)) {
    cancel('Setup cancelled.')
    process.exit(0)
  }

  // Validate selected values are valid FrameworkSlug
  const confirmedFrameworks = (selected as string[]).filter((s): s is FrameworkSlug =>
    (FRAMEWORK_SLUGS as readonly string[]).includes(s),
  )

  return {
    confirmedFrameworks,
    userNotes: (userNotesResult as string) ?? '',
  }
}
