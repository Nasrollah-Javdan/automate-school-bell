import type { MainEvents } from '../types/index.js'

/** IPC channel names, shared by the main process and the preload bridge. */
export const CH = {
  snapshotGet: 'app:snapshot.get',
  systemSetMode: 'app.system.mode',
  audioPlayTest: 'audio.playTest',
  audioStop: 'audio.stop',

  bellAdd: 'bell.add',
  bellUpdate: 'bell.update',
  bellRemove: 'bell.remove',
  bellMove: 'bell.move',

  scheduleCreate: 'schedule.create',
  scheduleRename: 'schedule.rename',
  scheduleDelete: 'schedule.delete',
  scheduleSetActive: 'schedule.setActive',
  scheduleUpdateDays: 'schedule.updateDays',

  windowMinimize: 'window.minimize',
  windowHide: 'window.hide',
  windowShow: 'window.show',

  /** Main → audio host window. */
  audioHostCommand: 'audioHost:command',
  /** Audio host window → main. */
  audioHostEvent: 'audioHost:event'
} as const

/** Events pushed from main to the renderer. */
export const EV = {
  snapshot: 'app:snapshot',
  clockTick: 'clock:tick',
  toast: 'toast:show',
  themeChanged: 'theme:changed'
} as const

/** Maps the typed event names used in the interface to their channel names. */
export const EVENT_CHANNEL: Record<keyof MainEvents, string> = {
  'app:snapshot': EV.snapshot,
  'clock:tick': EV.clockTick,
  'toast:show': EV.toast,
  'theme:changed': EV.themeChanged
}
