import { join } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { appIconPath } from '../system/iconPaths.js'

/**
 * The single user-facing window.
 *
 * Closing or minimizing sends the window to the system tray instead of
 * quitting, so the bell engine keeps running.
 */
export class WindowManager {
  private window: BrowserWindow | null = null
  private quitting = false

  constructor(private readonly options: { closeToTray: () => boolean; minimizeToTray: () => boolean }) {}

  get instance(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null
  }

  get isQuitting(): boolean {
    return this.quitting
  }

  prepareToQuit(): void {
    this.quitting = true
  }

  create(backgroundColor: string, startHidden: boolean): BrowserWindow {
    if (this.instance) return this.instance as BrowserWindow

    const window = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 960,
      minHeight: 620,
      show: false,
      backgroundColor,
      autoHideMenuBar: true,
      title: 'DS School Bell',
      icon: appIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        webviewTag: false
      }
    })

    this.window = window
    this.applySecurity(window)

    window.once('ready-to-show', () => {
      if (!startHidden) this.show()
    })

    window.on('close', (event) => {
      if (this.quitting || !this.options.closeToTray()) return
      event.preventDefault()
      this.hide()
    })

    window.on('minimize', () => {
      if (this.options.minimizeToTray()) this.hide()
    })

    window.on('closed', () => {
      this.window = null
    })

    const devServer = process.env.ELECTRON_RENDERER_URL
    if (!app.isPackaged && devServer) {
      void window.loadURL(devServer)
      window.webContents.openDevTools({ mode: 'detach' })
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return window
  }

  show(): void {
    const window = this.instance
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  hide(): void {
    const window = this.instance
    if (!window) return
    if (window.isVisible()) window.hide()
  }

  minimize(): void {
    const window = this.instance
    if (!window) return
    window.minimize()
  }

  focusMain(): void {
    this.show()
  }

  /** Block navigation and popups — the app is fully local. */
  private applySecurity(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })

    window.webContents.on('will-navigate', (event, url) => {
      const current = window.webContents.getURL()
      if (url !== current) event.preventDefault()
    })

    window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  }
}
