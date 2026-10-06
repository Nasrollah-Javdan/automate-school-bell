/**
 * Audio abstraction used by the bell engine.
 *
 * The engine only needs "play this file at this volume", so it depends on this
 * interface instead of the Electron audio service. That keeps the scheduler
 * testable and makes the separation of concerns explicit.
 */

export interface PlayOptions {
  /** Absolute path of the audio file. */
  filePath: string
  /** 0..1 */
  volume: number
}

/**
 * Which engine actually produced the sound.
 *
 * `native` is Windows' own player, `embedded` is Chromium in a hidden window.
 * Recorded in the activity log so a report of "the bell did not ring" can be
 * traced to a specific backend.
 */
export type PlaybackBackend = 'native' | 'embedded'

export interface AudioPlayer {
  play(options: PlayOptions): Promise<void>
  stop(): void
  /** Read the duration of a file, or null when it cannot be determined. */
  probe(filePath: string): Promise<number | null>
  dispose(): void
  /** Backend that played the last sound, when the player tracks it. */
  readonly lastBackend?: PlaybackBackend | null
}

export class AudioError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AudioError'
  }
}

/** Effective volume: master level × per-sound level, clamped to 0..1. */
export function combinedVolume(masterPercent: number, soundPercent: number): number {
  const master = clamp01(masterPercent / 100)
  const sound = clamp01(soundPercent / 100)
  return master * sound
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
