import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSnapshot,
  Bell,
  IpcResult,
  MainApi,
  MainEvents,
  SystemMode,
  Unsubscribe,
  Weekday
} from '../types/index.js'
import { CH, EVENT_CHANNEL } from '../shared/channels.js'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

/**
 * The only bridge between the interface and the operating system.
 * It is intentionally small: every function maps to one business operation.
 */
const api: MainApi = {
  getSnapshot: () => invoke<AppSnapshot>(CH.snapshotGet),

  setSystemMode: (mode: SystemMode) => invoke<AppSnapshot>(CH.systemSetMode, mode),
  playTestBell: () => invoke<IpcResult>(CH.audioPlayTest),
  stopAudio: () => invoke<void>(CH.audioStop),

  addBell: (scheduleId: string, bell: Omit<Bell, 'id'>) => invoke<AppSnapshot>(CH.bellAdd, scheduleId, bell),
  updateBell: (scheduleId: string, bell: Bell) => invoke<AppSnapshot>(CH.bellUpdate, scheduleId, bell),
  removeBell: (scheduleId: string, bellId: string) => invoke<AppSnapshot>(CH.bellRemove, scheduleId, bellId),
  moveBell: (scheduleId: string, bellId: string, direction: 'up' | 'down') =>
    invoke<AppSnapshot>(CH.bellMove, scheduleId, bellId, direction),

  createSchedule: (name: string) => invoke<AppSnapshot>(CH.scheduleCreate, name),
  renameSchedule: (id: string, name: string) => invoke<AppSnapshot>(CH.scheduleRename, id, name),
  deleteSchedule: (id: string) => invoke<AppSnapshot>(CH.scheduleDelete, id),
  setActiveSchedule: (id: string) => invoke<AppSnapshot>(CH.scheduleSetActive, id),
  updateScheduleDays: (id: string, days: Weekday[]) => invoke<AppSnapshot>(CH.scheduleUpdateDays, id, days),

  window: {
    minimize: () => invoke<void>(CH.windowMinimize),
    hide: () => invoke<void>(CH.windowHide),
    show: () => invoke<void>(CH.windowShow)
  },

  on: <K extends keyof MainEvents>(event: K, listener: (payload: MainEvents[K]) => void): Unsubscribe => {
    const channel = EVENT_CHANNEL[event]
    const handler = (_ipcEvent: unknown, payload: MainEvents[K]): void => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.off(channel, handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
