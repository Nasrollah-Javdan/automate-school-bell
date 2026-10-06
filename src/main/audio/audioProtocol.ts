import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { app, protocol } from 'electron'
import { AUDIO_SCHEME } from '../../shared/audioTypes.js'
import { isInsideDir, isSupportedSoundFile, soundExtension } from '../storage/soundLibrary.js'
import { getSoundsDir } from '../storage/paths.js'

const MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac'
}

/** Must run before `app.whenReady()`. */
export function registerAudioSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: AUDIO_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

function resolveRequestedPath(requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl)
    const raw = url.searchParams.get('p')
    if (!raw) return null
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null

  if (rawStart === '') {
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(rawStart)
  const end = rawEnd === '' ? size - 1 : Number(rawEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

/**
 * Serves user audio files to the hidden playback window.
 *
 * Three sources are trusted:
 *  - anything inside the app's sounds folder;
 *  - files the user explicitly linked through the file picker;
 *  - the bundled default bell tone that ships with the application.
 *
 * Everything else is refused, so a crafted URL cannot read arbitrary files.
 */
export function registerAudioProtocol(): void {
  protocol.handle(AUDIO_SCHEME, async (request) => {
    const filePath = resolveRequestedPath(request.url)
    if (!filePath || !isSupportedSoundFile(filePath)) {
      return new Response('unsupported audio file', { status: 400 })
    }

    const trusted = isTrustedAudioPath(filePath)
    if (!trusted) {
      console.warn(`[audio] refused a file the user never selected: ${filePath}`)
      return new Response('file is not linked', { status: 403 })
    }

    try {
      const stats = await stat(filePath)
      if (!stats.isFile()) return new Response('not a file', { status: 404 })

      const contentType = MIME_TYPES[soundExtension(filePath)] ?? 'application/octet-stream'
      const rangeHeader = request.headers.get('Range')
      const range = rangeHeader ? parseRange(rangeHeader, stats.size) : null

      if (range) {
        const stream = createReadStream(filePath, { start: range.start, end: range.end })
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(range.end - range.start + 1),
            'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store'
          }
        })
      }

      const stream = createReadStream(filePath)
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stats.size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store'
        }
      })
    } catch {
      return new Response('audio file not found', { status: 404 })
    }
  })
}

/** Paths the user picked through the file dialog, registered by the sound service. */
const linkedPaths = new Set<string>()

export function allowLinkedPath(filePath: string): void {
  linkedPaths.add(filePath)
}

export function forgetLinkedPath(filePath: string): void {
  linkedPaths.delete(filePath)
}

/** Roots whose contents are always safe to serve. */
function trustedRoots(): string[] {
  const roots = [getSoundsDir()]

  // The bell tone that ships with the application. In a packaged build the
  // extra resources sit directly in `process.resourcesPath`; during development
  // they live in the project's `resources` folder next to the asar.
  if (app.isPackaged) {
    if (process.resourcesPath) roots.push(process.resourcesPath)
  } else {
    roots.push(join(app.getAppPath(), 'resources'))
  }

  return roots
}

function isTrustedAudioPath(filePath: string): boolean {
  const normalized = resolve(filePath)
  if (trustedRoots().some((root) => isInsideDir(normalized, root))) return true
  return linkedPaths.has(normalized) || linkedPaths.has(filePath)
}
