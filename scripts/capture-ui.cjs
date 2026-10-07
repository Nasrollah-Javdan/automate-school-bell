/**
 * Visual review helper: renders the interface with a mocked bridge and captures
 * screenshots so the UI can be checked on any machine.
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
const PRELOAD = path.join(__dirname, 'capture-preload.cjs')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Bells relative to "now" so the dashboard always shows realistic states. */
/**
 * Active days for the mock: every day except one, always including today, so
 * the captured dashboard shows a normal school day.
 */
function activeDaysExceptToday() {
  const today = (new Date().getDay() + 1) % 7
  const excluded = (today + 1) % 7
  return [0, 1, 2, 3, 4, 5, 6].filter((day) => day !== excluded)
}

function bellsAroundNow() {
  const now = new Date()
  const at = (minutesFromNow) => {
    const date = new Date(now.getTime() + minutesFromNow * 60_000)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  return [
    { id: 'b1', time: at(-95), title: 'شروع مدرسه', soundId: null, enabled: true, note: '' },
    { id: 'b2', time: at(-50), title: 'زنگ اول', soundId: null, enabled: true, note: '' },
    { id: 'b3', time: at(-5), title: 'زنگ دوم', soundId: 'snd2', enabled: true, note: '' },
    { id: 'b4', time: at(25), title: 'زنگ تفریح', soundId: null, enabled: true, note: '' },
    { id: 'b5', time: at(70), title: 'زنگ سوم', soundId: 'snd3', enabled: false, note: 'مطالعه' }
  ]
}

  {
    id: 'l1',
    at: Date.now() - 5000,
    level: 'success',
    code: 'log.bell.played',
    params: { title: 'زنگ دوم', time: '09:30' }
  },
  { id: 'l2', at: Date.now() - 30000, level: 'info', code: 'log.system.test', params: {} },
  {
    id: 'l3',
    at: Date.now() - 120000,
    level: 'error',
    code: 'log.bell.playbackFailed',
    params: { title: 'زنگ اول', error: 'دستگاه صوتی در دسترس نیست' }
  },
  {
    id: 'l4',
    at: Date.now() - 300000,
    level: 'warn',
    code: 'log.bell.missed',
    params: { title: 'زنگ تفریح', time: '10:15' }
  },
  {
    id: 'l5',
    at: Date.now() - 900000,
    level: 'info',
    code: 'log.schedule.switched',
    params: { name: 'برنامه عادی' }
  }
]

function buildSnapshot({ language, theme, uiScale, mode = 'active' }) {
  const bells = bellsAroundNow()
  const state = {
    version: 1,
    settings: {
      language,
      theme,
      uiScale,
      startWithWindows: true,
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
      { id: 's1', name: 'برنامه عادی', bells, activeWeekdays: activeDaysExceptToday() },
      { id: 's2', name: 'برنامه امتحانات', bells: bells.slice(0, 3), activeWeekdays: [0, 1, 2, 3] }
    ],
    activeScheduleId: 's1',
    sounds: [
      {
        id: 'snd1',
        name: 'زنگ پیش‌فرض',
        source: 'library',
        fileName: 'school-bell.mp3',
        externalPath: null,
        volume: 100,
        durationSec: 3,
        createdAt: 0
      },
      {
        id: 'snd2',
        name: 'زنگ مدرسه',
        source: 'library',
        fileName: 'school.mp3',
        externalPath: null,
        volume: 85,
        durationSec: 4,
        createdAt: 0
      },
      {
        id: 'snd3',
        name: 'زنگ تفریح',
        source: 'external',
        fileName: null,
        externalPath: 'D:\\sounds\\break.wav',
        volume: 70,
        durationSec: 6,
        createdAt: 0
      }
    ],
    systemMode: mode,
    firedIds: []
  }

  return {
    state,
    dayInfo: { kind: 'normal', activeWeekdays: activeDaysExceptToday() },
    todayBells: [],
    effectiveDark: theme === 'dark',
    appVersion: '1.0.0',
    soundsDir: 'C:\\Users\\school\\AppData\\Roaming\\DS School Bell\\sounds',
    dataDir: 'C:\\Users\\school\\AppData\\Roaming\\DS School Bell',
    soundFiles: {
      snd1: { path: 'C:/sounds/school-bell.mp3', available: true },
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
const same = () => Promise.resolve(snapshot)
const ok = (data) => Promise.resolve({ ok: true, data: data ?? null })
window.api = {
  getSnapshot: () => Promise.resolve(snapshot),
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
  window: { minimize: () => Promise.resolve(), hide: () => Promise.resolve(), show: () => Promise.resolve() },
  on: () => () => {}
}
`,
    'utf8'
  )
}

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
    webPreferences: { preload: PRELOAD, contextIsolation: false, nodeIntegration: false, sandbox: false }
  })

  const variants = [
    { suffix: 'fa-light', language: 'fa', theme: 'light', uiScale: 100, pages: [0, 1, 2, 3, 4, 5] },
    { suffix: 'fa-dark', language: 'fa', theme: 'dark', uiScale: 100, pages: [0, 1, 2, 4] },
    { suffix: 'en-light', language: 'en', theme: 'light', uiScale: 100, pages: [0, 1, 5] },
    { suffix: 'fa-large', language: 'fa', theme: 'light', uiScale: 150, pages: [0, 1] },
    {
      suffix: 'fa-small',
      language: 'fa',
      theme: 'light',
      uiScale: 100,
      pages: [0],
      width: 1024,
      height: 700
    },
    { suffix: 'fa-paused', language: 'fa', theme: 'light', uiScale: 100, pages: [0], mode: 'paused' }
  ]

  const names = ['dashboard', 'schedule', 'sounds', 'log', 'settings']

  for (const variant of variants) {
    writePreload(buildSnapshot(variant))
    win.setSize(variant.width ?? 1280, variant.height ?? 860)
    await win.loadFile(RENDERER)
    await wait(1200)

    for (const index of variant.pages) {
      await win.webContents.executeJavaScript(
        `document.querySelectorAll('.nav__item')[${index}].click(); undefined`
      )
      await wait(700)
      await capture(win, `${names[index]}-${variant.suffix}`)
    }
  }

  app.quit()
}

app.whenReady().then(run)
