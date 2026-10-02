import { useCallback, useRef, useState } from 'react'
import { pushToast } from '../store/appStore.js'

/**
 * Runs an async operation, prevents double clicks and turns any failure into
 * a visible message instead of an unhandled rejection.
 */
export function useAsyncAction<A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>
): {
  run: (...args: A) => Promise<void>
  busy: boolean
} {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)

  const run = useCallback(
    async (...args: A): Promise<void> => {
      if (running.current) return
      running.current = true
      setBusy(true)
      try {
        const result = await fn(...args)
        if (result && typeof result === 'object' && 'ok' in result) {
          const outcome = result as { ok: boolean; error?: string }
          if (!outcome.ok) {
            pushToast({
              id: `err_${Date.now()}`,
              level: 'error',
              code: 'toast.errorGeneric',
              params: { error: outcome.error ?? '' }
            })
          }
        }
      } catch (error) {
        pushToast({
          id: `err_${Date.now()}`,
          level: 'error',
          code: 'toast.errorGeneric',
          params: { error: error instanceof Error ? error.message : String(error) }
        })
      } finally {
        running.current = false
        setBusy(false)
      }
    },
    [fn]
  )

  return { run, busy }
}

/** Fire-and-forget wrapper used by plain event handlers. */
export function runSafely(fn: () => Promise<unknown>): void {
  void fn()
    .then((result) => {
      if (result && typeof result === 'object' && 'ok' in result) {
        const outcome = result as { ok: boolean; error?: string }
        if (!outcome.ok) {
          pushToast({
            id: `err_${Date.now()}`,
            level: 'error',
            code: 'toast.errorGeneric',
            params: { error: outcome.error ?? '' }
          })
        }
      }
    })
    .catch((error: unknown) => {
      pushToast({
        id: `err_${Date.now()}`,
        level: 'error',
        code: 'toast.errorGeneric',
        params: { error: error instanceof Error ? error.message : String(error) }
      })
    })
}
