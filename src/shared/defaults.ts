import type {
  AppState,
  Bell,
  LanguageCode,
  ScheduleProfile,
  Settings,
  Sound,
  UiScale
} from '../types/index.js'
import { APP_STATE_VERSION } from '../types/index.js'
import { translate } from '../i18n/index.js'
import { createId } from '../utils/id.js'
import { DEFAULT_ACTIVE_WEEKDAYS } from '../utils/time.js'

/**
 * File name of the bundled default bell tone, copied into the library on
 * first run. Changing it migrates existing installations — see
 * {@link LEGACY_DEFAULT_SOUND_FILES}.
 */
export const DEFAULT_SOUND_FILE = 'school-bell.mp3'

/**
 * Names earlier builds installed into the sounds folder.
 *
 * On startup these entries are dropped from the library (and their files
 * removed), because the app installed them itself and the user never edited
 * them. Renaming or deleting a user sound is never touched: only these exact
 * names, which the application owns.
 */
export const LEGACY_DEFAULT_SOUND_FILES = ['default-bell.wav'] as const

export const DEFAULT_VOLUME = 80

export function defaultSettings(lang: LanguageCode = 'fa'): Settings {
  return {
    language: lang,
    theme: 'system',
    uiScale: 100 as UiScale,
    startWithWindows: false,
    startMinimized: false,
    minimizeToTray: true,
    closeToTray: true,
    volume: DEFAULT_VOLUME,
    defaultSoundId: null,
    missedBellPolicy: 'ignore',
    missedGraceMinutes: 10,
    activeScheduleId: ''
  }
}

/** The sample day shipped with a fresh installation. */
export function defaultBells(lang: LanguageCode): Bell[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)
  const rows: Array<[string, string]> = [
    ['08:00', t('default.bell.schoolStart')],
    ['08:45', t('default.bell.first')],
    ['09:30', t('default.bell.second')],
    ['10:15', t('default.bell.break')],
    ['11:00', t('default.bell.third')]
  ]
  return rows.map(([time, title]) => ({
    id: createId('b'),
    time,
    title,
    soundId: null,
    enabled: true,
    note: ''
  }))
}

export function defaultSchedule(lang: LanguageCode): ScheduleProfile {
  return {
    id: createId('s'),
    name: translate(lang, 'default.scheduleName'),
    bells: defaultBells(lang),
    activeWeekdays: [...DEFAULT_ACTIVE_WEEKDAYS]
  }
}

export function defaultSound(lang: LanguageCode): Sound {
  return {
    id: createId('snd'),
    name: translate(lang, 'default.soundName'),
    source: 'library',
    fileName: DEFAULT_SOUND_FILE,
    externalPath: null,
    volume: 100,
    // Measured from the file on first run; `null` means "not read yet".
    durationSec: null,
    createdAt: 0
  }
}

export function createDefaultState(lang: LanguageCode = 'fa'): AppState {
  const schedule = defaultSchedule(lang)
  const sound = defaultSound(lang)
  const settings = defaultSettings(lang)
  settings.defaultSoundId = sound.id

  return {
    version: APP_STATE_VERSION,
    settings,
    schedules: [schedule],
    activeScheduleId: schedule.id,
    sounds: [sound],
    systemMode: 'active',
    firedIds: []
  }
}
