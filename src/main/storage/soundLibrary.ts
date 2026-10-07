import { basename, extname, join, resolve } from 'node:path'
import type { Sound } from '../../types/index.js'
import { fileExists } from './jsonFile.js'

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
