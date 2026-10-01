/** Messages exchanged with the hidden audio host window. */

export const AUDIO_SCHEME = 'bell-audio'

export type AudioCommand =
  | { type: 'play'; requestId: string; src: string; volume: number }
  | { type: 'stop'; requestId: string }
  | { type: 'probe'; requestId: string; src: string }

export type AudioEvent =
  | { type: 'ready' }
  | { type: 'started'; requestId: string }
  | { type: 'ended'; requestId: string }
  | { type: 'error'; requestId: string; message: string }
  | { type: 'probed'; requestId: string; durationSec: number | null }

export const audioSrcFor = (filePath: string): string =>
  `${AUDIO_SCHEME}://sound/?p=${encodeURIComponent(filePath)}`