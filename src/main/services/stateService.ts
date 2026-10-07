import { copyFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { AppState, Bell, LogLevel, ScheduleProfile, SystemMode, Weekday } from '../../types/index.js'
import { AppError } from '../../shared/errors.js'
import { sortBells } from '../../shared/today.js'
import { isValidTime } from '../../utils/time.js'
import { createId } from '../../utils/id.js'
import { getSoundsDir } from '../storage/paths.js'
import { DEFAULT_SOUND_FILE, LEGACY_DEFAULT_SOUND_FILES, defaultSound } from '../../shared/defaults.js'
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
   * System mode
   * ---------------------------------------------------------------- */

  setSystemMode(mode: SystemMode): AppState {
    if (!SYSTEM_MODES.includes(mode)) throw new AppError('common.error')
    const current = this.services.store.get()
    if (current.systemMode === mode) return current

    const code =
      mode === 'active'
        ? 'log.system.activated'
        : mode === 'paused'
          ? 'log.system.paused'
          : 'log.system.disabled'
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
      this.services.store
        .get()
        .schedules.find((schedule) => schedule.id === scheduleId)
        ?.bells.find((bell) => bell.id === bellId)?.title ?? ''

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
      const template =
        draft.schedules.find((schedule) => schedule.id === draft.activeScheduleId) ?? draft.schedules[0]
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
      if (
        draft.schedules.some((item) => item.id !== id && item.name.toLowerCase() === trimmed.toLowerCase())
      ) {
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
    const unique = Array.from(
      new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))
    ) as Weekday[]
    if (unique.length === 0) throw new AppError('schedule.daysRequired')
    return this.services.store.update((draft) => {
      const schedule = this.requireSchedule(draft, id)
      schedule.activeWeekdays = unique.sort((a, b) => a - b)
    })
  }

  /* ---------------------------------------------------------------- *
   * Default bell tone
   * ---------------------------------------------------------------- */

  /**
   * Make sure the bundled default bell tone is available.
   *
   * It is copied into the user's sounds folder so the user can replace, back up
   * or delete it like any other sound. Packaged builds ship it in
   * `resources/` next to the app; in development it lives in the project.
   *
   * Runs on every start: it installs the file when it is missing and migrates
   * entries left behind by older builds.
   */
  async ensureDefaultSoundFile(): Promise<void> {
    await this.removeLegacyDefaultSounds()

    const state = this.services.store.get()
    const alreadyInstalled = state.sounds.some((sound) => sound.fileName === DEFAULT_SOUND_FILE)
    const target = join(getSoundsDir(), DEFAULT_SOUND_FILE)
    if (await fileExists(target)) return

    const source = await findBundledSound()
    if (!source) {
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

  /**
   * Drop library entries that older builds installed as the default bell.
   *
   * They are recognised by name only, which is safe: a renamed or user-supplied
   * sound keeps its own file name and is never removed here.
   */
  private async removeLegacyDefaultSounds(): Promise<void> {
    const stale = this.services.store
      .get()
      .sounds.filter(
        (sound) =>
          sound.source === 'library' &&
          sound.fileName !== null &&
          (LEGACY_DEFAULT_SOUND_FILES as readonly string[]).includes(sound.fileName)
      )
    if (stale.length === 0) return

    const ids = stale.map((sound) => sound.id)
    this.services.store.update((draft) => {
      draft.sounds = draft.sounds.filter((sound) => !ids.includes(sound.id))
      for (const schedule of draft.schedules) {
        for (const bell of schedule.bells) {
          if (bell.soundId && ids.includes(bell.soundId)) bell.soundId = null
        }
      }
      if (draft.settings.defaultSoundId && ids.includes(draft.settings.defaultSoundId)) {
        draft.settings.defaultSoundId = draft.sounds[0]?.id ?? null
      }
    })

    for (const sound of stale) {
      if (sound.fileName) {
        await rm(join(getSoundsDir(), sound.fileName), { force: true }).catch(() => undefined)
      }
    }
    console.log('[audio] replaced an old default bell with the current one')
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

/**
 * Location of the bell tone shipped with the application.
 *
 * Packaged builds put it next to the executable (`process.resourcesPath`),
 * while in development it is in the project `resources` folder. Several
 * candidates are checked because the layout differs between the two.
 */
export function bundledSoundCandidates(): string[] {
  const roots = [
    process.resourcesPath,
    process.resourcesPath ? join(process.resourcesPath, 'app.asar.unpacked', 'resources') : null,
    process.resourcesPath ? join(process.resourcesPath, 'extraResources') : null,
    app.getAppPath(),
    process.cwd()
  ]

  const candidates: string[] = []
  for (const root of roots) {
    if (!root) continue
    candidates.push(join(root, DEFAULT_SOUND_FILE))
    candidates.push(join(root, 'resources', DEFAULT_SOUND_FILE))
  }
  return candidates
}

/** First bundled bell tone that actually exists on disk. */
async function findBundledSound(): Promise<string | null> {
  for (const candidate of bundledSoundCandidates()) {
    if (await fileExists(candidate)) return candidate
  }
  return null
}
