import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The native Windows player spawns a child process, which is impossible to run
 * in a unit test on Linux. These tests therefore drive the module through a
 * fake `child_process.spawn` and check the contract that matters for a bell:
 * resolve as soon as the sound is audible, never hang, and never resolve when
 * the file could not be opened.
 */

const spawnMock = vi.hoisted(() => vi.fn())

// `process.platform` is read at call time inside the module, so replacing the
// property is enough and avoids mocking the whole Node builtin.
vi.mock('node:child_process', () => ({ spawn: spawnMock }))

const { isNativePlaybackSupported, playNativeSound, stopNativeSound } =
  await import('../src/main/audio/nativePlayer.js')

const realPlatform = process.platform

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

/** Minimal stand-in for a spawned PowerShell process. */
class FakeChild {
  stdout = new FakeStream()
  stderr = new FakeStream()
  killed = false
  private listeners = new Map<string, Array<(arg?: unknown) => void>>()

  on(event: string, listener: (arg?: unknown) => void): this {
    const list = this.listeners.get(event) ?? []
    list.push(listener)
    this.listeners.set(event, list)
    return this
  }

  emit(event: string, arg?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(arg)
  }

  kill(): boolean {
    this.killed = true
    return true
  }
}

class FakeStream {
  private listeners: Array<(chunk: string) => void> = []
  setEncoding(): void {}
  on(_event: string, listener: (chunk: string) => void): this {
    this.listeners.push(listener)
    return this
  }
  write(chunk: string): void {
    for (const listener of this.listeners) listener(chunk)
  }
}

const START_SIGNAL = '__ds_bell_playing__'

function install(): FakeChild {
  const child = new FakeChild()
  spawnMock.mockReturnValue(child)
  return child
}

/** Arguments the module passed to `spawn`. */
function spawnArgs(): string[] {
  return spawnMock.mock.calls.at(-1)?.[1] as string[]
}

beforeEach(() => {
  vi.useFakeTimers()
  setPlatform('win32')
  spawnMock.mockReset()
  install()
})

afterEach(() => {
  vi.useRealTimers()
  setPlatform(realPlatform)
})

describe('platform support', () => {
  it('is available on Windows only', () => {
    expect(isNativePlaybackSupported()).toBe(true)
    setPlatform('linux')
    expect(isNativePlaybackSupported()).toBe(false)
  })

  it('refuses to play anywhere but Windows', async () => {
    setPlatform('darwin')
    await expect(playNativeSound('/sounds/bell.mp3', 0.8)).rejects.toThrow(/Windows/i)
    expect(spawnMock).not.toHaveBeenCalled()
  })
})

describe('process arguments', () => {
  it('hides the console window so no black box appears on the classroom screen', () => {
    const child = install()
    void playNativeSound('/sounds/bell.mp3', 0.8)

    const args = spawnArgs()
    expect(args).toContain('-WindowStyle')
    expect(args[args.indexOf('-WindowStyle') + 1]).toBe('Hidden')
    expect(spawnMock.mock.calls.at(-1)?.[2]).toMatchObject({ windowsHide: true })
    expect(child.killed).toBe(false)
  })

  it('bypasses execution policy so a locked-down machine still works', () => {
    void playNativeSound('/sounds/bell.mp3', 0.8)

    const args = spawnArgs()
    expect(args[args.indexOf('-ExecutionPolicy') + 1]).toBe('Bypass')
  })

  it('passes the file path as a quoted PowerShell literal, not raw text', async () => {
    const child = install()
    const path = "C:\\Program Files\\School Bell\\O'Brien Bell.mp3"
    void playNativeSound(path, 0.5)

    const script = spawnArgs().at(-1) as string
    // The apostrophe must be doubled or PowerShell would end the string early.
    expect(script).toContain("'C:\\Program Files\\School Bell\\O''Brien Bell.mp3'")
    // An unbalanced script would throw a parse error before playing anything.
    expect(script.split('{').length).toBe(script.split('}').length)
    expect(child.killed).toBe(false)
  })

  it('clamps the volume into the range the player accepts', () => {
    void playNativeSound('/sounds/bell.mp3', 5)
    expect(spawnArgs().at(-1)).toContain('[double]1.000')

    install()
    void playNativeSound('/sounds/bell.mp3', -2)
    expect(spawnArgs().at(-1)).toContain('[double]0.000')
  })
})

describe('resolution', () => {
  it('resolves as soon as the start signal arrives, not when the file ends', async () => {
    const child = install()
    const played = playNativeSound('/sounds/bell.mp3', 0.8)

    child.stdout.write(`${START_SIGNAL}\n`)
    await expect(played).resolves.toBeUndefined()
    // Still playing: the child must stay killable so `stop()` can interrupt it.
    expect(child.killed).toBe(false)
  })

  it('does not resolve when the file cannot be opened', async () => {
    const child = install()
    const played = playNativeSound('/sounds/bell.mp3', 0.8)
    const settled = played.then(
      () => 'resolved',
      () => 'rejected'
    )

    child.stderr.write('the sound file could not be opened\r\n')
    child.emit('close', 1)

    await expect(settled).resolves.toBe('rejected')
  })

  it('reports a clear reason when the file is simply not there', async () => {
    const child = install()
    const settled = playNativeSound('/sounds/missing.mp3', 0.8).then(
      () => 'resolved',
      (error: Error) => error.message
    )

    child.emit('close', 1)
    await expect(settled).resolves.toMatch(/exited with code 1/)
  })

  it('gives up instead of hanging when Windows never starts the sound', async () => {
    const child = install()
    const settled = playNativeSound('/sounds/bell.mp3', 0.8).then(
      () => 'resolved',
      () => 'rejected'
    )

    await vi.advanceTimersByTimeAsync(25_000)
    await expect(settled).resolves.toBe('rejected')
    expect(child.killed).toBe(true)
  })

  it('fails cleanly when spawning itself is not possible', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('powershell.exe is blocked by policy')
    })
    await expect(playNativeSound('/sounds/bell.mp3', 0.8)).rejects.toThrow(/blocked by policy/)
  })
})

describe('stop', () => {
  it('kills the player that is still sounding', async () => {
    const child = install()
    const played = playNativeSound('/sounds/bell.mp3', 0.8)
    child.stdout.write(START_SIGNAL)
    await played

    stopNativeSound()
    expect(child.killed).toBe(true)
  })

  it('does nothing when nothing is playing', () => {
    expect(() => stopNativeSound()).not.toThrow()
  })

  it('kills the previous sound before starting the next one', () => {
    const first = install()
    void playNativeSound('/sounds/bell.mp3', 0.8)
    const second = install()
    void playNativeSound('/sounds/bell.mp3', 0.8)

    expect(first.killed).toBe(true)
    expect(second.killed).toBe(false)
  })
})

describe('fallback to SoundPlayer', () => {
  it('tries SoundPlayer for a WAV that MediaPlayer refused', async () => {
    const first = install()
    const settled = playNativeSound('/sounds/bell.wav', 0.8).then(
      () => 'resolved',
      () => 'rejected'
    )

    // The WPF player refuses the file…
    first.emit('close', 1)
    await vi.advanceTimersByTimeAsync(0)

    const second = spawnMock.mock.results.at(-1) as { value: FakeChild }
    // …so the WAV-only fallback runs instead.
    expect(spawnArgs().at(-1)).toContain('System.Media.SoundPlayer')
    second.value.stdout.write(START_SIGNAL)

    await expect(settled).resolves.toBe('resolved')
  })

  it('does not try SoundPlayer for an MP3 it cannot play', async () => {
    const first = install()
    const settled = playNativeSound('/sounds/bell.mp3', 0.8).then(
      () => 'resolved',
      () => 'rejected'
    )

    first.emit('close', 1)
    await expect(settled).resolves.toBe('rejected')
    // Only one attempt: SoundPlayer cannot read MP3 files.
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })
})
