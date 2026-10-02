import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState, LogEntry, Sound } from '../src/types/index.js'
import type { AudioPlayer, PlayOptions } from '../src/shared/audioPlayer.js'
import { AudioError } from '../src/shared/audioPlayer.js'
import { SchedulerEngine } from '../src/main/scheduler/schedulerEngine.js'
import type { AppStore } from '../src/main/storage/appStore.js'
import type { LogStore } from '../src/main/storage/logStore.js'

/* ------------------------------------------------------------------ *
 * Test doubles
 * ------------------------------------------------------------------ */

class FakeStore {
  private state: AppState
  readonly listeners = new Set<(state: AppState) => void>()
  updates = 0

  constructor(state: AppState) {
    this.state = state
  }

  get(): AppState {
    return this.state
  }

  update(mutator: (draft: AppState) => void): AppState {
    const draft = structuredClone(this.state)
    mutator(draft)
    this.state = draft
    this.updates += 1
    for (const listener of this.listeners) listener(this.state)
    return this.state
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

class FakeLog {
  entries: LogEntry[] = []

  append(
    code: LogEntry['code'],
    level: LogEntry['level'],
    params: Record<string, string | number> = {}
  ): LogEntry {
    const entry: LogEntry = { id: `l${this.entries.length}`, at: Date.now(), level, code, params }
    this.entries.push(entry)
    return entry
  }

  codes(): string[] {
    return this.entries.map((entry) => entry.code)
  }
}

class FakeAudio implements AudioPlayer {
  played: PlayOptions[] = []
  failNext = false
  stopped = 0

  async play(options: PlayOptions): Promise<void> {
    if (this.failNext) {
      this.failNext = false
      throw new AudioError('device is busy')
    }
    this.played.push(options)
  }

  stop(): void {
    this.stopped += 1
  }

  async probe(): Promise<number | null> {
    return 3
  }

  dispose(): void {}
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const SOUND: Sound = {
  id: 'snd1',
  name: 'Default bell',
  source: 'library',
  fileName: 'bell.wav',
  externalPath: null,
  volume: 100,
  durationSec: 3,
  createdAt: 0
}

/** All seven days are active, so the weekday never interferes with a test. */
function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 1,
    settings: {
      language: 'en',
      theme: 'system',
      uiScale: 100,
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
      {
        id: 's1',
        name: 'Regular',
        activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
        bells: [{ id: 'b1', time: '09:30', title: 'First bell', soundId: null, enabled: true, note: '' }]
      }
    ],
    activeScheduleId: 's1',
    sounds: [SOUND],
    holidays: [],
    systemMode: 'active',
    firedIds: [],
    ...overrides
  }
}

interface Harness {
  engine: SchedulerEngine
  store: FakeStore
  log: FakeLog
  audio: FakeAudio
  toasts: Array<{ code: string; params?: Record<string, string | number> }>
  snapshots: number
  files: Set<string>
  restore: () => void
}

/** Jump the fake clock to an absolute time. */
async function setTime(date: string): Promise<void> {
  vi.setSystemTime(new Date(date))
  // Let the engine's debounced persistence and start-up work settle.
  await vi.advanceTimersByTimeAsync(300)
}

/** Start the engine and let its initial scan complete. */
async function startEngine(test: Harness): Promise<void> {
  test.engine.start()
  await vi.advanceTimersByTimeAsync(300)
}

/** Move the fake clock forward by the given number of minutes. */
async function advanceMinutes(minutes: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(minutes * 60 * 1000)
}

function harness(state: AppState, withSoundFile = true): Harness {
  const store = new FakeStore(state)
  const log = new FakeLog()
  const audio = new FakeAudio()
  const toasts: Harness['toasts'] = []
  const files = new Set(withSoundFile ? ['/sounds/bell.wav'] : [])

  let snapshots = 0

  const engine = new SchedulerEngine(store as unknown as AppStore, log as unknown as LogStore, audio, {
    getSoundsDir: () => '/sounds',
    soundExists: (filePath: string) => Promise.resolve(files.has(filePath)),
    onStateChanged: () => {
      snapshots += 1
    },
    onToast: (toast) => toasts.push({ code: toast.code, params: toast.params })
  })

  return {
    engine,
    store,
    log,
    audio,
    toasts,
    get snapshots() {
      return snapshots
    },
    files,
    restore: () => {
      engine.stop()
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-27T09:00:00')) // Sunday
})

afterEach(() => {
  vi.useRealTimers()
})

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('bell firing', () => {
  it('plays a bell exactly when it is due', async () => {
    const test = harness(makeState())
    try {
      test.engine.start()
      expect(test.audio.played).toHaveLength(0)

      // Still 30 minutes to go.
      await advanceMinutes(29)
      expect(test.audio.played).toHaveLength(0)

      await advanceMinutes(1)
      expect(test.audio.played).toHaveLength(1)
      expect(test.log.codes()).toContain('log.bell.played')
    } finally {
      test.restore()
    }
  })

  it('never plays the same bell twice', async () => {
    const test = harness(makeState())
    try {
      test.engine.start()

      await advanceMinutes(30)
      expect(test.audio.played).toHaveLength(1)

      // Extra recalculations (refresh, clock check, day view) must not replay it.
      for (let i = 0; i < 5; i += 1) {
        test.engine.recalculate()
        await vi.advanceTimersByTimeAsync(1000)
      }
      expect(test.audio.played).toHaveLength(1)
      expect(test.store.get().firedIds).toHaveLength(1)
    } finally {
      test.restore()
    }
  })

  it('records a unique id per bell occurrence', async () => {
    const test = harness(makeState())
    try {
      test.engine.start()
      await advanceMinutes(30)

      const [id] = test.store.get().firedIds
      expect(id).toBe('2026-09-27_09:30_b1')

      // The same bell rings again the next day.
      await setTime('2026-09-28T09:00:00')
      await advanceMinutes(30)
      expect(test.audio.played).toHaveLength(2)
      expect(test.store.get().firedIds).toContain('2026-09-28_09:30_b1')
    } finally {
      test.restore()
    }
  })

  it('does not play while paused, and marks the bell as handled', async () => {
    const test = harness(makeState({ systemMode: 'paused' }))
    try {
      test.engine.start()
      await advanceMinutes(30)

      expect(test.audio.played).toHaveLength(0)
      expect(test.log.codes()).toContain('log.bell.disabled')

      // After resuming, the bell must not suddenly play late.
      test.store.update((draft) => {
        draft.systemMode = 'active'
      })
      await advanceMinutes(1)
      expect(test.audio.played).toHaveLength(0)
    } finally {
      test.restore()
    }
  })

  it('skips bells while the system is disabled', async () => {
    const test = harness(makeState({ systemMode: 'disabled' }))
    try {
      test.engine.start()
      await advanceMinutes(30)
      expect(test.audio.played).toHaveLength(0)
    } finally {
      test.restore()
    }
  })

  it('reports a missing sound file without crashing', async () => {
    const test = harness(makeState(), false) // no file on disk
    try {
      test.engine.start()
      await advanceMinutes(30)

      expect(test.audio.played).toHaveLength(0)
      expect(test.log.codes()).toContain('log.bell.soundMissing')
      expect(test.toasts.some((toast) => toast.code === 'toast.soundMissing')).toBe(true)
    } finally {
      test.restore()
    }
  })

  it('logs a playback failure instead of throwing', async () => {
    const test = harness(makeState())
    test.audio.failNext = true
    try {
      test.engine.start()
      await advanceMinutes(30)

      expect(test.log.codes()).toContain('log.bell.playbackFailed')
      // The engine keeps running and still holds the clock.
      expect(test.store.get().systemMode).toBe('active')
    } finally {
      test.restore()
    }
  })

  it('treats a bell as missed when it is far in the past', async () => {
    const test = harness(makeState())
    try {
      // The application starts two hours after the bell time.
      await setTime('2026-09-27T11:30:00')
      await startEngine(test)

      expect(test.audio.played).toHaveLength(0)
      expect(test.log.codes()).toContain('log.bell.missed')
    } finally {
      test.restore()
    }
  })

  it('plays a recently missed bell when the policy allows it', async () => {
    const state = makeState()
    state.settings.missedBellPolicy = 'playIfRecent'
    state.settings.missedGraceMinutes = 15
    const test = harness(state)
    try {
      // The application starts 7 minutes after the bell time.
      await setTime('2026-09-27T09:37:00')
      await startEngine(test)

      expect(test.audio.played).toHaveLength(1)
      expect(test.log.codes()).toContain('log.bell.played')
    } finally {
      test.restore()
    }
  })

  it('respects the per-bell sound and the master volume', async () => {
    const state = makeState()
    state.settings.volume = 50
    state.sounds.push({ ...SOUND, id: 'snd2', name: 'Break', volume: 40 })
    state.schedules[0].bells[0].soundId = 'snd2'
    const test = harness(state)
    try {
      test.engine.start()
      await advanceMinutes(30)

      expect(test.audio.played[0].volume).toBeCloseTo(0.5 * 0.4, 5)
    } finally {
      test.restore()
    }
  })

  it('does not ring bells on a holiday', async () => {
    const state = makeState()
    // 27 September 2026 → 5 Mehr 1405
    state.holidays.push({ id: 'h1', jalali: { year: 1405, month: 7, day: 5 }, title: 'Closed' })
    const test = harness(state)
    try {
      test.engine.start()
      await advanceMinutes(30)
      expect(test.audio.played).toHaveLength(0)
    } finally {
      test.restore()
    }
  })

  it('does not ring bells on an inactive weekday', async () => {
    const state = makeState()
    state.schedules[0].activeWeekdays = [0, 1, 2, 3, 4] // Friday 2026-10-02 excluded
    const test = harness(state)
    try {
      await setTime('2026-10-02T09:00:00')
      await startEngine(test)
      await advanceMinutes(30)
      expect(test.audio.played).toHaveLength(0)
    } finally {
      test.restore()
    }
  })
})

describe('test bell', () => {
  it('plays the default sound without recording an occurrence', async () => {
    const test = harness(makeState())
    try {
      await test.engine.playTestBell()
      expect(test.audio.played).toHaveLength(1)
      expect(test.store.get().firedIds).toHaveLength(0)
      expect(test.log.codes()).toContain('log.system.test')
    } finally {
      test.restore()
    }
  })

  it('plays a specific sound by id', async () => {
    const state = makeState()
    state.sounds.push({ ...SOUND, id: 'snd2', name: 'Break', volume: 100 })
    const test = harness(state)
    try {
      await test.engine.playSoundById('snd2')
      expect(test.audio.played).toHaveLength(1)
    } finally {
      test.restore()
    }
  })

  it('throws a clear error when the sound file is gone', async () => {
    const test = harness(makeState(), false)
    try {
      await expect(test.engine.playSoundById('snd1')).rejects.toThrow(/not found/i)
    } finally {
      test.restore()
    }
  })
})

describe('clock changes and resume', () => {
  it('recalculates after the system clock jumps', async () => {
    const test = harness(makeState())
    try {
      test.engine.start()

      // The clock jumps forward, past the bell time.
      vi.setSystemTime(new Date('2026-09-27T09:30:30'))
      await test.engine.recalculateAfterWake('manual')

      expect(test.audio.played).toHaveLength(1)
    } finally {
      test.restore()
    }
  })

  it('logs when resuming from sleep', async () => {
    const test = harness(makeState())
    try {
      test.engine.start()
      await test.engine.recalculateAfterWake('resume')
      expect(test.log.codes()).toContain('log.resume.recalculated')
    } finally {
      test.restore()
    }
  })

  it('finds the next bell for the tray', () => {
    const test = harness(makeState())
    try {
      test.engine.start()
      const next = test.engine.getNextBell(new Date('2026-09-27T08:00:00'))
      expect(next?.id).toBe('b1')
      expect(test.engine.getNextBell(new Date('2026-09-27T23:00:00'))).toBeNull()
    } finally {
      test.restore()
    }
  })
})
