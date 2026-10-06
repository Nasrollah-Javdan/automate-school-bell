/**
 * Defensive parsing of persisted / imported data.
 *
 * Everything that comes from disk or from a user supplied backup file goes
 * through here, so a corrupted or hand edited file can never crash the app.
 */

import type {
  AppState,
  Bell,
  LogCode,
  LogEntry,
  LogLevel,
  MissedBellPolicy,
  ScheduleProfile,
  Settings,
  Sound,
  SystemMode,
  ThemeMode,
  UiScale,
  Weekday
} from '../types/index.js'
import { APP_STATE_VERSION } from '../types/index.js'
import { isValidTime } from '../utils/time.js'
import { createDefaultState, defaultSettings } from './defaults.js'

export class ParseError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const asId = (value: unknown, prefix: string): string => {
  const text = asString(value).trim()
  return text ? text.slice(0, 64) : `${prefix}_restored_${Math.random().toString(36).slice(2, 8)}`
}

const UI_SCALES: readonly UiScale[] = [100, 125, 150, 175, 200]
const THEMES: readonly ThemeMode[] = ['system', 'light', 'dark']
const MODES: readonly SystemMode[] = ['active', 'paused', 'disabled']
const POLICIES: readonly MissedBellPolicy[] = ['ignore', 'playIfRecent']

function parseWeekdays(value: unknown, fallback: Weekday[]): Weekday[] {
  if (!Array.isArray(value)) return [...fallback]
  const days = value
    .map((day) => asNumber(day, -1))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) as Weekday[]
  const unique = Array.from(new Set(days)).sort((a, b) => a - b)
  return unique
}

export function sanitizeSettings(raw: unknown, lang: 'fa' | 'en'): Settings {
  const base = defaultSettings(lang)
  if (!isRecord(raw)) return base

  const scale = asNumber(raw.uiScale, base.uiScale) as UiScale
  const theme = THEMES.includes(raw.theme as ThemeMode) ? (raw.theme as ThemeMode) : base.theme
  const language = raw.language === 'en' || raw.language === 'fa' ? raw.language : base.language
  const policy = POLICIES.includes(raw.missedBellPolicy as MissedBellPolicy)
    ? (raw.missedBellPolicy as MissedBellPolicy)
    : base.missedBellPolicy

  return {
    language,
    theme,
    uiScale: UI_SCALES.includes(scale) ? scale : base.uiScale,
    startWithWindows: asBoolean(raw.startWithWindows, base.startWithWindows),
    startMinimized: asBoolean(raw.startMinimized, base.startMinimized),
    minimizeToTray: asBoolean(raw.minimizeToTray, base.minimizeToTray),
    closeToTray: asBoolean(raw.closeToTray, base.closeToTray),
    volume: Math.round(clamp(asNumber(raw.volume, base.volume), 0, 100)),
    defaultSoundId: typeof raw.defaultSoundId === 'string' ? raw.defaultSoundId : null,
    missedBellPolicy: policy,
    missedGraceMinutes: Math.round(clamp(asNumber(raw.missedGraceMinutes, base.missedGraceMinutes), 1, 60)),
    activeScheduleId: asString(raw.activeScheduleId)
  }
}

export function sanitizeBell(raw: unknown): Bell | null {
  if (!isRecord(raw)) return null
  const time = asString(raw.time)
  if (!isValidTime(time)) return null
  return {
    id: asId(raw.id, 'b'),
    time,
    title: asString(raw.title).slice(0, 120).trim() || '—',
    soundId: typeof raw.soundId === 'string' && raw.soundId ? raw.soundId : null,
    enabled: asBoolean(raw.enabled, true),
    note: asString(raw.note).slice(0, 240)
  }
}

export function sanitizeSound(raw: unknown): Sound | null {
  if (!isRecord(raw)) return null
  const source = raw.source === 'external' ? 'external' : 'library'
  const externalPath = typeof raw.externalPath === 'string' && raw.externalPath ? raw.externalPath : null
  const fileName = typeof raw.fileName === 'string' && raw.fileName ? raw.fileName : null
  if (source === 'external' && !externalPath) return null
  if (source === 'library' && !fileName) return null

  const duration =
    raw.durationSec === null || raw.durationSec === undefined ? null : asNumber(raw.durationSec, 0)

  return {
    id: asId(raw.id, 'snd'),
    name: asString(raw.name).slice(0, 120).trim() || 'Sound',
    source,
    fileName,
    externalPath,
    volume: Math.round(clamp(asNumber(raw.volume, 100), 0, 100)),
    durationSec: duration !== null && duration > 0 ? Math.round(duration) : null,
    createdAt: asNumber(raw.createdAt, 0)
  }
}

export function sanitizeSchedule(raw: unknown): ScheduleProfile | null {
  if (!isRecord(raw)) return null
  const bells = Array.isArray(raw.bells)
    ? raw.bells
        .map(sanitizeBell)
        .filter((bell): bell is Bell => bell !== null)
        .sort((a, b) => a.time.localeCompare(b.time))
    : []

  return {
    id: asId(raw.id, 's'),
    name: asString(raw.name).slice(0, 80).trim() || 'Schedule',
    bells,
    activeWeekdays: parseWeekdays(raw.activeWeekdays, [0, 1, 2, 3, 4])
  }
}

const FIRED_ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}_[A-Za-z0-9_-]+$/
const MAX_FIRED_IDS = 600

const LOG_LEVELS: readonly LogLevel[] = ['info', 'success', 'warn', 'error']
const LOG_CODES: readonly LogCode[] = [
  'log.app.started',
  'log.app.quit',
  'log.app.reset',
  'log.bell.played',
  'log.bell.missed',
  'log.bell.disabled',
  'log.bell.soundMissing',
  'log.bell.playbackFailed',
  'log.bell.updated',
  'log.bell.added',
  'log.bell.removed',
  'log.system.activated',
  'log.system.paused',
  'log.system.disabled',
  'log.system.test',
  'log.schedule.switched',
  'log.schedule.created',
  'log.schedule.renamed',
  'log.schedule.deleted',
  'log.sound.added',
  'log.sound.removed',
  'log.backup.created',
  'log.backup.restored',
  'log.settings.restored',
  'log.settings.updated',
  'log.clock.changed',
  'log.resume.recalculated'
]

export function sanitizeLogEntry(raw: unknown): LogEntry | null {
  if (!isRecord(raw)) return null
  const at = asNumber(raw.at, 0)
  if (!at) return null
  const code = raw.code as LogCode
  if (!LOG_CODES.includes(code)) return null
  const level = LOG_LEVELS.includes(raw.level as LogLevel) ? (raw.level as LogLevel) : 'info'
  const params: Record<string, string | number> = {}
  if (isRecord(raw.params)) {
    for (const [key, value] of Object.entries(raw.params)) {
      if (typeof value === 'string') params[key] = value.slice(0, 200)
      else if (typeof value === 'number' && Number.isFinite(value)) params[key] = value
    }
  }
  return { id: asId(raw.id, 'l'), at, level, code, params }
}

export interface ParseResult<T> {
  value: T
  /** True when the input was unusable and defaults were used instead. */
  recovered: boolean
  notes: string[]
}

/** Parse any persisted/imported application state into a valid {@link AppState}. */
export function parseAppState(raw: unknown): ParseResult<AppState> {
  const notes: string[] = []
  if (!isRecord(raw)) {
    return { value: createDefaultState(), recovered: true, notes: ['state: not an object'] }
  }

  const version = asNumber(raw.version, 0)
  if (version > APP_STATE_VERSION) {
    throw new ParseError(`Backup version ${version} is newer than supported version ${APP_STATE_VERSION}`)
  }

  const settings = sanitizeSettings(raw.settings, 'fa')
  const schedules = (Array.isArray(raw.schedules) ? raw.schedules : [])
    .map(sanitizeSchedule)
    .filter((schedule): schedule is ScheduleProfile => schedule !== null)
  const sounds = (Array.isArray(raw.sounds) ? raw.sounds : [])
    .map(sanitizeSound)
    .filter((sound): sound is Sound => sound !== null)

  // Older builds stored a holiday list. It is dropped on purpose: if a stale
  // entry is left behind, `parseAppState` would have to carry it forever.
  if (Array.isArray(raw.holidays) && raw.holidays.length > 0) {
    notes.push('state: the removed holiday list was dropped')
  }

  const soundIds = new Set(sounds.map((sound) => sound.id))
  if (settings.defaultSoundId && !soundIds.has(settings.defaultSoundId)) {
    settings.defaultSoundId = sounds[0]?.id ?? null
    notes.push('settings: default sound was reset')
  }

  const scheduleIds = new Set(schedules.map((schedule) => schedule.id))
  const wanted = asString(raw.activeScheduleId)
  const activeScheduleId = scheduleIds.has(wanted) ? wanted : (schedules[0]?.id ?? '')
  if (!scheduleIds.has(wanted)) notes.push('state: active schedule was reset')
  settings.activeScheduleId = activeScheduleId

  for (const schedule of schedules) {
    for (const bell of schedule.bells) {
      if (bell.soundId && !soundIds.has(bell.soundId)) {
        bell.soundId = null
        notes.push(`bell ${bell.id}: sound reference was cleared`)
      }
    }
  }

  const firedIds = (Array.isArray(raw.firedIds) ? raw.firedIds : [])
    .filter((id): id is string => typeof id === 'string' && FIRED_ID_PATTERN.test(id))
    .slice(-MAX_FIRED_IDS)

  const mode = MODES.includes(raw.systemMode as SystemMode) ? (raw.systemMode as SystemMode) : 'active'

  const state: AppState = {
    version: APP_STATE_VERSION,
    settings,
    schedules,
    activeScheduleId,
    sounds,
    systemMode: mode,
    firedIds
  }

  const recovered = schedules.length === 0
  if (recovered) {
    notes.push('state: no valid schedule, falling back to the default schedule')
    state.schedules = createDefaultState(settings.language).schedules
    state.activeScheduleId = state.schedules[0].id
    state.settings.activeScheduleId = state.activeScheduleId
    if (state.sounds.length === 0) {
      const fallbackSound = createDefaultState(settings.language).sounds[0]
      state.sounds = [fallbackSound]
      state.settings.defaultSoundId = fallbackSound.id
    }
  }

  return { value: state, recovered, notes }
}

const MAX_LOG_ENTRIES = 500

export function parseLogEntries(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(sanitizeLogEntry)
    .filter((entry): entry is LogEntry => entry !== null)
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_LOG_ENTRIES)
}

export const LOG_ENTRY_LIMIT = MAX_LOG_ENTRIES
