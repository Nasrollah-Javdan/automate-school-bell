import type { ToastPayload } from '../../types/index.js'
import { createId } from '../../utils/id.js'
import type { AppStore } from '../storage/appStore.js'
import type { LogStore } from '../storage/logStore.js'
import type { AudioService } from '../audio/audioService.js'
import type { SchedulerEngine } from '../scheduler/schedulerEngine.js'
import type { ThemeService } from '../system/themeService.js'
import type { WindowManager } from '../window/mainWindow.js'
import type { TrayService } from '../tray/trayService.js'

/** Everything the IPC layer and services need, wired together once at startup. */
export interface AppServices {
  store: AppStore
  log: LogStore
  audio: AudioService
  scheduler: SchedulerEngine
  theme: ThemeService
  windows: WindowManager
  tray: TrayService
  /** Push a fresh state snapshot to the interface and refresh the tray. */
  refresh: () => void
  /** Show a toast in the interface. */
  toast: (toast: Omit<ToastPayload, 'id'>) => void
}

export type ServiceContext = Pick<AppServices, 'store' | 'log' | 'audio' | 'scheduler' | 'theme'>

export function makeToastId(): string {
  return createId('toast')
}