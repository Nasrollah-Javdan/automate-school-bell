/**
 * Shared domain types.
 *
 * These types are the contract between the main process (business logic),
 * the preload bridge (typed IPC) and the renderer (UI).
 */
import type { MessageKey } from '../i18n/index.js'

/* ------------------------------------------------------------------ *
 * Language / layout
 * ------------------------------------------------------------------ */

export type LanguageCode = 'fa' | 'en'
export type Direction = 'rtl' | 'ltr'

/* ------------------------------------------------------------------ *
 * Appearance
 * ------------------------------------------------------------------ */

export type ThemeMode = 'system' | 'light' | 'dark'

/** Real UI scale applied to the renderer root font size (all sizes use rem). */
export type UiScale = 100 | 125 | 150 | 175 | 200

/* ------------------------------------------------------------------ *
 * Calendar
 * ------------------------------------------------------------------ */

export interface JalaliDate {
  year: number
  /** 1..12 */
  month: number
  /** 1..31 */
  day: number
}

/**
 * Weekday index using the Iranian week order.
 * 0 = Saturday … 6 = Friday
 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const WEEKDAY_COUNT = 7
export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/* ------------------------------------------------------------------ *
 * Bell system
 * ------------------------------------------------------------------ */

/** Run state of the bell engine. */
export type SystemMode = 'active' | 'paused' | 'disabled'

export interface Bell {
  id: string
  /** Local time in `HH:mm` (24h). */
  time: string
  /** Free text, entered by the user (never translated). */
  title: string
  /** Reference to {@link Sound.id}; null means "use the default sound". */
  soundId: string | null
  enabled: boolean
  note: string
}

export interface ScheduleProfile {
  id: string
  name: string
  bells: Bell[]
  /** Weekdays on which this profile's bells ring. */
  activeWeekdays: Weekday[]
}

/** Where the audio file lives. */
export type SoundSource = 'library' | 'external'

export interface Sound {
  id: string
  /** Display name (file name without extension). */
  name: string
  source: SoundSource
  /** File name inside the app sounds folder (library sounds). */
  fileName: string | null
  /** Absolute path on disk (external sounds). */
  externalPath: string | null
  /** Per-sound volume multiplier, 0..100. */
  volume: number
  durationSec: number | null
  createdAt: number
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

/** What to do with a bell whose time was missed while the app was not running. */
export type MissedBellPolicy = 'ignore' | 'playIfRecent'

export interface Settings {
  language: LanguageCode
  theme: ThemeMode
  uiScale: UiScale
  startWithWindows: boolean
  startMinimized: boolean
  minimizeToTray: boolean
  closeToTray: boolean
  /** Master volume, 0..100. */
  volume: number
  defaultSoundId: string | null
  missedBellPolicy: MissedBellPolicy
  /** Grace window for `missedBellPolicy`, 1..60 minutes. */
  missedGraceMinutes: number
  activeScheduleId: string
}

/* ------------------------------------------------------------------ *
 * Persistent application state (everything except the log)
 * ------------------------------------------------------------------ */

export const APP_STATE_VERSION = 1

export interface AppState {
  version: number
  settings: Settings
  schedules: ScheduleProfile[]
  activeScheduleId: string
  sounds: Sound[]
  holidays: Holiday[]
  systemMode: SystemMode
  /**
   * Ids of already played bells, e.g. `2026-09-27_09:30_b1`.
   * Used to guarantee a bell never plays twice for the same occurrence.
   */
  firedIds: string[]
}

export interface Holiday {
  id: string
  jalali: JalaliDate
  title: string
}

/* ------------------------------------------------------------------ *
 * Activity log
 * ------------------------------------------------------------------ */

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

/** Log messages are stored as a key + params so they can be shown in both languages. */
export type LogCode =
  | 'log.app.started'
  | 'log.app.quit'
  | 'log.app.reset'
  | 'log.bell.played'
  | 'log.bell.missed'
  | 'log.bell.disabled'
  | 'log.bell.soundMissing'
  | 'log.bell.playbackFailed'
  | 'log.bell.updated'
  | 'log.bell.added'
  | 'log.bell.removed'
  | 'log.system.activated'
  | 'log.system.paused'
  | 'log.system.disabled'
  | 'log.system.test'
  | 'log.schedule.switched'
  | 'log.schedule.created'
  | 'log.schedule.renamed'
  | 'log.schedule.deleted'
  | 'log.schedule.defaultChanged'
  | 'log.holiday.skipped'
  | 'log.holiday.added'
  | 'log.holiday.removed'
  | 'log.sound.added'
  | 'log.sound.removed'
  | 'log.backup.created'
  | 'log.backup.restored'
  | 'log.settings.restored'
  | 'log.settings.updated'
  | 'log.clock.changed'
  | 'log.resume.recalculated'

export interface LogEntry {
  id: string
  /** Epoch milliseconds. */
  at: number
  level: LogLevel
  code: LogCode
  params: Record<string, string | number>
}

/* ------------------------------------------------------------------ *
 * Derived / computed views (never persisted)
 * ------------------------------------------------------------------ */

export type BellStatus = 'done' | 'next' | 'upcoming' | 'skipped'

export interface TodayBell {
  id: string
  time: string
  title: string
  note: string
  soundId: string | null
  enabled: boolean
  status: BellStatus
}

/** Extra information about the day, shown in the dashboard. */
export type DayKind = 'normal' | 'holiday' | 'inactiveWeekday'

export interface DayInfo {
  kind: DayKind
  holidayTitle: string | null
  activeWeekdays: Weekday[]
}

export interface EngineStatus {
  mode: SystemMode
  /** ISO `YYYY-MM-DD` of the currently tracked day. */
  day: string
  nextBellTime: string | null
  nextBellTitle: string | null
  nextBellId: string | null
  /** First bell time of the day (for the "no more bells today" state). */
  isDayOver: boolean
  dayInfo: DayInfo
  todayBells: TodayBell[]
}

/* ------------------------------------------------------------------ *
 * IPC contract
 * ------------------------------------------------------------------ */

export type Unsubscribe = () => void

export interface SoundFileStatus {
  /** Absolute path the application will try to play. */
  path: string
  /** False when the file has been moved, renamed or deleted. */
  available: boolean
}

export interface AppSnapshot {
  state: AppState
  dayInfo: DayInfo
  todayBells: TodayBell[]
  effectiveDark: boolean
  appVersion: string
  /** Absolute path of the folder holding the library sounds. */
  soundsDir: string
  dataDir: string
  /** File availability per sound id, so missing files can be highlighted. */
  soundFiles: Record<string, SoundFileStatus>
}

export interface IpcResult<T = void> {
  ok: boolean
  data?: T
  error?: string
}

/** Events pushed from the main process to the renderer. */
export interface MainEvents {
  'app:snapshot': AppSnapshot
  'clock:tick': { now: number }
  'log:appended': LogEntry[]
  'toast:show': ToastPayload
  'theme:changed': { effectiveDark: boolean }
}

export interface ToastPayload {
  id: string
  level: LogLevel
  /** Translation key, so toasts follow the current interface language. */
  code: MessageKey
  params?: Record<string, string | number>
  /** Optional navigation target, e.g. open the Sounds page. */
  actionId?: string
}

export interface MainApi {
  getSnapshot(): Promise<AppSnapshot>
  updateSettings(patch: Partial<Settings>): Promise<AppSnapshot>
  setSystemMode(mode: SystemMode): Promise<AppSnapshot>
  playTestBell(): Promise<IpcResult>
  stopAudio(): Promise<void>

  addBell(scheduleId: string, bell: Omit<Bell, 'id'>): Promise<AppSnapshot>
  updateBell(scheduleId: string, bell: Bell): Promise<AppSnapshot>
  removeBell(scheduleId: string, bellId: string): Promise<AppSnapshot>
  moveBell(scheduleId: string, bellId: string, direction: 'up' | 'down'): Promise<AppSnapshot>

  createSchedule(name: string): Promise<AppSnapshot>
  renameSchedule(id: string, name: string): Promise<AppSnapshot>
  deleteSchedule(id: string): Promise<AppSnapshot>
  setActiveSchedule(id: string): Promise<AppSnapshot>
  updateScheduleDays(id: string, days: Weekday[]): Promise<AppSnapshot>

  pickSoundFile(): Promise<IpcResult<{ path: string; name: string }>>
  importSound(): Promise<IpcResult<Sound | null>>
  /** Use a file from its original location instead of copying it into the app. */
  linkExternalSound(): Promise<IpcResult<Sound | null>>
  probeSound(soundId: string): Promise<IpcResult<number | null>>
  /** Play one specific sound file. */
  playSound(soundId: string): Promise<IpcResult>
  /** Ask the user for the file again and repair a broken sound entry. */
  relinkSound(soundId: string): Promise<IpcResult<Sound | null>>
  updateSound(sound: Sound): Promise<AppSnapshot>
  removeSound(soundId: string): Promise<AppSnapshot>
  setDefaultSound(soundId: string | null): Promise<AppSnapshot>

  addHoliday(holiday: Omit<Holiday, 'id'>): Promise<AppSnapshot>
  removeHoliday(id: string): Promise<AppSnapshot>

  getLogs(): Promise<LogEntry[]>
  clearLogs(): Promise<void>

  backupToFile(): Promise<IpcResult<{ path: string } | null>>
  restoreFromFile(): Promise<IpcResult<boolean>>
  resetAll(): Promise<AppSnapshot>
  revealDataFolder(): Promise<void>

  window: {
    minimize(): Promise<void>
    hide(): Promise<void>
    show(): Promise<void>
  }

  on<K extends keyof MainEvents>(event: K, listener: (payload: MainEvents[K]) => void): Unsubscribe
}