import type { AppState, Bell, LogCode, LogLevel, ToastPayload } from '../../types/index.js'
import type { AppStore } from '../storage/appStore.js'
import type { LogStore } from '../storage/logStore.js'
import { AudioError, combinedVolume, type AudioPlayer } from '../../shared/audioPlayer.js'
import { isBellFired, nextBellOf, resolveDayPlan, type DayPlan } from '../../shared/today.js'
import { bellOccurrenceId, timeOnDate } from '../../utils/time.js'
import { pruneFiredIds } from '../../shared/fired.js'
import { isoDayKey } from '../../utils/jalali.js'
import { soundFilePath } from '../storage/soundLibrary.js'
import type { Sound } from '../../types/index.js'

/** Longest a timer may sleep before the engine re-verifies everything. */
const MAX_TIMER_MS = 15 * 60 * 1000
/** Bells later than this are treated as missed instead of being played late. */
const DEFAULT_LATE_WINDOW_MS = 5 * 60 * 1000
/** How much wall-clock drift is accepted before we report a clock change. */
const CLOCK_DRIFT_TOLERANCE_MS = 4000
/**
 * A bell that failed to play is retried a few times before it is given up on.
 *
 * A single failure is usually a temporary condition (the audio device was
 * still waking up, a file was still being copied), but retrying forever would
 * turn one broken sound into an endless stream of errors.
 */
const MAX_PLAYBACK_ATTEMPTS = 3
/** Pause between those retries. */
const RETRY_DELAY_MS = 10_000

export interface SchedulerEvents {
  /** Told the UI to re-read the state (a bell played, mode changed…). */
  onStateChanged: () => void
  /** Show a message in the interface. */
  onToast: (toast: Omit<ToastPayload, 'id'>) => void
  /** Folder holding the imported sound library. */
  getSoundsDir: () => string
  /**
   * Whether a sound file can actually be played. Injected so the engine never
   * touches the file system directly and stays testable.
   */
  soundExists: (filePath: string) => Promise<boolean>
}

/**
 * The bell engine.
 *
 * Timing rules:
 *  - a precision timer is armed for the exact millisecond of the next bell;
 *  - every wake-up re-reads the system clock, so time changes, sleep/resume and
 *    daylight saving shifts are all handled without special casing;
 *  - each bell occurrence gets a unique id and is remembered forever, so a bell
 *    can never play twice for the same day and time.
 */
export class SchedulerEngine {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private expectedWakeAt = 0
  private lastCheckedAt = 0
  /** Serialises playback so two bells never sound on top of each other. */
  private playback: Promise<void> = Promise.resolve()
  /** True while the engine records its own bookkeeping in the store. */
  private recording = false
  /** True while a scan is running; a second request is remembered here. */
  private scanning = false
  private scanQueued = false
  private inFlight: Promise<void> | null = null
  private unsubscribeStore: (() => void) | null = null
  /** Identifies the last "nothing rings today" note, so it is logged once. */
  private dayNote = ''

  constructor(
    private readonly store: AppStore,
    private readonly log: LogStore,
    private readonly audio: AudioPlayer,
    private readonly events: SchedulerEvents
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.lastCheckedAt = Date.now()
    this.unsubscribeStore = this.store.subscribe(() => this.recalculate())
    this.recalculate()
  }

  stop(): void {
    this.running = false
    this.unsubscribeStore?.()
    this.unsubscribeStore = null
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** Re-evaluate the day and re-arm the timer. */
  recalculate(): void {
    // While the engine writes its own "already handled" ids the store notifies us
    // again. Acting on that notification would re-enter the scan below and ring
    // the same bells twice, so it is ignored: whoever wrote the id re-arms us.
    if (!this.running || this.recording) return
    void this.scan()
    this.armNextWake(new Date())
  }

  /**
   * Run at most one scan at a time.
   *
   * Requests that arrive while a scan is running are collapsed into a single
   * follow-up pass, which is what keeps concurrent triggers (the timer, a store
   * change and a resume at the same instant) from ringing a bell twice. The
   * returned promise settles once the work asked for has actually finished, so
   * `await scan()` really means "the bells have been handled".
   */
  private scan(): Promise<void> {
    if (this.scanning) {
      this.scanQueued = true
      return this.inFlight ?? Promise.resolve()
    }
    this.scanning = true
    const run = this.runScan()
    this.inFlight = run
    return run
  }

  private async runScan(): Promise<void> {
    try {
      do {
        this.scanQueued = false
        await this.handleDue(new Date())
      } while (this.scanQueued && this.running)
    } finally {
      this.scanning = false
      this.inFlight = null
    }
  }

  /** Called after sleep/resume or when the window is shown again. */
  async recalculateAfterWake(reason: 'resume' | 'manual'): Promise<void> {
    if (reason === 'resume') {
      this.log.append('log.resume.recalculated', 'info')
    }
    await this.scan()
    this.armNextWake(new Date())
    this.events.onStateChanged()
  }

  getNextBell(now: Date = new Date()): Bell | null {
    const state = this.store.get()
    return nextBellOf(resolveDayPlan(state, now), now)
  }

  /** Play the default sound without touching the fired registry. */
  async playTestBell(): Promise<void> {
    const state = this.store.get()
    const sound = this.resolveSound(state, null)
    if (!sound) {
      this.log.append('log.bell.soundMissing', 'error', { title: '—', time: '—' })
      this.events.onToast({
        level: 'error',
        code: 'toast.soundMissing',
        params: { title: '—' },
        actionId: 'sounds'
      })
      throw new AudioError('no sound available')
    }
    await this.playSound(sound, state.settings.volume)
    this.log.append('log.system.test', 'info')
    this.events.onToast({ level: 'success', code: 'toast.bellPlayed', params: { title: sound.name } })
  }

  /** Play one specific sound file, e.g. the "test" button in the Sounds page. */
  async playSoundById(soundId: string): Promise<void> {
    const state = this.store.get()
    const sound = state.sounds.find((item) => item.id === soundId)
    if (!sound) throw new AudioError('sound not found')

    if (!(await this.soundExists(sound))) {
      this.log.append('log.sound.added', 'warn', { name: sound.name })
      throw new AudioError('sound file not found')
    }

    await this.playSound(sound, state.settings.volume)
    this.log.append('log.system.test', 'info', { name: sound.name })
  }

  /* ------------------------------------------------------------------ *
   * Internals
   * ------------------------------------------------------------------ */

  /** Whether the file behind a sound entry is present on disk. */
  private async soundExists(sound: Sound): Promise<boolean> {
    return this.events.soundExists(soundFilePath(sound, this.events.getSoundsDir()))
  }

  private resolveSound(state: AppState, bellSoundId: string | null): Sound | null {
    if (bellSoundId) {
      const explicit = state.sounds.find((sound) => sound.id === bellSoundId)
      if (explicit) return explicit
    }
    if (state.settings.defaultSoundId) {
      return state.sounds.find((sound) => sound.id === state.settings.defaultSoundId) ?? null
    }
    return state.sounds[0] ?? null
  }

  private lateWindowMs(state: AppState): number {
    if (state.settings.missedBellPolicy === 'playIfRecent') {
      return Math.max(60_000, state.settings.missedGraceMinutes * 60_000)
    }
    return DEFAULT_LATE_WINDOW_MS
  }

  /** Play or resolve every bell whose time has already passed today. */
  private async handleDue(now: Date): Promise<void> {
    if (!this.running) return
    const state = this.store.get()
    const plan = resolveDayPlan(state, now)

    // This is silent by design, so it is written down as well: "nothing rang"
    // has to be explainable from the activity log alone. The note is only
    // written when it changes, because the engine rescans often.
    if (plan.schedule && plan.bells.length === 0) {
      this.noteOncePerDay(plan.dayKey, 'no-bells', 'log.day.noBells', { name: plan.schedule.name })
      return
    }
    this.dayNote = ''

    const nowMs = now.getTime()
    const due = plan.bells.filter((bell) => {
      if (isBellFired(state, plan.dayKey, bell)) return false
      return timeOnDate(now, bell.time).getTime() <= nowMs
    })

    if (due.length === 0) return

    const active = state.systemMode === 'active'
    const lateWindow = this.lateWindowMs(state)

    for (const bell of due) {
      const bellAt = timeOnDate(now, bell.time).getTime()
      const lateness = nowMs - bellAt
      this.markFired(plan, bell)

      if (!active) {
        this.logBell('log.bell.disabled', 'warn', bell)
        continue
      }
      if (lateness > lateWindow) {
        this.logBell('log.bell.missed', 'warn', bell)
        continue
      }

      await this.playBell(bell, state)
    }

    this.events.onStateChanged()
  }

  private async playBell(bell: Bell, state: AppState): Promise<void> {
    // Playback is queued rather than skipped: a bell must never be dropped
    // silently just because another one is still sounding.
    await this.withPlayback(async () => {
      const sound = this.resolveSound(state, bell.soundId)
      if (!sound) {
        this.logBell('log.bell.soundMissing', 'error', bell)
        this.events.onToast({
          level: 'error',
          code: 'toast.soundMissing',
          params: { title: bell.title },
          actionId: 'sounds'
        })
        return
      }

      if (!(await this.soundExists(sound))) {
        this.logBell('log.bell.soundMissing', 'error', bell)
        this.events.onToast({
          level: 'error',
          code: 'toast.soundMissing',
          params: { title: bell.title },
          actionId: 'sounds'
        })
        return
      }

      for (let attempt = 1; attempt <= MAX_PLAYBACK_ATTEMPTS; attempt += 1) {
        try {
          await this.playSound(sound, state.settings.volume)
          this.logBell('log.bell.played', 'success', bell, {
            backend: this.audio.lastBackend ?? 'embedded',
            attempt
          })
          this.events.onToast({ level: 'success', code: 'toast.bellPlayed', params: { title: bell.title } })
          return
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (attempt === MAX_PLAYBACK_ATTEMPTS) {
            this.log.append('log.bell.playbackFailed', 'error', {
              title: bell.title,
              time: bell.time,
              error: message
            })
            this.events.onToast({
              level: 'error',
              code: 'toast.playbackFailed',
              params: { error: message },
              actionId: 'sounds'
            })
            return
          }
          // Transient failure: say so, wait, and try the same sound again.
          this.log.append('log.bell.retrying', 'warn', {
            title: bell.title,
            time: bell.time,
            attempt,
            error: message
          })
          await this.waitBeforeRetry()
          // A later scan may have taken over in the meantime.
          if (!this.running) return
        }
      }
    })
  }

  private waitBeforeRetry(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, RETRY_DELAY_MS)
      timer.unref?.()
    })
  }

  /** Write one explanatory note per day and reason, not once per scan. */
  private noteOncePerDay(
    dayKey: string,
    reason: string,
    code: LogCode,
    params: Record<string, string | number>
  ): void {
    const key = `${dayKey}:${reason}`
    if (this.dayNote === key) return
    this.dayNote = key
    this.log.append(code, 'info', params)
  }

  /** Run `task` once every previously queued playback has settled. */
  private async withPlayback(task: () => Promise<void>): Promise<void> {
    const run = this.playback.then(task, task)
    this.playback = run.then(
      () => undefined,
      () => undefined
    )
    await run
  }

  /**
   * Play a sound.
   * @param masterVolume master volume in percent (0..100)
   */
  private async playSound(sound: Sound, masterVolume: number): Promise<void> {
    const volume = combinedVolume(masterVolume, sound.volume)
    await this.audio.play({ filePath: soundFilePath(sound, this.events.getSoundsDir()), volume })
  }

  private logBell(
    code: LogCode,
    level: LogLevel,
    bell: Bell,
    extra: Record<string, string | number> = {}
  ): void {
    this.log.append(code, level, { title: bell.title, time: bell.time, ...extra })
  }

  /** Remember that this exact occurrence was handled, and prune old ids. */
  private markFired(plan: DayPlan, bell: Bell): void {
    const id = bellOccurrenceId(plan.dayKey, bell.time, bell.id)
    if (this.store.get().firedIds.includes(id)) return
    this.recording = true
    try {
      this.store.update((draft) => {
        if (!draft.firedIds.includes(id)) draft.firedIds.push(id)
        pruneFiredIds(draft.firedIds)
      })
    } finally {
      this.recording = false
    }
  }

  /** Arm the precision timer for the next thing that has to happen. */
  private armNextWake(now: Date): void {
    if (!this.running) return
    const state = this.store.get()
    const plan = resolveDayPlan(state, now)
    const next = nextBellOf(plan, now)

    if (next) {
      this.arm(timeOnDate(now, next.time).getTime())
      return
    }

    // Nothing left today: wake up shortly after midnight (new day, new weekday)
    // and, if the next day already has bells, a little before its first one.
    const tomorrow = new Date(now.getTime())
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 250)

    const tomorrowPlan = resolveDayPlan(state, tomorrow)
    const firstBell = tomorrowPlan.bells[0]
    const firstBellAt = firstBell ? timeOnDate(tomorrow, firstBell.time).getTime() : Number.POSITIVE_INFINITY
    this.arm(Math.min(tomorrow.getTime(), firstBellAt))
  }

  private arm(at: number): void {
    if (!this.running) return
    if (this.timer) clearTimeout(this.timer)
    const nowMs = Date.now()
    const delay = Math.max(1, Math.min(at - nowMs, MAX_TIMER_MS))
    this.expectedWakeAt = nowMs + delay
    this.timer = setTimeout(() => this.onWake(), delay)
    this.timer.unref?.()
  }

  private onWake(): void {
    this.timer = null
    if (!this.running) return

    const now = new Date()
    this.detectClockChange(now)

    const state = this.store.get()
    const plan = resolveDayPlan(state, now)
    const next = nextBellOf(plan, now)

    if (next) {
      const at = timeOnDate(now, next.time).getTime()
      if (Date.now() < at) {
        // setTimeout woke us a few milliseconds early — wait the exact remainder.
        this.arm(at)
        return
      }
    }

    void this.scan().finally(() => this.armNextWake(new Date()))
    this.events.onStateChanged()
  }

  private detectClockChange(now: Date): void {
    const drift = now.getTime() - this.expectedWakeAt
    const previousDay = isoDayKey(new Date(this.lastCheckedAt))
    const currentDay = isoDayKey(now)
    this.lastCheckedAt = now.getTime()

    if (Math.abs(drift) <= CLOCK_DRIFT_TOLERANCE_MS && previousDay === currentDay) return

    if (previousDay !== currentDay) return // midnight rollover is normal

    const minutes = Math.round(drift / 60000)
    this.log.append('log.clock.changed', 'warn', { minutes })
    this.recalculate()
  }
}
