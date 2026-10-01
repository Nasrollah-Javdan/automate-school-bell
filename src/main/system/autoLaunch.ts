import { app } from 'electron'

/**
 * "Start with Windows".
 *
 * Uses the Windows Run registry entry (HKCU) through Electron's login item API.
 * Only the packaged application can register itself, so in development the
 * setting is accepted but not applied.
 */
export const AUTOSTART_ARG = '--autostart'

export function supportsAutoLaunch(): boolean {
  return app.isPackaged
}

export function isAutoLaunchEnabled(): boolean {
  if (!app.isPackaged) return false
  try {
    return app.getLoginItemSettings().openAtLogin
  } catch {
    return false
  }
}

export interface AutoLaunchResult {
  ok: boolean
  error: string | null
}

export function setAutoLaunch(enabled: boolean): AutoLaunchResult {
  if (!app.isPackaged) return { ok: true, error: null }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      args: enabled ? [AUTOSTART_ARG] : []
    })
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** True when the app was launched by Windows, not by the user. */
export function launchedAtStartup(): boolean {
  return process.argv.includes(AUTOSTART_ARG)
}