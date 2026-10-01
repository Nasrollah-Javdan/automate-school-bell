import { useEffect, type JSX } from 'react'
import { useRenderer, dropToast, setPage, type PageId } from '../store/appStore.js'
import { translate } from '../../i18n/index.js'
import { Icon, type IconName } from './Icon.js'

const AUTO_HIDE_MS: Record<string, number> = {
  success: 2600,
  info: 3600,
  warn: 6000,
  error: 9000
}

const ICONS: Record<string, IconName> = {
  success: 'checkCircle',
  info: 'info',
  warn: 'alert',
  error: 'alert'
}

function ToastItem({ id, code, level, params, actionId }: ReturnType<typeof useRenderer>['toasts'][number]): JSX.Element {
  const { snapshot } = useRenderer()
  const lang = snapshot?.state.settings.language ?? 'fa'
  const text = translate(lang, code, params)

  useEffect(() => {
    const timer = window.setTimeout(() => dropToast(id), AUTO_HIDE_MS[level] ?? 4000)
    return () => window.clearTimeout(timer)
  }, [id, level])

  return (
    <div className={`toast toast--${level}`} role={level === 'error' ? 'alert' : 'status'}>
      <span className="toast__icon">
        <Icon name={ICONS[level] ?? 'info'} size={17} />
      </span>
      <span className="grow">{text}</span>
      {actionId ? (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            dropToast(id)
            setPage(actionId as PageId)
          }}
        >
          {translate(lang, actionId === 'sounds' ? 'toast.action.reselect' : 'toast.action.openSettings')}
        </button>
      ) : null}
    </div>
  )
}

/** Bottom-centre notifications: bell events, errors and confirmations. */
export function ToastHost(): JSX.Element | null {
  const { toasts } = useRenderer()
  if (toasts.length === 0) return null

  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          code={toast.code}
          level={toast.level}
          params={toast.params}
          actionId={toast.actionId}
        />
      ))}
    </div>
  )
}