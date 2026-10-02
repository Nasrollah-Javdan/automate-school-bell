/** URL helpers for the custom audio scheme. */

export const AUDIO_SCHEME = 'bell-audio'

/**
 * Builds the URL the playback window uses to load a file.
 * The path is carried as a query parameter so Windows paths with spaces,
 * drive letters and non-ASCII characters survive the round trip.
 */
export const audioSrcFor = (filePath: string): string =>
  `${AUDIO_SCHEME}://sound/?p=${encodeURIComponent(filePath)}`
