import type { MainEvents } from '../types/index.js'

/** IPC channel names, shared by the main process and the preload bridge. */
export const CH = {
  snapshotGet: 'app:snapshot.get',
  settingsUpdate: 'app.settings.update',
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

  soundPickFile: 'sound.pickFile',
  soundImport: 'sound.import',
  soundLink: 'sound.link',
  soundProbe: 'sound.probe',
  soundTest: 'sound.test',
  soundRelink: 'sound.relink',
  soundUpdate: 'sound.update',
  soundRemove: 'sound.remove',
  soundSetDefault: 'sound.setDefault',

  holidayAdd: 'holiday.add',
  holidayRemove: 'holiday.remove',

  logGet: 'log.get',
  logClear: 'log.clear',

  backupExport: 'backup.export',
  backupImport: 'backup.import',
  dataReset: 'data.reset',
  dataReveal: 'data.reveal',

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
  logAppended: 'log:appended',
  toast: 'toast:show',
  themeChanged: 'theme:changed'
} as const

/** Maps the typed event names used in the interface to their channel names. */
export const EVENT_CHANNEL: Record<keyof MainEvents, string> = {
  'app:snapshot': EV.snapshot,
  'clock:tick': EV.clockTick,
  'log:appended': EV.logAppended,
  'toast:show': EV.toast,
  'theme:changed': EV.themeChanged
}
