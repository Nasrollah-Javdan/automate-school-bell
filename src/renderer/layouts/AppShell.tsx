import type { JSX, ReactNode } from 'react'
import type { LanguageCode, SystemMode } from '../../types/index.js'
import { translate } from '../../i18n/index.js'
import { useRenderer, setPage, type PageId } from '../store/appStore.js'
import { Icon, type IconName } from '../components/Icon.js'
import { IconButton } from '../components/ui/Button.js'
import { StatusPill } from '../components/ui/Card.js'

interface NavEntry {
  id: PageId
  labelKey: Parameters<typeof translate>[1]
  icon: IconName
}

const NAV: NavEntry[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
  { id: 'schedule', labelKey: 'nav.schedule', icon: 'list' }
]

export function AppShell({ lang, children }: { lang: LanguageCode; children: ReactNode }): JSX.Element {
  const { snapshot, page } = useRenderer()
  const mode: SystemMode = snapshot?.state.systemMode ?? 'active'
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark">
            <Icon name="bell" size={20} />
          </span>
          <div>
            <div className="brand__title">{t('app.name')}</div>
            <div className="brand__subtitle">{t('app.tagline')}</div>
          </div>
        </div>

        <div className="row">
          <StatusPill mode={mode} lang={lang} />
          <IconButton
            icon="minimize"
            label={t('common.close')}
            onClick={() => {
              void window.api.window.minimize()
            }}
          />
        </div>
      </header>

      <nav className="nav" aria-label={t('app.name')}>
        {NAV.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`nav__item${page === entry.id ? ' nav__item--active' : ''}`}
            aria-current={page === entry.id ? 'page' : undefined}
            onClick={() => setPage(entry.id)}
          >
            <Icon name={entry.icon} size={19} />
            <span className="nav__label">{t(entry.labelKey)}</span>
          </button>
        ))}
        <span className="nav__spacer" />
      </nav>

      <main className="app-main">{children}</main>
    </div>
  )
}
