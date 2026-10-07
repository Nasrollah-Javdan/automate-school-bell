import { dialog } from 'electron'
import type { LanguageCode } from '../../types/index.js'
import type { MessageKey } from '../../i18n/index.js'
import { translate } from '../../i18n/index.js'
import type { AppServices } from './types.js'

/** Operations that need a native dialog or touch the file system directly. */
export class SystemService {
  constructor(private readonly services: AppServices) {}

  private get lang(): LanguageCode {
    return this.services.store.get().settings.language
  }

  private t(key: MessageKey): string {
    return translate(this.lang, key)
  }

  async playTestBell(): Promise<void> {
    await this.services.scheduler.playTestBell()
  }

  stopAudio(): void {
    this.services.audio.stop()
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
}
