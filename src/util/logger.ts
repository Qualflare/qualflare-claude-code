/**
 * TTY-friendly logger that wraps @clack/prompts log functions.
 * Uses picocolors for colour (available as transitive dep of @clack/prompts).
 */

import { log } from '@clack/prompts'
import pc from 'picocolors'

export const logger = {
  info(msg: string): void {
    log.info(msg)
  },

  success(msg: string): void {
    log.success(msg)
  },

  warn(msg: string): void {
    log.warn(msg)
  },

  error(msg: string): void {
    log.error(msg)
  },

  step(msg: string): void {
    log.step(msg)
  },

  wrote(filePath: string): void {
    log.step(pc.green(`  wrote: ${filePath}`))
  },

  appended(filePath: string): void {
    log.step(pc.green(`  appended: ${filePath}`))
  },

  skipped(filePath: string): void {
    log.step(pc.dim(`  skipped: ${filePath} (already up to date)`))
  },

  exists(filePath: string): void {
    log.step(pc.dim(`  exists: ${filePath} (skipping — customize to your needs)`))
  },
}
