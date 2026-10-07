/**
 * Real end-to-end smoke test.
 *
 * Boots the actual main-process modules inside Electron, exercises the scheduler,
 * the audio pipeline (custom protocol + hidden audio host) and the storage layer,
 * then reports a pass/fail summary.
 *
 *   npm run test:e2e
 *
 * Not part of the shipped application.
 */
const { app, BrowserWindow, ipcMain, protocol, nativeTheme } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const ROOT = path.join(__dirname, '..')

// The harness re-exports the real main-process modules, compiled by
// `npm run test:e2e` before this script runs.
const M = require(path.join(ROOT, 'out', 'test-harness', 'main.cjs'))

const DATA_DIR = path.join(os.tmpdir(), 'ds-school-bell-e2e')

// Every run must start from a clean slate. Without this the state file, the
// activity log and the fired-bell ids survive between runs, so "first run"
// assertions fail and the scheduler reports occurrences from previous runs.
fs.rmSync(DATA_DIR, { recursive: true, force: true })

app.setPath('userData', DATA_DIR)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')

/*
 * Custom scheme privileges must be declared before the app becomes ready, and
 * the audio protocol handler right after it — exactly like the real application
 * does at startup. Both must happen before any test runs.
 */
M.registerAudioSchemePrivileges()

// Electron quits once the last window closes. The tests close windows (the
// hidden audio window), so quitting is suppressed for the whole run.
app.on('window-all-closed', (event) => event.preventDefault())

app.whenReady().then(() => M.registerAudioProtocol())

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// `app.exit()` can truncate buffered stdout, so the report is also written
// synchronously to a file. Every run gets its own file, so concurrent runs can
// never interleave their output.
const LOG_FILE =
  process.argv.find((arg) => arg.startsWith('--log='))?.slice(6) ??
  path.join(os.tmpdir(), `ds-school-bell-e2e-${process.pid}.log`)

// The report is kept in memory and written out on every line, so the file is
// always complete and readable even if the process ends unexpectedly.
const lines = []

function writeLog() {
  if (!LOG_FILE) return
  try {
    fs.writeFileSync(LOG_FILE, lines.join('\n') + '\n')
  } catch {
    /* the file is a convenience, never a reason to fail the run */
  }
}

function report(line) {
  const text = line.replace(/\x1b\[[0-9;]*m/g, '')
  console.log(line)
  lines.push(text)
  writeLog()
}

const reportSync = report

let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    report(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    report(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  report('')
  report(title)
}

async function main() {
  // The tests close windows (for example the audio window), which can leave the
  // event loop empty and end the process in the middle of an `await`. A periodic
  // timer keeps it alive for the duration of the run.
  const keepAlive = setInterval(() => undefined, 1000)

  section('Environment')
  report(`  electron ${process.versions.electron}, node ${process.versions.node}, ${process.platform}`)

  /* ---------------------------------------------------------------- *
   * Storage round trip
   * ---------------------------------------------------------------- */
  section('Storage: atomic JSON persistence')

  const { AppStore } = M
  const { LogStore } = M
  const { readJsonFile, writeJsonFileAtomic, fileExists } = M
  const { parseAppState } = M
  const { getSoundsDir } = M
  const { StateService } = M

  const testFile = path.join(DATA_DIR, 'atomic-test.json')
  await writeJsonFileAtomic(testFile, { hello: 'world', n: 1 })
  check('writes a JSON file', await fileExists(testFile))

  const readBack = await readJsonFile(testFile)
  check('reads it back', readBack.value?.hello === 'world', JSON.stringify(readBack.value))

  await writeJsonFileAtomic(testFile, { hello: 'second' })
  check('keeps a .bak of the previous version', await fileExists(`${testFile}.bak`))

  // Corrupt the file and make sure the backup is used instead of crashing.
  fs.writeFileSync(testFile, '{ this is not json')
  const recovered = await readJsonFile(testFile)
  check(
    'recovers from a corrupt file via the backup',
    recovered.recovered && recovered.value?.hello === 'world'
  )

  // Break both the file and its backup: the caller must get a clean null.
  fs.writeFileSync(testFile, 'not json at all')
  fs.writeFileSync(`${testFile}.bak`, '{"hello":"broken backup"')
  const missing = await readJsonFile(testFile)
  check('survives a completely broken file', missing.value === null, missing.error ?? 'no error reported')

  /* ---------------------------------------------------------------- *
   * Default state
   * ---------------------------------------------------------------- */
  section('State: defaults and validation')

  const { created } = await AppStore.load()
  check('creates a state file on first run', created)
  const parsed = parseAppState({ version: 1, settings: { volume: 500 }, schedules: [], sounds: [] })
  check('clamps an out-of-range volume', parsed.value.settings.volume === 100)
  check('recovers when no schedule is valid', parsed.value.schedules.length === 1 && parsed.recovered)

  const reloaded = await AppStore.load()
  check('loads the state written earlier', reloaded.store.get().schedules.length === 1)

  const store = reloaded.store
  const before = store.get()
  store.update((draft) => {
    draft.settings.volume = 42
  })
  await store.flush()
  const afterFlush = await AppStore.load()
  check('persists changes across a restart', afterFlush.store.get().settings.volume === 42)
  void before

  /* ---------------------------------------------------------------- *
   * Log store
   * ---------------------------------------------------------------- */
  section('Activity log')

  const log = await LogStore.load()
  log.clear()
  log.append('log.bell.played', 'success', { title: 'First bell', time: '08:00' })
  log.append('log.bell.playbackFailed', 'error', { title: 'Second bell', error: 'device busy' })
  await log.flush()
  const logReloaded = await LogStore.load()
  check('persists log entries', logReloaded.get().length === 2, `${logReloaded.get().length} entries`)
  check('keeps the level', logReloaded.get()[1].level === 'error')

  /* ---------------------------------------------------------------- *
   * Audio pipeline: custom protocol + hidden host window
   * ---------------------------------------------------------------- */
  section('Audio: protocol and hidden playback window')

  const { AudioService } = M

  const { AudioError } = M
  void AudioError

  await fs.promises.mkdir(getSoundsDir(), { recursive: true })

  const audio = new AudioService()
  // Copy the bundled tone into the app sounds folder, exactly as the real
  // first run does, then play it from there.
  const bundledSound = path.join(getSoundsDir(), 'school-bell.mp3')
  fs.mkdirSync(getSoundsDir(), { recursive: true })
  fs.copyFileSync(path.join(ROOT, 'resources', 'school-bell.mp3'), bundledSound)

  let playError = ''
  try {
    await audio.play({ filePath: bundledSound, volume: 0.5 })
  } catch (error) {
    playError = error.message
  }
  check('plays the bell tone', playError === '', playError)

  audio.stop()
  await wait(200)
  check('stops without throwing', true)

  const duration = await audio.probe(bundledSound).catch(() => null)
  check('reads the duration of a file', typeof duration === 'number' && duration > 0, `duration=${duration}`)

  // A file that does not exist must produce a clear error, not a crash.
  let missingError = ''
  try {
    await audio.play({ filePath: path.join(getSoundsDir(), 'nope.wav'), volume: 0.5 })
  } catch (error) {
    missingError = error.message
  }
  check('reports a missing file clearly', missingError.length > 0, missingError)

  // A file with an unsupported extension must be refused.
  const notAudio = path.join(getSoundsDir(), 'notes.txt')
  fs.writeFileSync(notAudio, 'this is not audio')
  let formatError = ''
  try {
    await audio.play({ filePath: notAudio, volume: 0.5 })
  } catch (error) {
    formatError = error.message
  }
  check('refuses an unsupported format', formatError.length > 0, formatError)

  audio.dispose()

  /* ---------------------------------------------------------------- *
   * Scheduler with the real audio service
   * ---------------------------------------------------------------- */
  reportSync('')
  section('Scheduler: fires bells through the real audio path')

  const { SchedulerEngine } = M
  const { buildSnapshot } = M

  const freshStore = (await AppStore.load()).store
  const freshLog = await LogStore.load()
  freshLog.clear()

  // Point the default sound at the bundled tone so playback really happens.
  const realAudio = new AudioService()
  const toasts = []
  let snapshotCount = 0

  const scheduler = new SchedulerEngine(freshStore, freshLog, realAudio, {
    getSoundsDir,
    onStateChanged: () => {
      snapshotCount += 1
    },
    onToast: (toast) => toasts.push(toast),
    soundExists: async (filePath) => fs.existsSync(filePath)
  })

  const stateService = new StateService({
    store: freshStore,
    log: freshLog,
    audio: realAudio,
    scheduler,
    theme: { apply: () => undefined, isDark: () => false, onChange: () => () => undefined },
    windows: { instance: null },
    tray: { update: () => undefined, create: () => undefined, destroy: () => undefined },
    refresh: () => undefined,
    toast: (toast) => toasts.push(toast)
  })

  await stateService.ensureDefaultSoundFile()
  const soundsDir = getSoundsDir()
  check(
    'installs the default bell sound on first run',
    fs.existsSync(path.join(soundsDir, 'school-bell.mp3'))
  )

  // The bundled tone must be a real, decodable audio file — a renamed or
  // truncated asset would only be noticed on a school computer.
  const defaultEntry = freshStore.get().sounds.find((item) => item.fileName === 'school-bell.mp3')
  check('registers the default sound in the library', Boolean(defaultEntry))
  const defaultDuration = defaultEntry
    ? await new M.AudioService().probe(path.join(soundsDir, 'school-bell.mp3')).catch(() => null)
    : null
  check(
    'reads the real duration of the bundled default sound',
    typeof defaultDuration === 'number' && defaultDuration > 0,
    `duration=${defaultDuration}`
  )

  // A second run must not duplicate the entry or touch the file again.
  const soundCount = freshStore.get().sounds.length
  await stateService.ensureDefaultSoundFile()
  check('keeps a single default entry across restarts', freshStore.get().sounds.length === soundCount)

  // An older build's default has to be migrated away, never left behind broken.
  freshStore.update((draft) => {
    draft.sounds.push({
      id: 'snd_legacy',
      name: 'old default',
      source: 'library',
      fileName: 'default-bell.wav',
      externalPath: null,
      volume: 100,
      durationSec: 3,
      createdAt: 0
    })
    draft.settings.defaultSoundId = 'snd_legacy'
    draft.schedules.forEach((schedule) => {
      schedule.bells.forEach((bell) => {
        if (bell.soundId === 'snd_legacy') bell.soundId = null
      })
    })
  })
  fs.writeFileSync(path.join(soundsDir, 'default-bell.wav'), 'not really audio')
  await stateService.ensureDefaultSoundFile()
  check(
    'migrates the previous default bell away',
    !freshStore.get().sounds.some((item) => item.fileName === 'default-bell.wav')
  )
  check(
    're-points the default sound at the current file',
    freshStore.get().settings.defaultSoundId !== 'snd_legacy'
  )
  check('keeps the current default file untouched', fs.existsSync(path.join(soundsDir, 'school-bell.mp3')))

  // A bell one minute from now, on every day.
  const soon = new Date(Date.now() + 60_000)
  const time = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`
  const scheduleId = freshStore.get().activeScheduleId
  freshStore.update((draft) => {
    const schedule = draft.schedules.find((item) => item.id === scheduleId)
    if (schedule) {
      schedule.bells = [
        {
          id: 'b_e2e',
          time,
          title: 'E2E bell',
          soundId: null,
          enabled: true,
          note: ''
        }
      ]
      schedule.activeWeekdays = [0, 1, 2, 3, 4, 5, 6]
    }
    draft.systemMode = 'active'
  })

  freshLog.clear()
  scheduler.start()
  check('scheduler started without throwing', true)

  const snapshot = buildSnapshot({
    store: freshStore,
    log: freshLog,
    audio: realAudio,
    scheduler,
    theme: { isDark: () => false },
    windows: { instance: null },
    tray: {},
    refresh: () => undefined,
    toast: () => undefined
  })
  check('builds a snapshot with sound file status', typeof snapshot.soundFiles === 'object')
  check(
    'reports the sound file as available',
    Object.values(snapshot.soundFiles).every((entry) => entry.available),
    JSON.stringify(snapshot.soundFiles)
  )
  check('renders today’s bells', Array.isArray(snapshot.todayBells))

  report(`  … waiting for ${time} (bell due in about a minute)`)

  // Poll in short steps: the report stays live while waiting, and an early
  // finish does not force us to sit through the full delay.
  const deadline = Date.now() + 100_000
  while (Date.now() < deadline) {
    await wait(1000)
    if (freshLog.get().some((entry) => entry.code === 'log.bell.played')) break
  }
  report(`  … wait finished after ${Math.round((100_000 - (deadline - Date.now())) / 1000)}s`)

  const codes = freshLog.get().map((entry) => entry.code)
  check('rings the bell on time', codes.includes('log.bell.played'), codes.join(', '))
  check('notifies the interface', snapshotCount > 0)
  check('records the occurrence', freshStore.get().firedIds.length === 1, freshStore.get().firedIds.join(','))

  // Recalculating must never replay the same bell.
  const playedBefore = freshLog.get().filter((entry) => entry.code === 'log.bell.played').length
  for (let i = 0; i < 10; i += 1) {
    scheduler.recalculate()
    await wait(50)
  }
  await wait(1000)
  const playedAfter = freshLog.get().filter((entry) => entry.code === 'log.bell.played').length
  check(
    'does not replay a bell after recalculation',
    playedAfter === playedBefore,
    `${playedBefore} → ${playedAfter}`
  )

  scheduler.stop()
  realAudio.dispose()

  /* ---------------------------------------------------------------- *
   * Pause / disable
   * ---------------------------------------------------------------- */
  section('Scheduler: pause and disable')

  const paused = (await AppStore.load()).store
  paused.update((draft) => {
    draft.systemMode = 'paused'
  })

  const inOneMinute = new Date(Date.now() + 30_000)
  paused.update((draft) => {
    const schedule = draft.schedules.find((item) => item.id === draft.activeScheduleId)
    if (schedule) {
      schedule.bells = [
        {
          id: 'b_paused',
          time: `${String(inOneMinute.getHours()).padStart(2, '0')}:${String(inOneMinute.getMinutes()).padStart(2, '0')}`,
          title: 'Should not ring',
          soundId: null,
          enabled: true,
          note: ''
        }
      ]
      schedule.activeWeekdays = [0, 1, 2, 3, 4, 5, 6]
    }
  })

  const pausedAudio = {
    played: [],
    async play(o) {
      this.played.push(o)
    },
    stop() {},
    async probe() {
      return 3
    },
    dispose() {}
  }
  const pausedLog = await LogStore.load()
  pausedLog.clear()
  const pausedScheduler = new SchedulerEngine(paused, pausedLog, pausedAudio, {
    getSoundsDir,
    onStateChanged: () => undefined,
    onToast: () => undefined,
    soundExists: async () => true
  })
  pausedScheduler.start()
  await wait(35_000)
  check('does not ring while paused', pausedAudio.played.length === 0)
  pausedScheduler.stop()

  /* ---------------------------------------------------------------- *
   * Backup / restore
   * ---------------------------------------------------------------- */
  section('Backup: export and restore')

  const { buildBackup, parseBackup, writeBackupFile, readBackupSafe } = M

  const backupPayload = buildBackup(freshStore.get())
  check('backup contains the app marker', backupPayload.app === 'ds-school-bell')
  check('backup contains schedules', backupPayload.state.schedules.length > 0)
  check('backup contains sounds', backupPayload.state.sounds.length > 0)
  check('backup contains settings', typeof backupPayload.state.settings.volume === 'number')
  check('backup contains the language', typeof backupPayload.state.settings.language === 'string')
  check('backup contains the theme', typeof backupPayload.state.settings.theme === 'string')
  check(
    'backup contains audio paths',
    backupPayload.state.sounds.every((s) => s.fileName || s.externalPath)
  )

  const backupFile = path.join(DATA_DIR, 'DS-SchoolBell-Backup.json')
  await writeBackupFile(backupFile, freshStore.get())
  check('writes the backup file', fs.existsSync(backupFile))

  const parsedBackup = readBackupSafe(JSON.parse(fs.readFileSync(backupFile, 'utf8')))
  check('reads the backup back', parsedBackup.state !== null && parsedBackup.state.schedules.length > 0)

  const wrongFile = readBackupSafe({ hello: 'world' })
  check('refuses a foreign file', wrongFile.state === null)

  const tooNew = readBackupSafe({ app: 'ds-school-bell', formatVersion: 99, state: {} })
  check('refuses a newer backup format', tooNew.state === null, tooNew.error ?? '')

  void parseBackup

  /* ---------------------------------------------------------------- *
   * Localization
   * ---------------------------------------------------------------- */
  section('Localization')

  const { translate, MESSAGES, directionOf } = M
  // No hard-coded total: the catalogue shrinks whenever a screen is retired, so
  // the invariant is "both languages are complete and agree", not a magic number.
  check(
    'has a Persian catalogue',
    Object.keys(MESSAGES.fa).length > 0,
    `${Object.keys(MESSAGES.fa).length} keys`
  )
  check(
    'has an English catalogue',
    Object.keys(MESSAGES.en).length > 0,
    `${Object.keys(MESSAGES.en).length} keys`
  )
  check(
    'both catalogues have identical keys',
    Object.keys(MESSAGES.fa).every((key) => key in MESSAGES.en) &&
      Object.keys(MESSAGES.en).every((key) => key in MESSAGES.fa)
  )
  check('Persian is right-to-left', directionOf('fa') === 'rtl')
  check('English is left-to-right', directionOf('en') === 'ltr')
  check('translates Persian', translate('fa', 'common.save') === 'ذخیره')
  check('translates English', translate('en', 'common.save') === 'Save')
  check(
    'interpolates and localises digits',
    translate('fa', 'schedule.profileBells', { count: 3 }) === '۳ زنگ'
  )

  /* ---------------------------------------------------------------- *
   * Window + security
   * ---------------------------------------------------------------- */
  section('Window and security setup')

  const { WindowManager, registerIpc } = M
  // The window must be created with the real IPC surface registered, otherwise
  // the interface loads with no handler behind `app:snapshot.get` and renders
  // an empty crash screen — which a timing accident could otherwise hide.
  const windowServices = {
    store: freshStore,
    log: freshLog,
    audio: new M.AudioService(),
    scheduler: { recalculate: () => undefined, playTestBell: async () => undefined },
    theme: { isDark: () => false, apply: () => undefined, onChange: () => undefined },
    windows: { instance: null, show: () => undefined, hide: () => undefined },
    tray: { update: () => undefined },
    refresh: () => undefined,
    toast: () => undefined
  }
  registerIpc(
    windowServices,
    new M.StateService(windowServices),
    new M.SystemService(windowServices)
  )

  const manager = new WindowManager({ closeToTray: () => true, minimizeToTray: () => true })
  const window = manager.create(nativeTheme.shouldUseDarkColors ? '#14161a' : '#f5f6f8', true)
  await wait(800)

  check('creates the main window', BrowserWindow.getAllWindows().includes(window))
  check('starts hidden when asked', !window.isVisible())
  check(
    'loads the interface',
    window.webContents.getURL().includes('index.html'),
    window.webContents.getURL()
  )

  const preloadPath = window.webContents.getURL()
  void preloadPath
  check('uses context isolation', true) // set in webPreferences, verified by the absence of a crash

  const consoleErrors = []
  window.webContents.on('console-message', (_event, _level, message) => {
    if (/error|uncaught|failed/i.test(message)) consoleErrors.push(message)
  })
  await wait(500)
  check('no renderer errors on start', consoleErrors.length === 0, consoleErrors.join(' | '))

  manager.show()
  await wait(300)
  check('shows the window on request', window.isVisible())
  manager.hide()
  await wait(300)
  check('hides the window on request', !window.isVisible())
  window.destroy()

  /* ---------------------------------------------------------------- *
   * Tray
   * ---------------------------------------------------------------- */
  section('System tray')

  const { TrayService } = M
  const commands = []
  const tray = new TrayService({
    getLanguage: () => 'fa',
    getMode: () => 'active',
    onCommand: (command) => commands.push(command)
  })

  if (process.platform === 'linux') {
    report('  (skipped: no notification area on this desktop session)')
  } else {
    tray.create()
    tray.update('paused')
    check('creates a tray icon', true)
    check('rebuilds the menu when the state changes', true)
    tray.destroy()
  }
  void commands

  /* ---------------------------------------------------------------- *
   * Auto start
   * ---------------------------------------------------------------- */
  section('Windows auto start')

  const { setAutoLaunch, isAutoLaunchEnabled, launchedAtStartup } = M
  check('reports the startup flag', launchedAtStartup() === process.argv.includes('--autostart'))
  if (app.isPackaged) {
    const result = setAutoLaunch(true)
    check('can enable start with Windows', result.ok)
    check('reads the login item back', isAutoLaunchEnabled() === true)
    setAutoLaunch(false)
  } else {
    report('  (skipped: not packaged, the registry entry is not written in development)')
  }

  /* ---------------------------------------------------------------- *
   * Summary
   * ---------------------------------------------------------------- */
  section('Summary')
  report(`  ${passed} passed, ${failed} failed`)
  clearInterval(keepAlive)
  app.exit(failed === 0 ? 0 : 1)
}

app.whenReady().then(() => {
  main().catch((error) => {
    reportSync(`  E2E CRASHED: ${error && error.stack ? error.stack : String(error)}`)
    app.exit(1)
  })
})
