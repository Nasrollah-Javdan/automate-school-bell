import { app, powerMonitor } from 'electron'
import { registerAudioProtocol, registerAudioSchemePrivileges } from './audio/audioProtocol.js'
import { AudioService } from './audio/audioService.js'
import { registerIpc } from './ipc/registerIpc.js'
import { EV } from '../shared/channels.js'
import type { ToastPayload } from '../types/index.js'
import { SchedulerEngine } from './scheduler/schedulerEngine.js'
import { ensureDir, fileExists } from './storage/jsonFile.js'
import { AppStore } from './storage/appStore.js'
import { LogStore } from './storage/logStore.js'
import { getDataDir, getSoundsDir } from './storage/paths.js'
import { installGlobalErrorHandlers, reportFatalStartupError } from './system/errorGuard.js'
import { ThemeService } from './system/themeService.js'
import { launchedAtStartup } from './system/autoLaunch.js'
import { pushClockTick, pushLog, pushSnapshot, pushTheme } from './services/snapshot.js'
import { StateService } from './services/stateService.js'
import { SystemService } from './services/systemService.js'
import type { AppServices } from './services/types.js'
import { makeToastId } from './services/types.js'
import { TrayService, type TrayCommand } from './tray/trayService.js'
import { WindowManager } from './window/mainWindow.js'

const APP_ID = 'com.ds.schoolbell'
const CLOCK_HEARTBEAT_MS = 30_000

let services: AppServices | null = null
let trayAvailable = false
let heartbeat: NodeJS.Timeout | null = null

async function bootstrap(): Promise<void> {
  installGlobalErrorHandlers()

  await ensureDir(getDataDir())
  await ensureDir(getSoundsDir())

  const { store, recovered, notes, error, created } = await AppStore.load()
  const log = await LogStore.load()

  if (recovered || error) {
    console.warn('[startup] state file was recovered:', { recovered, notes, error })
  }

  const firstRun = created

  const audio = new AudioService()
  const theme = new ThemeService()
  const windows = new WindowManager({
    closeToTray: () => store.get().settings.closeToTray,
    minimizeToTray: () => store.get().settings.minimizeToTray
  })

  const context = { store, log, audio, theme }

  const scheduler = new SchedulerEngine(context.store, context.log, context.audio, {
    getSoundsDir,
    onStateChanged: () => refresh(),
    onToast: (toast) => pushToast(toast),
    soundExists: (filePath) => fileExists(filePath)
  })

  const tray = new TrayService({
    getLanguage: () => store.get().settings.language,
    getMode: () => store.get().systemMode,
    onCommand: (command) => void handleTrayCommand(command)
  })

  services = {
    store,
    log,
    audio,
    scheduler,
    theme,
    windows,
    tray,
    refresh,
    toast: pushToast
  }

  const state = new StateService(services)
  const system = new SystemService(services, state)

  theme.apply(store.get().settings.theme)
  registerAudioProtocol()
  registerIpc(services, state, system)

  store.subscribe(() => refresh())
  log.subscribe((entries) => pushLog(services as AppServices, entries))
  theme.onChange((effectiveDark) => pushTheme(services as AppServices, effectiveDark))

  await state.ensureDefaultSoundFile()

  const settings = store.get().settings
  const startHidden = launchedAtStartup() && settings.startMinimized
  windows.create(theme.isDark() ? '#14161a' : '#f5f6f8', startHidden)

  trayAvailable = createTray()
  tray.update(store.get().systemMode)

  scheduler.start()
  log.append('log.app.started', 'info')

  heartbeat = setInterval(() => {
    if (services) pushClockTick(services)
  }, CLOCK_HEARTBEAT_MS)
  heartbeat.unref?.()

  powerMonitor.on('resume', () => void scheduler.recalculateAfterWake('resume'))
  powerMonitor.on('unlock-screen', () => void scheduler.recalculateAfterWake('manual'))

  if (firstRun) {
    pushToast({ level: 'info', code: 'firstRun.title', actionId: 'schedule' })
  }
}

function createTray(): boolean {
  if (!services) return false
  try {
    services.tray.create()
    return true
  } catch (error) {
    console.error('[tray] system tray is not available:', error)
    return false
  }
}

function refresh(): void {
  if (!services) return
  pushSnapshot(services)
  services.tray.update()
}

function pushToast(toast: Omit<ToastPayload, 'id'>): void {
  const window = services?.windows.instance
  window?.webContents.send(EV.toast, { ...toast, id: makeToastId() })
}

async function handleTrayCommand(command: TrayCommand): Promise<void> {
  if (!services) return
  const { windows, store, tray, scheduler } = services

  switch (command) {
    case 'open':
      windows.show()
      break
    case 'toggle': {
      const next = store.get().systemMode === 'active' ? 'paused' : 'active'
      new StateService(services).setSystemMode(next)
      tray.update(next)
      refresh()
      break
    }
    case 'test':
      try {
        await scheduler.playTestBell()
      } catch {
        /* the log entry and the toast already explain the problem */
      }
      break
    case 'exit': {
      const confirmed = await new SystemService(services, new StateService(services)).confirm(
        'dialog.exitMessage'
      )
      if (confirmed) quit()
      break
    }
  }
}

function quit(): void {
  if (!services) {
    app.quit()
    return
  }
  services.windows.prepareToQuit()
  app.quit()
}

/* ------------------------------------------------------------------ *
 * Application lifecycle
 * ------------------------------------------------------------------ */

app.setAppUserModelId(APP_ID)
// Bells must be able to play without a user gesture (the app often runs from
// the tray with no visible window).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
registerAudioSchemePrivileges()

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    services?.windows.show()
  })

  app
    .whenReady()
    .then(() => bootstrap())
    .catch((error: unknown) => {
      reportFatalStartupError('DS School Bell', error instanceof Error ? error.message : String(error))
    })

  // A tray application keeps running when its window is closed.
  app.on('window-all-closed', () => {
    if (!trayAvailable) app.quit()
  })

  app.on('activate', () => {
    services?.windows.show()
  })

  app.on('before-quit', () => {
    services?.windows.prepareToQuit()
    services?.scheduler.stop()
    if (heartbeat) clearInterval(heartbeat)
    const { store, log, audio, tray } = services ?? {}
    void Promise.all([store?.flush(), log?.flush()]).catch(() => undefined)
    tray?.destroy()
    audio?.dispose()
  })

  app.on('will-quit', () => {
    void Promise.all([services?.store.flush(), services?.log.flush()]).catch(() => undefined)
  })
}
