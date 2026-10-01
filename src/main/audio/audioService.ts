import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainEvent } from 'electron'
import type { AudioCommand, AudioEvent } from '../../shared/audioTypes.js'
import { audioSrcFor } from '../../shared/audioTypes.js'
import type { AudioPlayer } from '../../shared/audioPlayer.js'
import { AudioError } from '../../shared/audioPlayer.js'
import { CH } from '../../shared/channels.js'

const START_TIMEOUT_MS = 8000
const PROBE_TIMEOUT_MS = 8000

interface Pending {
  resolve: (value: never) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Plays audio in a dedicated hidden window.
 *
 * Isolating playback there means bell sounds keep working even if the user
 * interface is hidden, slow or being rebuilt.
 */
export class AudioService implements AudioPlayer {
  private window: BrowserWindow | null = null
  private readyPromise: Promise<void> | null = null
  private resolveReady: (() => void) | null = null
  private readonly pending = new Map<string, Pending>()
  private counter = 0
  private disposed = false
  private lastRequestId: string | null = null

  get isPlaying(): boolean {
    return this.lastRequestId !== null
  }

  /** Create the audio host window (idempotent). */
  ensureStarted(): Promise<void> {
    if (this.disposed) return Promise.reject(new AudioError('audio service is disposed'))
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      try {
        this.createWindow()
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
      setTimeout(() => {
        if (this.resolveReady) {
          this.resolveReady = null
          reject(new AudioError('audio host did not start in time'))
        }
      }, 15000).unref?.()
    })

    return this.readyPromise
  }

  private createWindow(): void {
    const window = new BrowserWindow({
      show: false,
      width: 240,
      height: 160,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        devTools: false,
        spellcheck: false
      }
    })

    window.on('closed', () => {
      this.detachIpc()
      this.window = null
      this.readyPromise = null
      this.resolveReady = null
      this.failAllPending(new AudioError('audio host was closed'))
    })

    window.webContents.on('render-process-gone', () => {
      this.failAllPending(new AudioError('audio host crashed'))
    })

    const handler = (_event: IpcMainEvent, payload: unknown) => this.handleEvent(payload as AudioEvent)
    ipcMain.on(CH.audioHostEvent, handler)
    this.detachIpc = () => ipcMain.off(CH.audioHostEvent, handler)

    void window.loadURL(audioHostUrl())
  }

  private detachIpc: () => void = () => undefined

  private handleEvent(event: AudioEvent): void {
    if (!event || typeof event !== 'object') return
    if (event.type === 'ready') {
      this.resolveReady?.()
      this.resolveReady = null
      return
    }

    const pending = this.pending.get(event.requestId)
    if (!pending) return

    if (event.type === 'started') {
      this.clear(pending)
      this.pending.delete(event.requestId)
      this.lastRequestId = event.requestId
      ;(pending.resolve as (value: unknown) => void)(undefined)
      return
    }

    if (event.type === 'ended') {
      if (this.lastRequestId === event.requestId) this.lastRequestId = null
      if (this.pending.has(event.requestId)) return
      return
    }

    if (event.type === 'probed') {
      this.clear(pending)
      this.pending.delete(event.requestId)
      ;(pending.resolve as (value: unknown) => void)(event.durationSec)
      return
    }

    if (event.type === 'error') {
      this.clear(pending)
      this.pending.delete(event.requestId)
      if (this.lastRequestId === event.requestId) this.lastRequestId = null
      pending.reject(new AudioError(event.message))
    }
  }

  /** Play a sound. Resolves as soon as playback has actually started. */
  async play(options: { filePath: string; volume: number }): Promise<void> {
    await this.ensureStarted()
    const requestId = this.nextId('play')
    const result = new Promise<void>((resolve, reject) => {
      this.register(
        requestId,
        resolve as (value: never) => void,
        reject,
        START_TIMEOUT_MS,
        'the sound did not start in time'
      )
    })
    this.send({ type: 'play', requestId, src: audioSrcFor(options.filePath), volume: clampVolume(options.volume) })
    await result
  }

  stop(): void {
    if (!this.window) return
    const requestId = this.nextId('stop')
    this.lastRequestId = null
    this.send({ type: 'stop', requestId })
  }

  /** Read the duration of a file without playing it. */
  async probe(filePath: string): Promise<number | null> {
    await this.ensureStarted()
    const requestId = this.nextId('probe')
    const result = new Promise<number | null>((resolve, reject) => {
      this.register(
        requestId,
        resolve as (value: never) => void,
        reject,
        PROBE_TIMEOUT_MS,
        'the file could not be read'
      )
    })
    this.send({ type: 'probe', requestId, src: audioSrcFor(filePath) })
    return result
  }

  private register(
    requestId: string,
    resolve: (value: never) => void,
    reject: (error: Error) => void,
    timeout: number,
    timeoutMessage: string
  ): void {
    const timer = setTimeout(() => {
      this.pending.delete(requestId)
      reject(new AudioError(timeoutMessage))
    }, timeout)
    timer.unref?.()
    this.pending.set(requestId, { resolve, reject, timer })
  }

  private clear(pending: Pending): void {
    clearTimeout(pending.timer)
  }

  private failAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.clear(pending)
      pending.reject(error)
      this.pending.delete(id)
    }
    this.lastRequestId = null
  }

  private nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}_${Date.now().toString(36)}_${this.counter}`
  }

  private send(command: AudioCommand): void {
    if (!this.window || this.window.isDestroyed()) return
    this.window.webContents.send(CH.audioHostCommand, command)
  }

  dispose(): void {
    this.disposed = true
    this.failAllPending(new AudioError('audio service stopped'))
    this.detachIpc()
    this.detachIpc = () => undefined
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
    this.readyPromise = null
    this.resolveReady = null
  }
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

function audioHostUrl(): string {
  const devServer = process.env.ELECTRON_RENDERER_URL
  if (devServer) return `${devServer.replace(/\/$/, '')}/audio-host.html`
  return `file://${join(__dirname, '../renderer/audio-host.html').replace(/\\/g, '/')}`
}