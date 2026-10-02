import { BrowserWindow, app } from 'electron'
import type { AudioPlayer } from '../../shared/audioPlayer.js'
import { AudioError } from '../../shared/audioPlayer.js'
import { audioSrcFor } from '../../shared/audioTypes.js'

const START_TIMEOUT_MS = 8000
const PROBE_TIMEOUT_MS = 8000

/**
 * The script injected into the hidden playback window.
 *
 * It owns one `<audio>` element and reports progress by resolving the
 * `executeJavaScript` promise, which keeps the main process in control of the
 * timing and removes any dependency on the page's own messaging.
 */
const HOST_SCRIPT = `
(() => {
  const media = new Audio()
  media.preload = 'auto'

  const waitUntilPlayable = (timeout) =>
    new Promise((resolve, reject) => {
      const cleanup = () => {
        media.removeEventListener('canplaythrough', onReady)
        media.removeEventListener('canplay', onReady)
        media.removeEventListener('error', onError)
        clearTimeout(timer)
      }
      const onReady = () => { cleanup(); resolve(null) }
      const onError = () => {
        cleanup()
        const detail = media.error
        reject(new Error(detail ? (detail.message || 'decode error') + ' (code ' + detail.code + ')' : 'decode error'))
      }
      const timer = setTimeout(onReady, timeout)
      media.addEventListener('canplaythrough', onReady, { once: true })
      media.addEventListener('canplay', onReady, { once: true })
      media.addEventListener('error', onError, { once: true })
      media.load()
    })

  window.__bellHost = {
    async play(src, volume) {
      media.pause()
      media.volume = Math.max(0, Math.min(1, volume))
      media.src = src
      await waitUntilPlayable(2500)
      await media.play()
      return true
    },
    stop() {
      media.pause()
      return true
    },
    async probe(src) {
      const probeMedia = new Audio()
      probeMedia.preload = 'metadata'
      probeMedia.src = src
      await new Promise((resolve, reject) => {
        probeMedia.addEventListener('loadedmetadata', resolve, { once: true })
        probeMedia.addEventListener('canplay', resolve, { once: true })
        probeMedia.addEventListener('error', () => reject(new Error('cannot read the file')), { once: true })
        setTimeout(() => reject(new Error('metadata timeout')), 3000)
      })
      const duration = probeMedia.duration
      probeMedia.src = ''
      return Number.isFinite(duration) ? duration : null
    }
  }
  return true
})()
`

/**
 * Plays audio in a dedicated hidden window.
 *
 * Isolating playback there means bell sounds keep working even when the user
 * interface is hidden, slow or being rebuilt — the bell engine never depends on
 * a visible window.
 */
export class AudioService implements AudioPlayer {
  private window: BrowserWindow | null = null
  private readyPromise: Promise<void> | null = null
  private pending = new Map<string, Promise<void>>()
  private counter = 0
  private disposed = false

  /** Create the playback window and inject the audio controller (idempotent). */
  ensureStarted(): Promise<void> {
    if (this.disposed) return Promise.reject(new AudioError('audio service is disposed'))
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = (async () => {
      const window = new BrowserWindow({
        width: 240,
        height: 160,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        frame: false,
        show: false,
        webPreferences: {
          // No preload and no remote content: this window only plays audio.
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          devTools: false,
          spellcheck: false
        }
      })

      this.window = window

      window.on('closed', () => {
        this.window = null
        this.readyPromise = null
        this.failAll(new AudioError('the audio window was closed'))
      })

      window.webContents.on('render-process-gone', () => {
        this.failAll(new AudioError('the audio window crashed'))
      })

      window.webContents.on('did-fail-load', (_event, code, description) => {
        console.error('[audio] playback window failed to load:', code, description)
      })

      // `about:blank` is enough: the controller is injected right after load.
      await window.loadURL('about:blank')
      await window.webContents.executeJavaScript(HOST_SCRIPT, true)
    })().catch((error: unknown) => {
      this.readyPromise = null
      throw error instanceof Error ? error : new AudioError(String(error))
    })

    return this.readyPromise
  }

  /** Play a file. Resolves as soon as playback has actually started. */
  async play(options: { filePath: string; volume: number }): Promise<void> {
    await this.ensureStarted()
    const window = this.window
    if (!window) throw new AudioError('the audio window is not available')

    const src = audioSrcFor(options.filePath)
    await this.invoke(
      `window.__bellHost.play(${JSON.stringify(src)}, ${Number(options.volume) || 0})`,
      START_TIMEOUT_MS,
      'the sound did not start in time'
    )
  }

  stop(): void {
    const window = this.window
    if (!window) return
    this.pending.clear()
    void window.webContents
      .executeJavaScript('window.__bellHost && window.__bellHost.stop()')
      .catch(() => undefined)
  }

  /** Read the duration of a file, or null when it cannot be determined. */
  async probe(filePath: string): Promise<number | null> {
    await this.ensureStarted()
    const src = audioSrcFor(filePath)
    const value = await this.invoke(
      `window.__bellHost.probe(${JSON.stringify(src)})`,
      PROBE_TIMEOUT_MS,
      'the file could not be read'
    )
    return typeof value === 'number' ? value : null
  }

  /**
   * Run code in the playback window with a timeout.
   * Rejections inside the page are turned into a readable Error.
   */
  private async invoke(expression: string, timeoutMs: number, timeoutMessage: string): Promise<unknown> {
    const window = this.window
    if (!window) throw new AudioError('the audio window is not available')

    this.counter += 1
    const key = `call_${this.counter}`

    const promise = window.webContents
      .executeJavaScript(`Promise.resolve(${expression})`, true)
      .then((value) => value)
      .catch((error: unknown) => {
        throw new AudioError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        this.pending.delete(key)
      })

    this.pending.set(key, promise)

    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new AudioError(timeoutMessage)), timeoutMs)
      timer.unref?.()
    })

    try {
      return await Promise.race([promise, timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private failAll(error: Error): void {
    for (const promise of this.pending.values()) {
      // Rejection handlers are attached by `invoke`; this just clears the map.
      void promise.catch(() => undefined)
    }
    this.pending.clear()
    void error
  }

  dispose(): void {
    this.disposed = true
    this.failAll(new AudioError('audio service stopped'))
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
    this.readyPromise = null
  }
}

void app
