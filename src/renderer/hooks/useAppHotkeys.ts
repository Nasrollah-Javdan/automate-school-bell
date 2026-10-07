import { useMemo } from 'react'
import type { SystemMode } from '../../types/index.js'
import { useRenderer } from '../store/appStore.js'
import { useHotkeys } from './useHotkeys.js'
import { runSafely } from './useAsyncAction.js'

/**
 * Application wide shortcuts:
 *   Space      → start / pause
 *   Ctrl + T   → test bell
 *   Esc        → close dialog (handled by the dialog itself)
 */
export function useAppHotkeys(enabled: boolean): void {
  const { snapshot } = useRenderer()
  const mode: SystemMode = snapshot?.state.systemMode ?? 'active'

  const handlers = useMemo(
    () => ({
      space: () => {
        const next: SystemMode = mode === 'active' ? 'paused' : 'active'
        runSafely(() => window.api.setSystemMode(next))
      },
      'mod+t': () => {
        runSafely(() => window.api.playTestBell())
      }
    }),
    [mode]
  )

  useHotkeys(handlers, enabled)
}
