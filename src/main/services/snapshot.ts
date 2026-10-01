import { existsSync } from 'node:fs'
import { app } from 'electron'
import type { AppSnapshot, LogEntry } from '../../types/index.js'
import { buildTodayView } from '../../shared/today.js'
import { EV } from '../../shared/channels.js'
import { soundFilePath } from '../storage/soundLibrary.js'
import { getDataDir, getSoundsDir } from '../storage/paths.js'
import type { AppServices } from './types.js'

export function buildSnapshot(services: AppServices): AppSnapshot {
  const state = services.store.get()
  const now = new Date()
  const view = buildTodayView(state, now, now)
  const soundsDir = getSoundsDir()

  const soundFiles: AppSnapshot['soundFiles'] = {}
  for (const sound of state.sounds) {
    const path = soundFilePath(sound, soundsDir)
    soundFiles[sound.id] = { path, available: path ? existsSync(path) : false }
  }

  return {
    state,
    dayInfo: view.dayInfo,
    todayBells: view.todayBells,
    effectiveDark: services.theme.isDark(),
    appVersion: app.getVersion(),
    soundsDir,
    dataDir: getDataDir(),
    soundFiles
  }
}

/** Send the current snapshot to the interface (no-op before the window exists). */
export function pushSnapshot(services: AppServices): void {
  const window = services.windows.instance
  if (!window) return
  window.webContents.send(EV.snapshot, buildSnapshot(services))
}

export function pushClockTick(services: AppServices): void {
  const window = services.windows.instance
  if (!window) return
  window.webContents.send(EV.clockTick, { now: Date.now() })
}

export function pushLog(services: AppServices, entries: LogEntry[]): void {
  const window = services.windows.instance
  if (!window || entries.length === 0) return
  window.webContents.send(EV.logAppended, entries)
}

export function pushTheme(services: AppServices, effectiveDark: boolean): void {
  const window = services.windows.instance
  if (!window) return
  window.webContents.send(EV.themeChanged, { effectiveDark })
}