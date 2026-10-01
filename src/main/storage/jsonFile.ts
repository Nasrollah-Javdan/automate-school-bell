import { constants } from 'node:fs'
import { access, copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Crash-safe JSON persistence.
 *
 * Every write goes to a temporary file first and is then renamed over the
 * target, which is atomic on NTFS, ext4 and APFS. A `.bak` copy of the last
 * known good file is kept so a truncated file can be recovered.
 */

export interface ReadResult<T> {
  value: T | null
  /** true when the primary file was unusable but the backup worked */
  recovered: boolean
  error: string | null
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

export async function readJsonFile<T>(file: string): Promise<ReadResult<T>> {
  const primary = await tryRead(file)
  if (primary.ok) return { value: primary.value as T, recovered: false, error: null }

  const backup = await tryRead(`${file}.bak`)
  if (backup.ok) {
    return { value: backup.value as T, recovered: true, error: primary.error ?? null }
  }

  return { value: null, recovered: false, error: primary.error ?? null }
}

async function tryRead(file: string): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  try {
    const text = await readFile(file, 'utf8')
    if (!text.trim()) return { ok: false, error: 'file is empty' }
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (error) {
    if (isMissing(error)) return { ok: false, error: 'file not found' }
    return { ok: false, error: errorMessage(error) }
  }
}

export async function writeJsonFileAtomic(file: string, data: unknown): Promise<void> {
  await ensureDir(dirname(file))
  const tmp = `${file}.tmp`

  try {
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  } catch (error) {
    await unlink(tmp).catch(() => undefined)
    throw new Error(`Could not write ${file}: ${errorMessage(error)}`)
  }

  try {
    if (await exists(file)) {
      await copyFile(file, `${file}.bak`).catch(() => undefined)
    }
  } catch {
    /* keeping a backup is best effort only */
  }

  await rename(tmp, file)
}

export async function fileExists(file: string): Promise<boolean> {
  return exists(file)
}

export async function deleteFileQuietly(file: string): Promise<void> {
  await unlink(file).catch(() => undefined)
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}

export function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}