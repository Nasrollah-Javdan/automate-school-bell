import { useSyncExternalStore } from 'react'
import type { AppSnapshot, LanguageCode, ToastPayload } from '../../types/index.js'
import type { MessageKey, MessageParams } from '../../i18n/index.js'
import { DEFAULT_LANGUAGE } from '../../i18n/index.js'

export type PageId = 'dashboard' | 'schedule'

export interface Toast {
  id: string
  level: ToastPayload['level']
  code: MessageKey
  params?: MessageParams
}

export interface RendererState {
  snapshot: AppSnapshot | null
  toasts: Toast[]
  now: number
  page: PageId
  booted: boolean
  /** Set when the app was created for the very first time. */
  firstRun: boolean
}

/** Minimal external store — no third party state library needed. */
function createStore<T>(initial: T) {
  let state = initial
  const listeners = new Set<() => void>()

  return {
    get: (): T => state,
    set: (updater: (previous: T) => T): void => {
      const next = updater(state)
      if (next === state) return
      state = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export const store = createStore<RendererState>({
  snapshot: null,
  toasts: [],
  now: Date.now(),
  page: 'dashboard',
  booted: false,
  firstRun: false
})

export function useRenderer(): RendererState {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

export const setSnapshot = (snapshot: AppSnapshot): void =>
  store.set((state) => ({ ...state, snapshot, booted: true }))

export const setNow = (now: number): void => store.set((state) => ({ ...state, now }))

export const setPage = (page: PageId): void => store.set((state) => ({ ...state, page }))

export const pushToast = (toast: Toast): void =>
  store.set((state) => ({ ...state, toasts: [...state.toasts, toast] }))

export const dropToast = (id: string): void =>
  store.set((state) => ({ ...state, toasts: state.toasts.filter((toast) => toast.id !== id) }))

/** Convenience accessors used all over the interface. */
export const currentLanguage = (state: RendererState): LanguageCode =>
  state.snapshot?.state.settings.language ?? DEFAULT_LANGUAGE
