import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { app, dialog, shell } from 'electron'
import type { AppState, LanguageCode } from '../../types/index.js'
import type { MessageKey } from '../../i18n/index.js'
import { translate } from '../../i18n/index.js'
import { AppError } from '../../shared/errors.js'
import { backupFileName, parseBackup, writeBackupFile } from '../storage/backupService.js'
import { errorMessage } from '../storage/jsonFile.js'
import { getDataDir } from '../storage/paths.js'
import type { AppServices } from './types.js'
import type { StateService } from './stateService.js'

/** Operations that need a native dialog or touch the file system directly. */
export class SystemService {
  constructor(
    private readonly services: AppServices,
    private readonly state: StateService
  ) {}

  private get lang(): LanguageCode {
    return this.services.store.get().settings.language
  }

  private t(key: MessageKey): string {
    return translate(this.lang, key)
  }

  async pickSoundFile(): Promise<string | null> {
    const window = this.services.windows.instance
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: this.t('sound.filterTitle'),
          properties: ['openFile'],
          filters: [
            { name: this.t('sound.filterTitle'), extensions: ['mp3', 'wav', 'ogg', 'oga', 'flac'] },
            { name: this.t('sound.filters.all'), extensions: ['*'] }
          ]
        })
      : await dialog.showOpenDialog({
          title: this.t('sound.filterTitle'),
          properties: ['openFile'],
          filters: [{ name: this.t('sound.filterTitle'), extensions: ['mp3', 'wav', 'ogg', 'oga', 'flac'] }]
        })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0] ?? null
  }

  async playTestBell(): Promise<void> {
    await this.services.scheduler.playTestBell()
  }

  stopAudio(): void {
    this.services.audio.stop()
  }

  async exportBackup(): Promise<string | null> {
    const window = this.services.windows.instance
    const defaultPath = `${app.getPath('documents')}/${backupFileName()}`
    const result = window
      ? await dialog.showSaveDialog(window, {
          title: this.t('settings.backupExport'),
          defaultPath,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
      : await dialog.showSaveDialog({
          title: this.t('settings.backupExport'),
          defaultPath,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })

    if (result.canceled || !result.filePath) return null

    try {
      await writeBackupFile(result.filePath, this.services.store.get())
    } catch (error) {
      throw new AppError('backup.importFailed', { error: errorMessage(error) })
    }

    this.services.log.append('log.backup.created', 'success')
    this.services.toast({ level: 'success', code: 'settings.backupDone' })
    return result.filePath
  }

  async importBackup(): Promise<AppState | null> {
    const window = this.services.windows.instance
    const options = {
      title: this.t('settings.backupImport'),
      properties: ['openFile' as const],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) return null
    const file = result.filePaths[0]
    if (!file) return null

    let parsed: AppState
    try {
      const raw = await readFile(file, 'utf8')
      parsed = parseBackup(JSON.parse(raw))
    } catch (error) {
      const message = errorMessage(error)
      const code = message.includes('newer') || message.includes('too new') ? 'backup.tooNew' : 'backup.invalidFile'
      throw new AppError(code, { error: message })
    }

    const confirmed = await this.confirm('settings.restoreConfirm')
    if (!confirmed) return null

    const state = this.state.replaceState(parsed, 'log.backup.restored')
    this.services.toast({ level: 'success', code: 'settings.restoreDone' })
    return state
  }

  async resetAll(): Promise<AppState> {
    const confirmed = await this.confirm('settings.resetConfirm')
    if (!confirmed) return this.services.store.get()
    const state = await this.state.resetAll()
    this.services.toast({ level: 'success', code: 'settings.resetDone' })
    return state
  }

  async confirm(message: MessageKey): Promise<boolean> {
    const window = this.services.windows.instance
    const options = {
      type: 'warning' as const,
      title: this.t('dialog.confirmTitle'),
      message: this.t(message),
      buttons: [this.t('common.cancel'), this.t('common.confirm')],
      defaultId: 1,
      cancelId: 0,
      noLink: true
    }
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options)
    return result.response === 1
  }

  revealDataFolder(): void {
    void shell.openPath(getDataDir())
  }

  /** Human readable path for error messages and tooltips. */
  dataFolderLabel(): string {
    return basename(getDataDir())
  }
}