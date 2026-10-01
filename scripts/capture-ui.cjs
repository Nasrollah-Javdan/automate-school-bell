/**
 * Development only helper: renders the real interface with a mocked bridge and
 * captures screenshots, so the UI can be reviewed on any machine.
 *
 *   npm run capture
 *
 * Not part of the shipped application.
 */
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const OUT = path.join(__dirname, '..', 'screenshots')
const RENDERER = path.join(__dirname, '..', 'out', 'renderer', 'index.html')
const PRELOAD = path.join(__dirname, 'mock-preload.cjs')

const bells = [
  { id: 'b1', time: '08:00', title: 'شروع مدرسه', soundId: null, enabled: true, note: '' },
  { id: 'b2', time: '08:45', title: 'زنگ اول', soundId: null, enabled: true, note: '' },
  { id: 'b3', time: '09:30', title: 'زنگ دوم', soundId: 'snd2', enabled: true, note: '' },
  { id: 'b4', time: '10:15', title: 'زنگ تفریح', soundId: null, enabled: true, note: '' },
  { id: 'b5', time: '11:00', title: 'زنگ سوم', soundId: null, enabled: false, note: 'مطالعه' }
]

const logs = [
  { id: 'l1', at: Date.now() - 4000, level: 'success', code: 'log.bell.played', params: { title: 'زنگ دوم', time: '09:30' } },
  { id: 'l2', at: Date.now() - 30000, level: 'info', code: 'log.system.test', params: {} },
  { id: 'l3', at: Date.now() - 120000, level: 'error', code: 'log.bell.playbackFailed', params: { title: 'زنگ اول', error: 'file not found' } },
  { id: 'l4', at: Date.now() - 300000, level: 'warn', code: 'log.bell.missed', params: { title: 'زنگ تفریح', time: '10:15' } },
  { id: 'l5', at: Date.now() - 900000, level: 'info', code: 'log.schedule.switched', params: { name: 'برنامه عادی' } }
]

function buildSnapshot({ language, theme, uiScale }) {
  const state = {
    version: 1,
    settings: {
      language,
      theme,
      uiScale,
      startWithWindows: false,
      startMinimized: false,
      minimizeToTray: true,
      closeToTray: true,
      volume: 80,
      defaultSoundId: 'snd1',
      missedBellPolicy: 'ignore',
      missedGraceMinutes: 10,
      activeScheduleId: 's1'
    },
    schedules: [
      { id: 's1', name: 'برنامه عادی', bells, activeWeekdays: [0, 1, 2, 3, 4] },
      { id: 's2', name: 'برنامه امتحانات', bells: bells.slice(0, 3), activeWeekdays: [0, 1, 2, 3] }
    ],
    activeScheduleId: 's1',
    sounds: [
      { id: 'snd1', name: 'زنگ پیش‌فرض', source: 'library', fileName: 'default-bell.wav', externalPath: null, volume: 100, durationSec: 3, createdAt: 0 },
      { id: 'snd2', name: 'زنگ مدرسه', source: 'library', fileName: 'school.mp3', externalPath: null, volume: 85, durationSec: 4, createdAt: 0 },
      { id: 'snd3', name: 'D:\\sounds\\break.wav', source: 'external', fileName: null, externalPath: 'D:\\sounds\\break.wav', volume: 70, durationSec: 6, createdAt: 0 }
    ],
    holidays: [
      { id: 'h1', jalali: { year: 1405, month: 9, day: 2 }, title: 'تعطیلی مدرسه' },
      { id: 'h2', jalali: { year: 1404, month: 7, day: 1 }, title: 'بازگشایی مدارس' }
    ],
    systemMode: 'active',
    firedIds: []
  }

  return {
    state,
    dayInfo: { kind: 'normal', holidayTitle: null, activeWeekdays: [0, 1, 2, 3, 4] },
    todayBells: [],
    effectiveDark: theme === 'dark',
    appVersion: '1.0.0',
    soundsDir: 'C:\\Users\\school\\AppData\\Roaming\\DS School Bell\\sounds',
    dataDir: 'C:\\Users\\school\\AppData\\Roaming\\DS School Bell',
    soundFiles: {
      snd1: { path: 'C:/sounds/default-bell.wav', available: true },
      snd2: { path: 'C:/sounds/school.mp3', available: true },
      snd3: { path: 'D:/sounds/break.wav', available: false }
    }
  }
}

function writePreload(snapshot) {
  fs.writeFileSync(
    PRELOAD,
    `
const snapshot = ${JSON.stringify(snapshot)}
const logs = ${JSON.stringify(logs)}
const same = () => Promise.resolve(snapshot)
const ok = (data) => Promise.resolve({ ok: true, data: data ?? null })
window.api = {
  getSnapshot: () => Promise.resolve(snapshot),
  getLogs: () => Promise.resolve(logs),
  updateSettings: same,
  setSystemMode: same,
  playTestBell: ok,
  stopAudio: () => Promise.resolve(),
  addBell: same,
  updateBell: same,
  removeBell: same,
  moveBell: same,
  createSchedule: same,
  renameSchedule: same,
  deleteSchedule: same,
  setActiveSchedule: same,
  updateScheduleDays: same,
  pickSoundFile: ok,
  importSound: ok,
  linkExternalSound: ok,
  probeSound: ok,
  playSound: ok,
  relinkSound: ok,
  updateSound: same,
  removeSound: same,
  setDefaultSound: same,
  addHoliday: same,
  removeHoliday: same,
  clearLogs: () => Promise.resolve(),
  backupToFile: ok,
  restoreFromFile: ok,
  resetAll: same,
  revealDataFolder: () => Promise.resolve(),
  window: { minimize: () => Promise.resolve(), hide: () => Promise.resolve(), show: () => Promise.resolve() },
  on: () => () => {}
}
`,
    'utf8'
  )
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const PAGES = ['dashboard', 'schedule', 'sounds', 'holidays', 'log', 'settings']

async function capture(win, name) {
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG())
  console.log('captured', name)
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true })

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: true,
    backgroundColor: '#f3f4f6',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const variants = [
    { suffix: 'fa-light', language: 'fa', theme: 'light', uiScale: 100, pages: PAGES },
    { suffix: 'fa-dark', language: 'fa', theme: 'dark', uiScale: 100, pages: PAGES },
    { suffix: 'en-light', language: 'en', theme: 'light', uiScale: 100, pages: ['dashboard', 'schedule', 'settings'] },
    { suffix: 'fa-large', language: 'fa', theme: 'light', uiScale: 150, pages: ['dashboard', 'schedule'] },
    { suffix: 'fa-narrow', language: 'fa', theme: 'light', uiScale: 100, pages: ['dashboard', 'schedule'], width: 1024, height: 700 }
  ]

  for (const variant of variants) {
    writePreload(buildSnapshot(variant))
    win.setSize(variant.width ?? 1280, variant.height ?? 860)
    await win.loadFile(RENDERER)
    await wait(1200)

    for (let index = 0; index < variant.pages.length; index += 1) {
      await win.webContents.executeJavaScript(
        `document.querySelectorAll('.nav__item')[${index}].click(); undefined`
      )
      await wait(700)
      await capture(win, `${variant.pages[index]}-${variant.suffix}`)
    }
  }

  app.quit()
}

app.whenReady().then(run)