import { app } from 'electron'
import type { AppState } from '../../types/index.js'
import { ParseError, parseAppState } from '../../shared/validate.js'
import { errorMessage, writeJsonFileAtomic } from './jsonFile.js'

export const BACKUP_APP_ID = 'ds-school-bell'
export const BACKUP_FORMAT_VERSION = 1

export interface BackupPayload {
  app: typeof BACKUP_APP_ID
  formatVersion: number
  appVersion: string
  exportedAt: string
  state: AppState
}

export const backupFileName = (): string => 'DS-SchoolBell-Backup.json'

export function buildBackup(state: AppState): BackupPayload {
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: app.getVersion(),
    exportedAt: new Date().toISOString(),
    state
  }
}

export async function writeBackupFile(file: string, state: AppState): Promise<void> {
  await writeJsonFileAtomic(file, buildBackup(state))
}

export function parseBackup(raw: unknown): AppState {
  if (typeof raw !== 'object' || raw === null) throw new ParseError('file is not a JSON object')
  const record = raw as Record<string, unknown>

  if (record.app !== BACKUP_APP_ID) throw new ParseError('file is not a DS School Bell backup')
  const formatVersion = typeof record.formatVersion === 'number' ? record.formatVersion : 0
  if (formatVersion > BACKUP_FORMAT_VERSION) throw new ParseError('backup format is too new')

  return parseAppState(record.state).value
}

/** Convenience wrapper that never throws; the message is safe to show to a user. */
export function readBackupSafe(raw: unknown): { state: AppState | null; error: string | null } {
  try {
    return { state: parseBackup(raw), error: null }
  } catch (error) {
    return { state: null, error: errorMessage(error) }
  }
}
