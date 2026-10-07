import type { AppState } from '../../types/index.js'
import { APP_STATE_VERSION } from '../../types/index.js'
import { createDefaultState } from '../../shared/defaults.js'
import { parseAppState } from '../../shared/validate.js'
import { getStateFile } from './paths.js'
import { errorMessage, readJsonFile, writeJsonFileAtomic } from './jsonFile.js'

type Listener = (state: AppState) => void

/**
 * Single source of truth for the application state.
 *
 * The UI never writes files: every change goes through {@link AppStore.update},
 * which notifies listeners immediately and persists to disk in the background.
 */
export class AppStore {
  private state: AppState
  private readonly listeners = new Set<Listener>()
  private saveTimer: NodeJS.Timeout | null = null
  private saveError: string | null = null
  private pending: Promise<void> | null = null
  private dirty = false

  private constructor(state: AppState) {
    this.state = state
  }

  static async load(): Promise<{
    store: AppStore
    recovered: boolean
    created: boolean
    notes: string[]
    error: string | null
  }> {
    const file = getStateFile()
    const read = await readJsonFile<unknown>(file)
    const notes: string[] = []

    if (read.value === null) {
      const state = createDefaultState()
      const store = new AppStore(state)
      await store.writeNow().catch(() => undefined)
      return { store, recovered: false, created: true, notes, error: read.error }
    }

    try {
      const parsed = parseAppState(read.value)
      notes.push(...parsed.notes)
      const store = new AppStore(parsed.value)
      return {
        store,
        recovered: parsed.recovered || read.recovered,
        created: false,
        notes,
        error: read.error
      }
    } catch (error) {
      notes.push(`state could not be parsed: ${errorMessage(error)}`)
      const store = new AppStore(createDefaultState())
      await store.writeNow().catch(() => undefined)
      return { store, recovered: true, created: false, notes, error: read.error }
    }
  }

  get(): AppState {
    return this.state
  }

  /** Apply a change, notify listeners and schedule a debounced write. */
  update(mutator: (draft: AppState) => void): AppState {
    const draft = structuredClone(this.state)
    mutator(draft)
    draft.version = APP_STATE_VERSION
    this.state = draft
    this.dirty = true
    for (const listener of this.listeners) listener(this.state)
    this.scheduleSave()
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getLastSaveError(): string | null {
    return this.saveError
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.persist()
    }, 200)
    // Never let a pending write keep the process alive on its own.
    this.saveTimer.unref?.()
  }

  private async persist(): Promise<void> {
    const snapshot = this.state
    this.dirty = false
    this.pending = writeJsonFileAtomic(getStateFile(), snapshot)
      .then(() => {
        this.saveError = null
      })
      .catch((error: unknown) => {
        this.dirty = true
        this.saveError = errorMessage(error)
        console.error('[storage] could not save state:', this.saveError)
      })
    await this.pending
    this.pending = null
  }

  /**
   * Write any pending change immediately.
   * Called on quit and before risky operations, so nothing is ever lost.
   */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.dirty || this.pending) await this.persist()
    if (this.pending) await this.pending
  }

  /** Write the state to disk unconditionally (used when creating the first file). */
  async writeNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    await this.persist()
  }
}
