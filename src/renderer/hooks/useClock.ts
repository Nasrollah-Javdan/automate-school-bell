import { useEffect } from 'react'
import { setNow } from '../store/appStore.js'

const TICK_MS = 250

/**
 * A local, always accurate clock.
 *
 * The renderer keeps its own time instead of polling the main process, so the
 * dashboard clock and countdown stay smooth even while a sound is playing.
 */
export function useClock(): void {
  useEffect(() => {
    const update = (): void => {
      if (document.visibilityState !== 'hidden') setNow(Date.now())
    }

    update()
    const timer = window.setInterval(update, TICK_MS)
    const onVisible = (): void => update()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
