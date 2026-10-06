import { app } from 'electron'

/**
 * "Start with Windows".
 *
 * Uses the Windows Run registry entry (HKCU) through Electron's login item API.
 * Only the packaged application can register itself, so in development the
 * setting is accepted but not applied.
 */
export const AUTOSTART_ARG = '--autostart'

/**
 * Name of the `HKEY_CURRENT_USER\...\Run` value this app owns.
 *
 * Electron defaults to `app.getName()`, but the installer writes the very same
 * entry, so both spell it out explicitly to stay in step — otherwise Windows
 * ends up with two auto-start entries and switching it off in the settings
 * would not remove the one the installer created.
 */
export const AUTOSTART_ENTRY_NAME = app.getName()

export function supportsAutoLaunch(): boolean {
  return app.isPackaged
}

export function isAutoLaunchEnabled(): boolean {
  if (!app.isPackaged) return false
  try {
    // On Windows this compares the Run entry against the given path and
    // arguments, defaulting to *no* arguments. Reading it without `--autostart`
    // would never match what setAutoLaunch wrote and would always report off.
    return app.getLoginItemSettings({ path: process.execPath, args: [AUTOSTART_ARG] }).openAtLogin
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
      args: enabled ? [AUTOSTART_ARG] : [],
      name: AUTOSTART_ENTRY_NAME
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
