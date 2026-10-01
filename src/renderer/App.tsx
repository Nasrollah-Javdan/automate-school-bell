import { useEffect, type JSX } from 'react'
import { DEFAULT_LANGUAGE } from '../i18n/index.js'
import { directionOf } from '../i18n/index.js'
import { AppShell } from './layouts/AppShell.js'
import { ToastHost } from './components/ToastHost.js'
import { Spinner } from './components/ui/Form.js'
import { useRenderer } from './store/appStore.js'
import { useClock } from './hooks/useClock.js'
import { useAppHotkeys } from './hooks/useAppHotkeys.js'
import { DashboardPage } from './pages/DashboardPage.js'
import { SchedulePage } from './pages/SchedulePage.js'
import { SoundsPage } from './pages/SoundsPage.js'
import { HolidaysPage } from './pages/HolidaysPage.js'
import { LogPage } from './pages/LogPage.js'
import { SettingsPage } from './pages/SettingsPage.js'

export function App(): JSX.Element {
  const { snapshot, logs, page, now } = useRenderer()
  const lang = snapshot?.state.settings.language ?? DEFAULT_LANGUAGE
  const dark = snapshot?.effectiveDark ?? false
  const uiScale = snapshot?.state.settings.uiScale ?? 100

  useClock()
  useAppHotkeys(Boolean(snapshot))

  /* Document level attributes: language, direction, theme and UI scale. */
  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = directionOf(lang)
    root.dataset.theme = dark ? 'dark' : 'light'
    root.style.setProperty('--ui-scale', String(uiScale / 100))
  }, [lang, dark, uiScale])

  if (!snapshot) {
    return (
      <div className="crash" dir={directionOf(lang)}>
        <Spinner />
      </div>
    )
  }

  return (
    <AppShell lang={lang}>
      {page === 'dashboard' ? <DashboardPage lang={lang} snapshot={snapshot} now={now} /> : null}
      {page === 'schedule' ? <SchedulePage lang={lang} snapshot={snapshot} /> : null}
      {page === 'sounds' ? <SoundsPage lang={lang} snapshot={snapshot} /> : null}
      {page === 'holidays' ? <HolidaysPage lang={lang} snapshot={snapshot} /> : null}
      {page === 'log' ? <LogPage lang={lang} logs={logs} /> : null}
      {page === 'settings' ? <SettingsPage lang={lang} snapshot={snapshot} /> : null}
      <ToastHost />
    </AppShell>
  )
}