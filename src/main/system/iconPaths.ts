import { join } from 'node:path'
import { app } from 'electron'

/**
 * Where the runtime images live.
 *
 * The tray icon and the window icon are read from disk with
 * `nativeImage.createFromPath`, which cannot see inside the asar. They are
 * therefore shipped as extra resources, i.e. next to the executable, and this
 * module is the single place that knows how to find them in a packaged build as
 * well as in development.
 */

/** Folder that holds `tray.png`, `tray@2x.png` and `icon.png`. */
function imageDir(): string {
  if (app.isPackaged) return process.resourcesPath
  // In development the project root is the app path and the files live in
  // `resources/`.
  return join(app.getAppPath(), 'resources')
}

export const trayIconPath = (): string => join(imageDir(), 'tray.png')

export const trayHiDpiIconPath = (): string => join(imageDir(), 'tray@2x.png')

export const appIconPath = (): string => join(imageDir(), 'icon.png')
