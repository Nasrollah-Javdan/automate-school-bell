import { app } from 'electron'
import { join } from 'node:path'

/**
 * All application data lives inside the per-user app data folder.
 * Nothing is ever written outside of it, and nothing leaves the machine.
 */

export const getDataDir = (): string => app.getPath('userData')

export const getSoundsDir = (): string => join(getDataDir(), 'sounds')

export const getStateFile = (): string => join(getDataDir(), 'state.json')

export const getLogFile = (): string => join(getDataDir(), 'activity-log.json')

export const getBackupDir = (): string => join(getDataDir(), 'backups')
