import { useMemo, useState, type JSX } from 'react'
import type { LanguageCode, LogEntry } from '../../types/index.js'
import { logEntryText, translate } from '../../i18n/index.js'
import { formatClockTime, isSameDay, pad2 } from '../../utils/time.js'
import { formatJalaliShort } from '../../utils/jalali.js'
import { Button } from '../components/ui/Button.js'
import { Card, CardBody, CardHeader } from '../components/ui/Card.js'
import { EmptyState, Segmented } from '../components/ui/Form.js'
import { useConfirm } from '../components/ui/Modal.js'
import { setLogs } from '../store/appStore.js'
import { runSafely } from '../hooks/useAsyncAction.js'

type Filter = 'all' | 'success' | 'warn' | 'error'

const FILTERS: readonly Filter[] = ['all', 'success', 'warn', 'error']

const FILTER_LABELS: Record<Filter, 'log.filterAll' | 'common.success' | 'common.warning' | 'common.error'> = {
  all: 'log.filterAll',
  success: 'common.success',
  warn: 'common.warning',
  error: 'common.error'
}

export function LogPage({ lang, logs }: { lang: LanguageCode; logs: LogEntry[] }): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const confirm = useConfirm()

  const visible = useMemo(
    () => (filter === 'all' ? logs : logs.filter((entry) => entry.level === filter)).slice().reverse(),
    [logs, filter]
  )

  const timeLabel = (at: number): string => {
    const date = new Date(at)
    const time = formatClockTime(`${pad2(date.getHours())}:${pad2(date.getMinutes())}`, lang)
    return isSameDay(date, new Date()) ? time : `${formatJalaliShort(date, lang)} · ${time}`
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{translate(lang, 'log.title')}</h1>
          <p className="page__subtitle">{translate(lang, 'log.subtitle')}</p>
        </div>
        <div className="btn-group">
          <Segmented
            ariaLabel={translate(lang, 'log.filterAll')}
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((item) => ({ value: item, label: translate(lang, FILTER_LABELS[item]) }))}
          />
          <Button
            variant="danger"
            icon="trash"
            disabled={logs.length === 0}
            onClick={() =>
              confirm.request({
                title: translate(lang, 'log.clear'),
                message: translate(lang, 'log.clearConfirm'),
                confirmLabel: translate(lang, 'common.delete'),
                cancelLabel: translate(lang, 'common.cancel'),
                tone: 'danger',
                onConfirm: () =>
                  runSafely(async () => {
                    await window.api.clearLogs()
                    setLogs([])
                  })
              })
            }
          >
            {translate(lang, 'log.clear')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title={translate(lang, 'log.title')} icon="clock" />
        <CardBody flush>
          {visible.length === 0 ? (
            <EmptyState
              icon="clock"
              title={translate(lang, 'log.empty')}
              hint={translate(lang, 'log.emptyHint')}
            />
          ) : (
            <div className="log-list">
              {visible.map((entry) => (
                <div key={entry.id} className="log-entry">
                  <span className="log-entry__time">{timeLabel(entry.at)}</span>
                  <span className={`log-entry__dot log-entry__dot--${entry.level}`} aria-hidden="true" />
                  <span className="log-entry__message">{logEntryText(lang, entry.code, entry.params)}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {confirm.dialog}
    </div>
  )
}