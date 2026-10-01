import { app, dialog } from 'electron'
import { getDataDir } from '../storage/paths.js'

const LOG_PREFIX = '[main]'

let dialogShownAt = 0
const DIALOG_THROTTLE_MS = 30_000

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.message}`
  return String(error)
}

function report(title: string, message: string): void {
  console.error(`${LOG_PREFIX} ${title}: ${message}`)
  const now = Date.now()
  if (now - dialogShownAt < DIALOG_THROTTLE_MS) return
  dialogShownAt = now
  try {
    dialog.showErrorBox(title, message)
  } catch {
    /* never let error reporting crash the app */
  }
}

/**
 * Last line of defence: an unexpected error is reported to the user, but the
 * process keeps running so the bell schedule is not interrupted.
 */
export function installGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    report('Unexpected error', `${error.message}\n\nThe bell system is still running.`)
  })

  process.on('unhandledRejection', (reason: unknown) => {
    report('Unexpected error', `${describe(reason)}\n\nThe bell system is still running.`)
  })

  process.on('uncaughtExceptionMonitor', (error: Error, origin: string) => {
    console.error(`${LOG_PREFIX} uncaught (${origin}):`, error)
  })
}

/** Fatal startup failures: explain what happened and where the data lives. */
export function reportFatalStartupError(title: string, message: string): void {
  const dataDir = (() => {
    try {
      return getDataDir()
    } catch {
      return '(unknown)'
    }
  })()
  dialog.showErrorBox(title, `${message}\n\nData folder:\n${dataDir}`)
  console.error(`${LOG_PREFIX} fatal:`, title, message)
  app.exit(1)
}