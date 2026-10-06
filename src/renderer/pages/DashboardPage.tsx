import { useMemo, type JSX } from 'react'
import type { AppSnapshot, LanguageCode, SystemMode, TodayBell } from '../../types/index.js'
import { translate } from '../../i18n/index.js'
import { buildTodayView } from '../../shared/today.js'
import { formatClockTime, formatClockTimeWithSeconds, formatCountdown, timeOnDate } from '../../utils/time.js'
import { formatGregorian, formatJalali } from '../../utils/jalali.js'
import { Button } from '../components/ui/Button.js'
import { Badge, Card, CardBody, CardHeader, StatusPill } from '../components/ui/Card.js'
import { EmptyState, Notice } from '../components/ui/Form.js'
import { Icon, type IconName } from '../components/Icon.js'
import { useAsyncAction } from '../hooks/useAsyncAction.js'

function StatusCell({ bell, lang }: { bell: TodayBell; lang: LanguageCode }): JSX.Element {
  const icon: IconName | null =
    bell.status === 'done'
      ? 'check'
      : bell.status === 'next'
        ? 'arrowDown'
        : bell.status === 'skipped'
          ? 'minus'
          : null

  return (
    <span className={`status-cell status-cell--${bell.status}`}>
      {icon ? <Icon name={icon} size={15} /> : null}
      {translate(lang, `dashboard.bellStatus.${bell.status}`)}
    </span>
  )
}

export function DashboardPage({
  lang,
  snapshot,
  now
}: {
  lang: LanguageCode
  snapshot: AppSnapshot
  now: number
}): JSX.Element {
  const { state } = snapshot
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params)

  // Second-resolution time drives the bell statuses, so this recomputes once a
  // second rather than on every animation frame.
  const second = Math.floor(now / 1000)
  const view = useMemo(() => {
    const date = new Date(second * 1000)
    return buildTodayView(state, date, date)
  }, [state, second])
  const nowDate = new Date(now)
  const mode = state.systemMode
  const nextBell = view.nextBell
  const countdown = nextBell ? timeOnDate(nowDate, nextBell.time).getTime() - nowDate.getTime() : null
  const doneCount = view.todayBells.filter((bell) => bell.status === 'done').length

  const setMode = useAsyncAction(async (next: SystemMode) => window.api.setSystemMode(next))
  const testBell = useAsyncAction(async () => window.api.playTestBell())

  const soundNameOf = (bell: TodayBell): string => {
    if (!bell.soundId) return t('schedule.bellSoundDefault')
    return state.sounds.find((sound) => sound.id === bell.soundId)?.name ?? t('schedule.bellSoundNone')
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="hero__top">
          <StatusPill mode={mode} lang={lang} size="lg" />
          <div className="day-summary">
            {view.dayInfo.kind === 'inactiveWeekday' ? (
              <Badge tone="neutral" icon="calendar">
                {t('schedule.todayNotInUse')}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="hero__clock">
          <span className="hero__time">{formatClockTimeWithSeconds(nowDate, lang)}</span>
          <span className="hero__date">
            <span>{formatJalali(nowDate, lang)}</span>
            <span className="hero__date-sep">·</span>
            <span className="text-3">{formatGregorian(nowDate, lang)}</span>
          </span>
        </div>

        <div className="hero__next">
          <div className="hero__next-body">
            <span className="hero__next-label">{t('dashboard.nextBell')}</span>
            {nextBell ? (
              <>
                <span className="hero__next-title">{nextBell.title}</span>
                <span className="hero__next-time">{formatClockTime(nextBell.time, lang)}</span>
              </>
            ) : (
              <span className="hero__next-title">
                {view.todayBells.length === 0 ? t('dashboard.noBellsToday') : t('dashboard.nextBellNone')}
              </span>
            )}
          </div>

          {countdown !== null && countdown > 0 ? (
            <div className="hero__countdown">
              <span className="hero__countdown-value">{formatCountdown(countdown, lang)}</span>
              <span className="hero__next-label">{t('dashboard.countdown')}</span>
            </div>
          ) : null}
        </div>

        <div className="hero__actions">
          {mode === 'disabled' ? (
            <Button variant="primary" size="lg" icon="play" onClick={() => void setMode.run('active')}>
              {t('dashboard.actionStart')}
            </Button>
          ) : (
            <>
              <Button
                variant={mode === 'paused' ? 'primary' : 'default'}
                size="lg"
                icon="play"
                disabled={mode === 'active'}
                onClick={() => void setMode.run('active')}
              >
                {t('dashboard.actionStart')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                icon="pause"
                disabled={mode === 'paused'}
                onClick={() => void setMode.run('paused')}
              >
                {t('dashboard.actionPause')}
              </Button>
            </>
          )}
          <Button variant="outline" size="lg" icon="bell" onClick={() => void testBell.run()}>
            {t('dashboard.actionTest')}
          </Button>
          {mode !== 'disabled' ? (
            <Button variant="ghost" size="lg" icon="power" onClick={() => void setMode.run('disabled')}>
              {t('dashboard.actionDisable')}
            </Button>
          ) : null}
        </div>

        {view.todayBells.length > 0 ? (
          <div className="hero__progress">
            <span>{t('dashboard.bellsDone', { done: doneCount, total: view.todayBells.length })}</span>
          </div>
        ) : null}

        {mode === 'paused' ? <Notice tone="warn">{t('dashboard.hint.paused')}</Notice> : null}
        {mode === 'disabled' ? <Notice tone="warn">{t('dashboard.hint.disabled')}</Notice> : null}
        {view.dayInfo.kind === 'inactiveWeekday' ? <Notice>{t('dashboard.hint.inactiveDay')}</Notice> : null}
      </section>

      <Card>
        <CardHeader
          title={t('dashboard.todaySchedule')}
          icon="list"
          actions={
            view.todayBells.length > 0 ? (
              <span className="badge">{t('schedule.profileBells', { count: view.todayBells.length })}</span>
            ) : null
          }
        />
        <CardBody flush>
          {view.todayBells.length === 0 ? (
            <EmptyState icon="bell" title={t('dashboard.noBellsToday')} hint={t('schedule.bellEmpty')} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('schedule.bellTime')}</th>
                    <th>{t('schedule.bellTitleCol')}</th>
                    <th>{t('schedule.bellSoundCol')}</th>
                    <th>{t('schedule.bellStatusCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {view.todayBells.map((bell) => (
                    <tr
                      key={bell.id}
                      className={[
                        bell.status === 'next' ? 'table__row--next' : '',
                        bell.enabled ? '' : 'table__row--muted'
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="table__time">{formatClockTime(bell.time, lang)}</td>
                      <td>
                        <div className="truncate">{bell.title}</div>
                        {bell.note ? <div className="text-xs text-3 truncate">{bell.note}</div> : null}
                      </td>
                      <td>
                        <span className="sound-cell">
                          <Icon name="music" size={14} />
                          <span className="sound-cell__name text-2">{soundNameOf(bell)}</span>
                        </span>
                      </td>
                      <td>
                        <StatusCell bell={bell} lang={lang} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
