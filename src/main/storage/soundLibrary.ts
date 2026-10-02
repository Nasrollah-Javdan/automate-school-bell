import { copyFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import type { Sound } from '../../types/index.js'
import { uniqueFileName } from '../../utils/id.js'
import { errorMessage, fileExists } from './jsonFile.js'

/** Containers the built-in Chromium decoder can play without extra codecs. */
export const SUPPORTED_SOUND_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.oga', '.flac'] as const

export function soundExtension(filePath: string): string {
  return extname(filePath).toLowerCase()
}

export function isSupportedSoundFile(filePath: string): boolean {
  return (SUPPORTED_SOUND_EXTENSIONS as readonly string[]).includes(soundExtension(filePath))
}

export function isInsideDir(filePath: string, dir: string): boolean {
  const target = resolve(filePath)
  const root = resolve(dir)
  return target === root || target.startsWith(`${root}/`) || target.startsWith(`${root}\\`)
}

/** Absolute location of a sound on disk. */
export function soundFilePath(sound: Sound, soundsDir: string): string {
  return sound.source === 'external' && sound.externalPath
    ? sound.externalPath
    : join(soundsDir, sound.fileName ?? '')
}

export function soundDisplayName(filePath: string): string {
  return basename(filePath, extname(filePath)).slice(0, 80)
}

export async function isSoundAvailable(sound: Sound, soundsDir: string): Promise<boolean> {
  return fileExists(soundFilePath(sound, soundsDir))
}

export interface ImportResult {
  fileName: string
  name: string
}

/**
 * Copy an audio file into the application sounds folder so the bell keeps
 * working even if the original file is moved or deleted.
 */
export async function importSoundFile(sourcePath: string, soundsDir: string): Promise<ImportResult> {
  if (!isSupportedSoundFile(sourcePath)) throw new Error('unsupported format')

  const stats = await stat(sourcePath)
  if (!stats.isFile()) throw new Error('not a file')
  if (stats.size === 0) throw new Error('file is empty')

  const fileName = uniqueFileName(soundDisplayName(sourcePath), soundExtension(sourcePath))
  const target = join(soundsDir, fileName)
  await copyFile(sourcePath, target)
  return { fileName, name: soundDisplayName(sourcePath) }
}

/** True when a file with the same name and size is already imported. */
export async function findExistingImport(sourcePath: string, soundsDir: string): Promise<string | null> {
  const size = (await stat(sourcePath)).size
  const files = await readdir(soundsDir).catch(() => [] as string[])
  for (const file of files) {
    if (soundExtension(file) !== soundExtension(sourcePath)) continue
    const candidate = join(soundsDir, file)
    const stats = await stat(candidate).catch(() => null)
    if (stats && stats.isFile() && stats.size === size) return file
  }
  return null
}

/**
 * Delete a sound file that this application copied itself.
 * Files linked from outside are never touched.
 */
export async function removeSoundFile(sound: Sound, soundsDir: string): Promise<void> {
  if (sound.source !== 'library' || !sound.fileName) return
  const target = join(soundsDir, sound.fileName)
  if (!isInsideDir(target, soundsDir)) throw new Error('refusing to delete outside the sounds folder')
  await rm(target, { force: true }).catch((error: unknown) => {
    throw new Error(errorMessage(error))
  })
}
