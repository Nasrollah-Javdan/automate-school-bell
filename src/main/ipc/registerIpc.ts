import { ipcMain } from 'electron'
import type { AppSnapshot, AppState, Bell, IpcResult, SystemMode, Weekday } from '../../types/index.js'
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

  handle(CH.windowShow, () => services.windows.show())
  handle(CH.windowHide, () => services.windows.hide())
  handle(CH.windowMinimize, () => services.windows.minimize())

  /* ---------------- system ---------------- */

  handle(
    CH.systemSetMode,
    mutate((mode: SystemMode) => state.setSystemMode(mode))
  )

  handle(CH.audioPlayTest, () => attempt(() => system.playTestBell()))
  handle(CH.audioStop, () => attempt(() => system.stopAudio()))

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
}
