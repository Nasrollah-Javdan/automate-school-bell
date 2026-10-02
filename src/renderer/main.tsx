import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_LANGUAGE } from '../i18n/index.js'
import { App } from './App.js'
import { ErrorBoundary } from './components/ErrorBoundary.js'
import { appendLogs, pushToast, setLogs, setNow, setSnapshot } from './store/appStore.js'
import type { AppSnapshot, LogEntry, ToastPayload } from '../types/index.js'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/pages.css'

const container = document.getElementById('root')
if (!container) throw new Error('root element is missing')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary fallbackLanguage={DEFAULT_LANGUAGE}>
      <App />
    </ErrorBoundary>
  </StrictMode>
)

/* ------------------------------------------------------------------ *
 * Main process bridge — the interface is a view of the main process state.
 * ------------------------------------------------------------------ */

const api = window.api

api.on('app:snapshot', (snapshot: AppSnapshot) => setSnapshot(snapshot))
api.on('clock:tick', (payload) => setNow(payload.now))
api.on('theme:changed', () => {
  void api
    .getSnapshot()
    .then((snapshot) => setSnapshot(snapshot))
    .catch(() => undefined)
})
api.on('log:appended', (entries: LogEntry[]) => appendLogs(entries))
api.on('toast:show', (toast: ToastPayload) => pushToast(toast))

void api
  .getLogs()
  .then((logs) => setLogs(logs))
  .catch(() => setLogs([]))

void api
  .getSnapshot()
  .then((snapshot) => setSnapshot(snapshot))
  .catch((error: unknown) => {
    console.error('[renderer] could not load the application state:', error)
  })
