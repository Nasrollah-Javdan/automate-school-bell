import { ipcMain } from 'electron'
import type {
  AppSnapshot,
  AppState,
  Bell,
  IpcResult,
  LogEntry,
  Settings,
  Sound,
  SystemMode,
  Weekday
} from '../../types/index.js'
import { CH } from '../../shared/channels.js'
import { isAppError } from '../../shared/errors.js'
import { translate } from '../../i18n/index.js'
import { buildSnapshot } from '../services/snapshot.js'
import type { AppServices } from '../services/types.js'
import type { StateService } from '../services/stateService.js'
import type { SystemService } from '../services/systemService.js'

/**
 * Wires renderer requests to the services.
 *
 * Two conventions:
 *  - calls that change state return a fresh snapshot, so the interface never
 *    has to guess what happened;
 *  - operations that can fail for user reasons (dialogs, playback) return an
 *    `IpcResult` with a message already translated into the user's language.
 */
export function registerIpc(services: AppServices, state: StateService, system: SystemService): void {
  const language = () => services.store.get().settings.language

  const describe = (error: unknown): string => {
    if (isAppError(error)) return translate(language(), error.code, error.params)
    return error instanceof Error ? error.message : String(error)
  }

  const handle = (channel: string, listener: (...args: never[]) => unknown): void => {
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => listener(...(args as never[])))
  }

  /** State mutation: refresh everything and answer with the new snapshot. */
  const mutate =
    <A extends unknown[]>(listener: (...args: A) => AppState | Promise<AppState>) =>
    async (...args: A): Promise<AppSnapshot> => {
      try {
        await listener(...args)
      } catch (error) {
        // Translated for the user, with the original error kept as the cause.
        throw new Error(describe(error), { cause: error })
      }
      services.refresh()
      return buildSnapshot(services)
    }

  /** Operation with an expected, user visible failure mode. */
  const attempt = async <T>(listener: () => Promise<T> | T): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await listener() }
    } catch (error) {
      return { ok: false, error: describe(error) }
    }
  }

  /* ---------------- read ---------------- */

  handle(CH.snapshotGet, () => buildSnapshot(services))

  handle(CH.logGet, () => services.log.get() as LogEntry[])

  handle(CH.windowShow, () => services.windows.show())
  handle(CH.windowHide, () => services.windows.hide())
  handle(CH.windowMinimize, () => services.windows.minimize())
  handle(CH.dataReveal, () => system.revealDataFolder())

  /* ---------------- system ---------------- */

  handle(
    CH.settingsUpdate,
    mutate((patch: Partial<Settings>) => state.updateSettings(patch))
  )

  handle(
    CH.systemSetMode,
    mutate((mode: SystemMode) => state.setSystemMode(mode))
  )

  handle(CH.audioPlayTest, () => attempt(() => system.playTestBell()))
  handle(CH.audioStop, () => attempt(() => system.stopAudio()))

  handle(CH.logClear, () => {
    services.log.clear()
    services.refresh()
    return true
  })

  /* ---------------- bells ---------------- */

  handle(
    CH.bellAdd,
    mutate((scheduleId: string, bell: Omit<Bell, 'id'>) => state.addBell(scheduleId, bell))
  )

  handle(
    CH.bellUpdate,
    mutate((scheduleId: string, bell: Bell) => state.updateBell(scheduleId, bell))
  )

  handle(
    CH.bellRemove,
    mutate((scheduleId: string, bellId: string) => state.removeBell(scheduleId, bellId))
  )

  handle(
    CH.bellMove,
    mutate((scheduleId: string, bellId: string, direction: 'up' | 'down') =>
      state.moveBell(scheduleId, bellId, direction)
    )
  )

  /* ---------------- schedules ---------------- */

  handle(
    CH.scheduleCreate,
    mutate((name: string) => state.createSchedule(name))
  )
  handle(
    CH.scheduleRename,
    mutate((id: string, name: string) => state.renameSchedule(id, name))
  )
  handle(
    CH.scheduleDelete,
    mutate((id: string) => state.deleteSchedule(id))
  )
  handle(
    CH.scheduleSetActive,
    mutate((id: string) => state.setActiveSchedule(id))
  )

  handle(
    CH.scheduleUpdateDays,
    mutate((id: string, days: Weekday[]) => state.updateScheduleDays(id, days))
  )

  /* ---------------- sounds ---------------- */

  handle(CH.soundPickFile, () => attempt(() => system.pickSoundFile()))

  handle(CH.soundImport, () =>
    attempt(async () => {
      const file = await system.pickSoundFile()
      if (!file) return null
      await state.addSoundFromFile(file, 'import')
      services.refresh()
      return services.store.get().sounds.at(-1) ?? null
    })
  )

  handle(CH.soundLink, () =>
    attempt(async () => {
      const file = await system.pickSoundFile()
      if (!file) return null
      await state.addSoundFromFile(file, 'link')
      services.refresh()
      return services.store.get().sounds.at(-1) ?? null
    })
  )

  handle(CH.soundProbe, (soundId: string) => attempt(() => state.probeSoundDuration(soundId)))

  handle(CH.soundTest, (soundId: string) => attempt(() => services.scheduler.playSoundById(soundId)))

  handle(CH.soundRelink, (soundId: string) =>
    attempt(async () => {
      const file = await system.pickSoundFile()
      if (!file) return null
      await state.relinkSound(soundId, file)
      services.refresh()
      return services.store.get().sounds.find((sound) => sound.id === soundId) ?? null
    })
  )

  handle(
    CH.soundUpdate,
    mutate((sound: Sound) => state.updateSound(sound))
  )

  handle(
    CH.soundRemove,
    mutate((soundId: string) => state.removeSound(soundId))
  )

  handle(
    CH.soundSetDefault,
    mutate((soundId: string | null) => state.setDefaultSound(soundId))
  )

  /* ---------------- backup / reset ---------------- */

  handle(CH.backupExport, () => attempt(() => system.exportBackup()))

  handle(CH.backupImport, () =>
    attempt(async () => {
      const result = await system.importBackup()
      if (!result) return false
      services.refresh()
      return true
    })
  )

  handle(CH.dataReset, () =>
    mutate(async () => {
      await system.resetAll()
      return services.store.get()
    })
  )
}
