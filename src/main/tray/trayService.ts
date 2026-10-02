import { join } from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'
import type { LanguageCode, SystemMode } from '../../types/index.js'
import { translate } from '../../i18n/index.js'

export type TrayCommand = 'open' | 'toggle' | 'test' | 'exit'

export interface TrayOptions {
  getLanguage: () => LanguageCode
  getMode: () => SystemMode
  onCommand: (command: TrayCommand) => void
}

/** System tray icon and menu — the fastest way to control the bell system. */
export class TrayService {
  private tray: Tray | null = null

  constructor(private readonly options: TrayOptions) {}

  create(): void {
    if (this.tray) return
    const image = this.createImage()
    this.tray = new Tray(image)
    this.tray.setIgnoreDoubleClickEvents(true)
    this.tray.on('click', () => this.options.onCommand('open'))
    this.tray.on('double-click', () => this.options.onCommand('open'))
    this.update()
  }

  private createImage(): Electron.NativeImage {
    const image = nativeImage.createFromPath(join(__dirname, '../../resources/tray.png'))
    if (image.isEmpty()) return image
    const size = app.isPackaged || process.platform !== 'linux' ? 16 : 22
    return image.resize({ width: size, height: size, quality: 'best' })
  }

  /** Rebuild the menu so labels always match the current language and state. */
  update(nextMode?: SystemMode): void {
    if (!this.tray) return
    const lang = this.options.getLanguage()
    const mode = nextMode ?? this.options.getMode()
    const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
      translate(lang, key, params)

    const toggleLabel =
      mode === 'active' ? t('tray.pause') : mode === 'paused' ? t('tray.resume') : t('tray.start')

    const menu = Menu.buildFromTemplate([
      {
        label: t('app.name'),
        enabled: false
      },
      { type: 'separator' },
      { label: t('tray.open'), click: () => this.options.onCommand('open') },
      { label: toggleLabel, click: () => this.options.onCommand('toggle') },
      { label: t('tray.testBell'), click: () => this.options.onCommand('test') },
      { type: 'separator' },
      { label: t('tray.exit'), click: () => this.options.onCommand('exit') }
    ])

    this.tray.setContextMenu(menu)
    this.tray.setToolTip(
      mode === 'active'
        ? t('tray.tooltipActive')
        : mode === 'paused'
          ? t('tray.tooltipPaused')
          : t('tray.tooltipDisabled')
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
