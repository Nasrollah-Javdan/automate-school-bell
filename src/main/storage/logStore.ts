import type { LogCode, LogEntry, LogLevel } from '../../types/index.js'
import { createId } from '../../utils/id.js'
import { LOG_ENTRY_LIMIT } from '../../shared/validate.js'
import { getLogFile } from './paths.js'
import { readJsonFile, writeJsonFileAtomic } from './jsonFile.js'

type Listener = (entries: LogEntry[]) => void

/** Bounded, persistent activity log. */
export class LogStore {
  private entries: LogEntry[] = []
  private readonly listeners = new Set<Listener>()
  private saveTimer: NodeJS.Timeout | null = null

  private constructor(entries: LogEntry[]) {
    this.entries = entries
  }

  static async load(): Promise<LogStore> {
    const read = await readJsonFile<unknown>(getLogFile())
    if (!Array.isArray(read.value)) return new LogStore([])
    const entries = read.value.filter(
      (entry): entry is LogEntry =>
        typeof entry === 'object' && entry !== null && typeof (entry as LogEntry).code === 'string'
    )
    return new LogStore(entries.slice(-LOG_ENTRY_LIMIT))
  }

  get(): LogEntry[] {
    return this.entries
  }

  append(code: LogCode, level: LogLevel, params: Record<string, string | number> = {}): LogEntry {
    const entry: LogEntry = { id: createId('l'), at: Date.now(), level, code, params }
    this.entries = [...this.entries, entry].slice(-LOG_ENTRY_LIMIT)
    for (const listener of this.listeners) listener([entry])
    this.scheduleSave()
    return entry
  }

  clear(): void {
    this.entries = []
    for (const listener of this.listeners) listener([])
    this.scheduleSave()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void writeJsonFileAtomic(getLogFile(), this.entries).catch((error: unknown) => {
        console.error('[log] could not save log:', error)
      })
    }, 500)
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await writeJsonFileAtomic(getLogFile(), this.entries).catch((error: unknown) => {
      console.error('[log] could not save log:', error)
    })
  }
}
