import { useEffect } from 'react'

type Handler = (event: KeyboardEvent) => void

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const ACTIVATABLE_TAGS = new Set(['BUTTON', 'A', 'SUMMARY'])

const isEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return TEXT_TAGS.has(target.tagName) || target.isContentEditable
}

/** True when Space belongs to the focused control, not to a shortcut. */
const spaceBelongsToControl = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (ACTIVATABLE_TAGS.has(target.tagName) || target.getAttribute('role') === 'switch')

/**
 * Global keyboard shortcuts.
 *
 * Shortcuts never fire while the user is typing a bell title or a note, and
 * Space is left alone when a button has focus so the keyboard stays accessible.
 */
export function useHotkeys(handlers: Record<string, Handler>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key === ' ' ? 'space' : event.key.toLowerCase()
      const combo = [event.ctrlKey || event.metaKey ? 'mod' : '', event.altKey ? 'alt' : '', key]
        .filter(Boolean)
        .join('+')

      const handler = handlers[combo]
      if (!handler) return

      if (isEditable(event.target)) return
      if (key === 'space' && spaceBelongsToControl(event.target)) return

      event.preventDefault()
      handler(event)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers, enabled])
}

/** Human readable shortcut hints, used in tooltips. */
export const SHORTCUT_HINTS = {
  startPause: 'Space',
  testBell: 'Ctrl + T',
  settings: 'Ctrl + ,'
} as const