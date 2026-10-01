import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { app } from 'electron'
import type {
  AppState,
  Bell,
  Holiday,
  JalaliDate,
  LogLevel,
  ScheduleProfile,
  Settings,
  Sound,
  SystemMode,
  Weekday
} from '../../types/index.js'
import { AppError } from '../../shared/errors.js'
import { createDefaultState } from '../../shared/defaults.js'
import { sanitizeSettings } from '../../shared/validate.js'
import { sortBells } from '../../shared/today.js'
import { isValidJalaliDate, jalaliKey } from '../../utils/jalali.js'
import { isValidTime } from '../../utils/time.js'
import { createId } from '../../utils/id.js'
import { allowLinkedPath, forgetLinkedPath } from '../audio/audioProtocol.js'
import { isSupportedSoundFile, soundFilePath, importSoundFile, removeSoundFile } from '../storage/soundLibrary.js'
import { getSoundsDir } from '../storage/paths.js'
import { isAutoLaunchEnabled, setAutoLaunch } from '../system/autoLaunch.js'
import { DEFAULT_SOUND_FILE, defaultSound } from '../../shared/defaults.js'
import { ensureDir, fileExists } from '../storage/jsonFile.js'
import type { AppServices } from './types.js'

const SYSTEM_MODES: readonly SystemMode[] = ['active', 'paused', 'disabled']

/**
 * Every mutation of the persistent state lives here.
 *
 * Rules for all operations:
 *  - validate input before touching the store;
 *  - keep the invariant "the active schedule id always exists";
 *  - write one activity log entry so the user can see what happened;
 *  - let the caller refresh the interface once, at the end.
 */
export class StateService {
  constructor(private readonly services: AppServices) {}

  /* ---------------------------------------------------------------- *
   * Settings
   * ---------------------------------------------------------------- */

  updateSettings(patch: Partial<Settings>): AppState {
    const current = this.services.store.get()

    // Start-with-Windows is a Windows registry setting, not just a preference.
    let startWithWindows = current.settings.startWithWindows
    if (patch.startWithWindows !== undefined && supportsAutoLaunchOnThisPlatform()) {
      const result = setAutoLaunch(patch.startWithWindows)
      if (result.ok) {
        startWithWindows = patch.startWithWindows
      } else {
        const message = result.error ?? 'unknown error'
        this.services.toast({ level: 'warn', code: 'settings.startupUnavailable', params: { error: message } })
        startWithWindows = isAutoLaunchEnabled()
      }
    }

    const next = sanitizeSettings({ ...current.settings, ...patch, startWithWindows }, current.settings.language)
    this.services.theme.apply(next.theme)

    const interesting =
      next.language !== current.settings.language ||
      next.theme !== current.settings.theme ||
      next.startWithWindows !== current.settings.startWithWindows
    if (interesting) this.services.log.append('log.settings.updated', 'info')

    return this.services.store.update((draft) => {
      draft.settings = next
    })
  }

  setSystemMode(mode: SystemMode): AppState {
    if (!SYSTEM_MODES.includes(mode)) throw new AppError('common.error')
    const current = this.services.store.get()
    if (current.systemMode === mode) return current

    const code = mode === 'active' ? 'log.system.activated' : mode === 'paused' ? 'log.system.paused' : 'log.system.disabled'
    const level: LogLevel = 'info'
    this.services.log.append(code, level)

    const state = this.services.store.update((draft) => {
      draft.systemMode = mode
    })
    this.services.scheduler.recalculate()
    return state
  }

  /* ---------------------------------------------------------------- *
   * Bells
   * ---------------------------------------------------------------- */

  addBell(scheduleId: string, input: Omit<Bell, 'id'>): AppState {
    const bell = this.validateBellInput({ ...input, id: createId('b') })
    const state = this.services.store.update((draft) => {
      const schedule = this.requireSchedule(draft, scheduleId)
      schedule.bells = sortBells([...schedule.bells, bell])
    })
    this.services.log.append('log.bell.added', 'info', { title: bell.title, time: bell.time })
    return state
  }

  updateBell(scheduleId: string, bell: Bell): AppState {
    const validated = this.validateBellInput(bell)
    const state = this.services.store.update((draft) => {
      const schedule = this.requireSchedule(draft, scheduleId)
      const index = schedule.bells.findIndex((item) => item.id === bell.id)
      if (index === -1) throw new AppError('schedule.bellDelete')
      schedule.bells = sortBells(schedule.bells.map((item, i) => (i === index ? validated : item)))
    })
    this.services.log.append('log.bell.updated', 'info', { title: validated.title })
    return state
  }

  removeBell(scheduleId: string, bellId: string): AppState {
    const title =
      this.services.store.get().schedules.find((schedule) => schedule.id === scheduleId)?.bells.find((bell) => bell.id === bellId)?.title ?? ''

    const state = this.services.store.update((draft) => {
      const schedule = this.requireSchedule(draft, scheduleId)
      if (!schedule.bells.some((bell) => bell.id === bellId)) throw new AppError('common.unknown')
      schedule.bells = schedule.bells.filter((item) => item.id !== bellId)
      draft.firedIds = draft.firedIds.filter((id) => !id.endsWith(`_${bellId}`))
    })
    this.services.log.append('log.bell.removed', 'info', { title })
    return state
  }

  moveBell(scheduleId: string, bellId: string, direction: 'up' | 'down'): AppState {
    return this.services.store.update((draft) => {
      const schedule = this.requireSchedule(draft, scheduleId)
      const ordered = sortBells(schedule.bells)
      const index = ordered.findIndex((item) => item.id === bellId)
      if (index === -1) throw new AppError('common.unknown')
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= ordered.length) return

      const swapped = [...ordered]
      const current = swapped[index]
      const other = swapped[target]
      if (!current || !other) return
      // Keep the same times; only the manual order changes.
      swapped[index] = { ...other, time: current.time }
      swapped[target] = { ...current, time: other.time }
      schedule.bells = sortBells(swapped)
    })
  }

  /* ---------------------------------------------------------------- *
   * Schedules
   * ---------------------------------------------------------------- */

  createSchedule(name: string): AppState {
    const trimmed = name.trim()
    if (!trimmed) throw new AppError('schedule.profileNameEmpty')

    const id = createId('s')
    const state = this.services.store.update((draft) => {
      if (draft.schedules.some((schedule) => schedule.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new AppError('schedule.profileNameTaken')
      }
      const template = draft.schedules.find((schedule) => schedule.id === draft.activeScheduleId) ?? draft.schedules[0]
      draft.schedules.push({
        id,
        name: trimmed,
        bells: [],
        activeWeekdays: template ? [...template.activeWeekdays] : [0, 1, 2, 3, 4]
      })
      draft.activeScheduleId = id
    })
    this.services.log.append('log.schedule.created', 'info', { name: trimmed })
    return state
  }

  renameSchedule(id: string, name: string): AppState {
    const trimmed = name.trim()
    if (!trimmed) throw new AppError('schedule.profileNameEmpty')
    this.services.store.update((draft) => {
      const schedule = this.requireSchedule(draft, id)
      if (draft.schedules.some((item) => item.id !== id && item.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new AppError('schedule.profileNameTaken')
      }
      schedule.name = trimmed
    })
    this.services.log.append('log.schedule.renamed', 'info', { name: trimmed })
    return this.services.store.get()
  }

  deleteSchedule(id: string): AppState {
    const current = this.services.store.get()
    if (current.schedules.length <= 1) throw new AppError('schedule.profileLastError')

    const name = current.schedules.find((schedule) => schedule.id === id)?.name ?? ''
    const state = this.services.store.update((draft) => {
      const index = draft.schedules.findIndex((schedule) => schedule.id === id)
      if (index === -1) throw new AppError('common.unknown')
      draft.schedules.splice(index, 1)
      if (draft.activeScheduleId === id) {
        draft.activeScheduleId = draft.schedules[0]?.id ?? ''
        draft.settings.activeScheduleId = draft.activeScheduleId
      }
    })
    this.services.log.append('log.schedule.deleted', 'info', { name })
    return state
  }

  setActiveSchedule(id: string): AppState {
    const name = this.services.store.get().schedules.find((schedule) => schedule.id === id)?.name ?? ''
    const state = this.services.store.update((draft) => {
      this.requireSchedule(draft, id)
      draft.activeScheduleId = id
      draft.settings.activeScheduleId = id
    })
    this.services.log.append('log.schedule.switched', 'info', { name })
    this.services.scheduler.recalculate()
    return state
  }

  updateScheduleDays(id: string, days: Weekday[]): AppState {
    const unique = Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))) as Weekday[]
    if (unique.length === 0) throw new AppError('schedule.daysRequired')
    return this.services.store.update((draft) => {
      const schedule = this.requireSchedule(draft, id)
      schedule.activeWeekdays = unique.sort((a, b) => a - b)
    })
  }

  /* ---------------------------------------------------------------- *
   * Sounds
   * ---------------------------------------------------------------- */

  /** Copy a file into the app folder (most reliable option). */
  async addSoundFromFile(sourcePath: string, mode: 'import' | 'link'): Promise<AppState> {
    if (!isSupportedSoundFile(sourcePath)) throw new AppError('sounds.invalidFormat')

    let sound: Sound
    try {
      if (mode === 'import') {
        const imported = await importSoundFile(sourcePath, getSoundsDir())
        sound = {
          id: createId('snd'),
          name: imported.name,
          source: 'library',
          fileName: imported.fileName,
          externalPath: null,
          volume: 100,
          durationSec: null,
          createdAt: Date.now()
        }
      } else {
        allowLinkedPath(sourcePath)
        sound = {
          id: createId('snd'),
          name: sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'sound',
          source: 'external',
          fileName: null,
          externalPath: sourcePath,
          volume: 100,
          durationSec: null,
          createdAt: Date.now()
        }
      }
    } catch (error) {
      throw new AppError('sounds.importFailed', { error: error instanceof Error ? error.message : String(error) })
    }

    this.services.store.update((draft) => {
      draft.sounds.push(sound)
    })
    this.services.log.append('log.sound.added', 'info', { name: sound.name })
    void this.probeSoundDuration(sound.id)
    return this.services.store.get()
  }

  /** Point an existing sound at a new file (repair for moved/deleted files). */
  async relinkSound(soundId: string, sourcePath: string): Promise<AppState> {
    if (!isSupportedSoundFile(sourcePath)) throw new AppError('sounds.invalidFormat')
    const previous = this.services.store.get().sounds.find((sound) => sound.id === soundId)
    if (!previous) throw new AppError('common.unknown')

    let imported: { fileName: string; name: string }
    try {
      imported = await importSoundFile(sourcePath, getSoundsDir())
    } catch (error) {
      throw new AppError('sounds.importFailed', { error: error instanceof Error ? error.message : String(error) })
    }

    const state = this.services.store.update((draft) => {
      const target = draft.sounds.find((sound) => sound.id === soundId)
      if (!target) throw new AppError('common.unknown')
      target.source = 'library'
      target.fileName = imported.fileName
      target.externalPath = null
      target.name = imported.name
    })

    // Remove the copy that is no longer referenced.
    await removeSoundFile(previous, getSoundsDir()).catch(() => undefined)
    if (previous.source === 'external' && previous.externalPath) forgetLinkedPath(previous.externalPath)
    void this.probeSoundDuration(soundId)
    return state
  }

  updateSound(sound: Sound): AppState {
    return this.services.store.update((draft) => {
      const index = draft.sounds.findIndex((item) => item.id === sound.id)
      if (index === -1) throw new AppError('common.unknown')
      const current = draft.sounds[index]
      if (!current) throw new AppError('common.unknown')
      draft.sounds[index] = {
        ...current,
        name: sound.name.trim().slice(0, 80) || current.name,
        volume: Math.max(0, Math.min(100, Math.round(sound.volume)))
      }
    })
  }

  async removeSound(soundId: string): Promise<AppState> {
    const soundsDir = getSoundsDir()
    const sound = this.services.store.get().sounds.find((item) => item.id === soundId)
    if (!sound) throw new AppError('common.unknown')

    const state = this.services.store.update((draft) => {
      draft.sounds = draft.sounds.filter((item) => item.id !== soundId)
      for (const schedule of draft.schedules) {
        for (const bell of schedule.bells) {
          if (bell.soundId === soundId) bell.soundId = null
        }
      }
      if (draft.settings.defaultSoundId === soundId) {
        draft.settings.defaultSoundId = draft.sounds[0]?.id ?? null
      }
    })

    try {
      await removeSoundFile(sound, soundsDir)
    } catch (error) {
      console.error('[sounds] could not delete file:', error)
    }
    if (sound.source === 'external' && sound.externalPath) forgetLinkedPath(sound.externalPath)

    this.services.log.append('log.sound.removed', 'info', { name: sound.name })
    return state
  }

  setDefaultSound(soundId: string | null): AppState {
    return this.services.store.update((draft) => {
      if (soundId && !draft.sounds.some((sound) => sound.id === soundId)) throw new AppError('common.unknown')
      draft.settings.defaultSoundId = soundId
    })
  }

  async probeSoundDuration(soundId: string): Promise<number | null> {
    const sound = this.services.store.get().sounds.find((item) => item.id === soundId)
    if (!sound) return null
    try {
      const durationSec = await this.services.audio.probe(soundFilePath(sound, getSoundsDir()))
      this.services.store.update((draft) => {
        const target = draft.sounds.find((item) => item.id === soundId)
        if (target) target.durationSec = durationSec
      })
      return durationSec
    } catch {
      this.services.store.update((draft) => {
        const target = draft.sounds.find((item) => item.id === soundId)
        if (target) target.durationSec = null
      })
      return null
    }
  }

  /* ---------------------------------------------------------------- *
   * Holidays
   * ---------------------------------------------------------------- */

  addHoliday(input: { jalali: JalaliDate; title: string }): AppState {
    if (!isValidJalaliDate(input.jalali)) throw new AppError('holidays.invalidDate')
    const title = input.title.trim().slice(0, 120)
    if (!title) throw new AppError('holidays.titleEmpty')
    const key = jalaliKey(input.jalali)

    const state = this.services.store.update((draft) => {
      if (draft.holidays.some((holiday) => jalaliKey(holiday.jalali) === key)) {
        throw new AppError('holidays.duplicate')
      }
      const holiday: Holiday = { id: createId('h'), jalali: input.jalali, title }
      draft.holidays = [...draft.holidays, holiday].sort(compareHolidays)
    })
    this.services.log.append('log.holiday.added', 'info', { title })
    return state
  }

  removeHoliday(id: string): AppState {
    const holiday = this.services.store.get().holidays.find((item) => item.id === id)
    const state = this.services.store.update((draft) => {
      draft.holidays = draft.holidays.filter((item) => item.id !== id)
    })
    if (holiday) this.services.log.append('log.holiday.removed', 'info', { title: holiday.title })
    return state
  }

  /* ---------------------------------------------------------------- *
   * Whole-state operations
   * ---------------------------------------------------------------- */

  /** Used by "import backup" and "reset". */
  replaceState(state: AppState, code: 'log.backup.restored' | 'log.app.reset'): AppState {
    const next = this.services.store.replace(state)
    this.services.log.clear()
    this.services.log.append(code, 'success')
    this.services.theme.apply(next.settings.theme)
    this.services.scheduler.recalculate()
    return next
  }

  /** Delete everything and start over with the factory defaults. */
  async resetAll(): Promise<AppState> {
    const soundsDir = getSoundsDir()
    await rm(soundsDir, { recursive: true, force: true }).catch(() => undefined)
    this.services.log.clear()
    return this.replaceState(createDefaultState(this.services.store.get().settings.language), 'log.app.reset')
  }

  /**
   * Make sure the bundled default bell tone is available.
   *
   * It is copied into the user's sounds folder so the user can replace, back up
   * or delete it like any other sound. Packaged builds ship it in
   * `resources/` next to the app; in development it lives in the project.
   */
  async ensureDefaultSoundFile(): Promise<void> {
    const state = this.services.store.get()
    const alreadyInstalled = state.sounds.some((sound) => sound.fileName === DEFAULT_SOUND_FILE)
    const target = join(getSoundsDir(), DEFAULT_SOUND_FILE)
    if (alreadyInstalled && (await fileExists(target))) return
    if (await fileExists(target)) return

    const source = bundledSoundPath()
    if (!source || !(await fileExists(source))) {
      console.warn('[audio] the bundled default bell sound is missing from this build')
      return
    }

    await ensureDir(getSoundsDir())
    try {
      await copyFile(source, target)
    } catch (error) {
      console.error('[audio] could not install the default bell sound:', error)
      return
    }

    // Only add it to the library when it is not registered yet.
    if (!alreadyInstalled) {
      this.services.store.update((draft) => {
        if (draft.sounds.some((sound) => sound.fileName === DEFAULT_SOUND_FILE)) return
        const sound = defaultSound(draft.settings.language)
        draft.sounds.unshift(sound)
        draft.settings.defaultSoundId = sound.id
      })
    }
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  private requireSchedule(state: AppState, id: string): ScheduleProfile {
    const schedule = state.schedules.find((item) => item.id === id)
    if (!schedule) throw new AppError('common.unknown')
    return schedule
  }

  private validateBellInput(bell: Bell): Bell {
    const time = bell.time.trim()
    if (!isValidTime(time)) throw new AppError('schedule.bellTimeInvalid')
    const title = bell.title.trim().slice(0, 120)
    if (!title) throw new AppError('schedule.bellTitleEmpty')
    return {
      id: bell.id,
      time,
      title,
      soundId: bell.soundId,
      enabled: bell.enabled !== false,
      note: bell.note.slice(0, 240)
    }
  }
}

function compareHolidays(a: Holiday, b: Holiday): number {
  return a.jalali.year - b.jalali.year || a.jalali.month - b.jalali.month || a.jalali.day - b.jalali.day
}

function supportsAutoLaunchOnThisPlatform(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
}

/**
 * Location of the bell tone shipped with the application.
 *
 * Packaged builds put it next to the executable (`process.resourcesPath`),
 * while in development it is in the project `resources` folder.
 */
function bundledSoundPath(): string | null {
  const candidates = [
    join(process.resourcesPath ?? '', DEFAULT_SOUND_FILE),
    join(app.getAppPath(), 'resources', DEFAULT_SOUND_FILE)
  ]
  return candidates.find((path) => path.length > 0) ?? null
}