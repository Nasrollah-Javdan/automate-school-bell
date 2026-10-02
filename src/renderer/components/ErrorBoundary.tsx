import { Component, type ErrorInfo, type ReactNode } from 'react'
import { translate } from '../../i18n/index.js'
import { store } from '../store/appStore.js'
import { Button } from './ui/Button.js'

interface Props {
  children: ReactNode
  /** Used only until the real language has been loaded. */
  fallbackLanguage: 'fa' | 'en'
}

interface State {
  error: Error | null
}

/**
 * The bell engine lives in the main process, so a failure in the interface
 * never stops the schedule. This screen keeps the app usable: the user can
 * reload the window and immediately see the correct state again.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] interface error:', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const lang = store.get().snapshot?.state.settings.language ?? this.props.fallbackLanguage
    const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)

    return (
      <div className="crash" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        <div className="crash__card">
          <h1>{t('error.title')}</h1>
          <p className="text-2 text-sm">{t('error.description')}</p>
          <code className="text-xs text-3 selectable" style={{ direction: 'ltr' }}>
            {error.message}
          </code>
          <Button variant="primary" onClick={() => window.location.reload()}>
            {t('error.reload')}
          </Button>
        </div>
      </div>
    )
  }
}
