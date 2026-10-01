import { useEffect, useState, type JSX } from 'react'
import type { AppSnapshot, Bell, LanguageCode, ScheduleProfile } from '../../types/index.js'
import { translate } from '../../i18n/index.js'
import { formatClockTime } from '../../utils/time.js'
import { weekdayIndex } from '../../utils/jalali.js'
import { sortBells } from '../../shared/today.js'
import { Button, IconButton } from '../components/ui/Button.js'
import { Badge, Card, CardBody, CardHeader } from '../components/ui/Card.js'
import { EmptyState, Notice, SelectField, Switch, TextField } from '../components/ui/Form.js'
import { Modal, useConfirm } from '../components/ui/Modal.js'
import { WeekdayPicker } from '../components/ui/WeekdayPicker.js'
import { Icon } from '../components/Icon.js'
import { BellDialog, emptyBellDraft, type BellDraft } from './BellDialog.js'
import { runSafely } from '../hooks/useAsyncAction.js'

function ScheduleNameDialog({
  lang,
  title,
  initialValue,
  onSubmit,
  onClose
}: {
  lang: LanguageCode
  title: string
  initialValue: string
  onSubmit: (name: string) => void
  onClose: () => void
}): JSX.Element {
  const [name, setName] = useState(initialValue)
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)

  return (
    <Modal
      title={title}
      onClose={onClose}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => {
              onSubmit(name.trim())
              onClose()
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <TextField
        label={t('schedule.profileName')}
        placeholder={t('schedule.profileNamePlaceholder')}
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && name.trim()) {
            onSubmit(name.trim())
            onClose()
          }
        }}
      />
    </Modal>
  )
}

export function SchedulePage({ lang, snapshot }: { lang: LanguageCode; snapshot: AppSnapshot }): JSX.Element {
  const { state } = snapshot
  const schedules = state.schedules
  const [selectedId, setSelectedId] = useState(state.activeScheduleId || schedules[0]?.id || '')
  const [dialog, setDialog] = useState<BellDraft | null>(null)
  const [nameDialog, setNameDialog] = useState<{ mode: 'create' | 'rename'; value: string } | null>(null)
  const confirm = useConfirm()
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params)

  useEffect(() => {
    if (!schedules.some((schedule) => schedule.id === selectedId)) {
      setSelectedId(state.activeScheduleId || schedules[0]?.id || '')
    }
  }, [schedules, selectedId, state.activeScheduleId])

  const schedule: ScheduleProfile | undefined =
    schedules.find((item) => item.id === selectedId) ?? schedules[0]
  const bells = sortBells(schedule?.bells ?? [])
  const isActive = schedule?.id === state.activeScheduleId
  const today = weekdayIndex(new Date())

  const openAddBell = (): void => setDialog({ ...emptyBellDraft, time: suggestNextTime(bells) })
  const openEditBell = (bell: Bell): void =>
    setDialog({
      id: bell.id,
      time: bell.time,
      title: bell.title,
      soundId: bell.soundId,
      enabled: bell.enabled,
      note: bell.note
    })

  if (!schedule) {
    return (
      <div className="page">
        <EmptyState icon="list" title={t('common.empty')} hint={t('schedule.bellEmpty')} />
      </div>
    )
  }

  const duplicateTimes = (currentId: string | null): string[] =>
    bells.filter((bell) => bell.id !== currentId).map((bell) => bell.time)

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('schedule.title')}</h1>
          <p className="page__subtitle">{t('schedule.subtitle')}</p>
        </div>
        <Button variant="primary" icon="plus" onClick={openAddBell}>
          {t('schedule.bellAdd')}
        </Button>
      </div>

      <div className="schedule-bar">
        <div className="schedule-bar__select">
          <SelectField
            value={schedule.id}
            onValueChange={setSelectedId}
            options={schedules.map((item) => ({ value: item.id, label: item.name }))}
            aria-label={t('schedule.profile')}
          />
        </div>

        {isActive ? (
          <Badge tone="accent" icon="check">
            {t('schedule.profileActive')}
          </Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            icon="check"
            onClick={() => runSafely(() => window.api.setActiveSchedule(schedule.id))}
          >
            {t('schedule.profileSetActive')}
          </Button>
        )}

        <span className="grow" />

        <Button
          size="sm"
          icon="plus"
          onClick={() => setNameDialog({ mode: 'create', value: '' })}
        >
          {t('schedule.profileNew')}
        </Button>
        <Button size="sm" icon="edit" onClick={() => setNameDialog({ mode: 'rename', value: schedule.name })}>
          {t('common.rename')}
        </Button>
        <IconButton
          icon="trash"
          label={t('schedule.profileDelete')}
          tone="danger"
          disabled={schedules.length <= 1}
          onClick={() =>
            confirm.request({
              title: t('schedule.profileDelete'),
              message: t('schedule.profileDeleteConfirm', {
                name: schedule.name,
                count: bells.length
              }),
              confirmLabel: t('common.delete'),
              cancelLabel: t('common.cancel'),
              tone: 'danger',
              onConfirm: () => runSafely(() => window.api.deleteSchedule(schedule.id))
            })
          }
        />
      </div>

      <Card>
        <CardHeader title={t('schedule.weekdayPicker')} icon="calendar" />
        <CardBody>
          <WeekdayPicker
            lang={lang}
            value={schedule.activeWeekdays}
            today={today}
            onChange={(days) => runSafely(() => window.api.updateScheduleDays(schedule.id, days))}
          />
          <p className="field__hint" style={{ marginBlockStart: 'var(--sp-3)' }}>
            {t('schedule.daysHint')}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t('schedule.bells')}
          icon="bell"
          actions={
            <span className="badge">
              {t('schedule.profileBells', { count: bells.length })}
            </span>
          }
        />
        <CardBody flush>
          {bells.length === 0 ? (
            <EmptyState
              icon="bell"
              title={t('common.empty')}
              hint={t('schedule.bellEmpty')}
              action={
                <Button variant="primary" icon="plus" onClick={openAddBell}>
                  {t('schedule.bellAdd')}
                </Button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('schedule.bellTime')}</th>
                    <th>{t('schedule.bellTitleCol')}</th>
                    <th>{t('schedule.bellSoundCol')}</th>
                    <th className="text-center">{t('common.enabled')}</th>
                    <th aria-label={t('common.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {bells.map((bell, index) => {
                    const sound = bell.soundId ? state.sounds.find((item) => item.id === bell.soundId) : null
                    const missing = Boolean(bell.soundId && snapshot.soundFiles[bell.soundId]?.available === false)

                    return (
                      <tr key={bell.id} className={bell.enabled ? '' : 'table__row--muted'}>
                        <td className="table__time">{formatClockTime(bell.time, lang)}</td>
                        <td>
                          <div className="row" style={{ gap: 'var(--sp-2)' }}>
                            <Icon name="bell" size={15} />
                            <div className="truncate">
                              <div>{bell.title}</div>
                              {bell.note ? <div className="text-xs text-3">{bell.note}</div> : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="sound-cell">
                            <Icon name="music" size={14} />
                            <span className="sound-cell__name">
                              {sound?.name ?? t('schedule.bellSoundDefault')}
                            </span>
                            {missing ? (
                              <Badge tone="danger" icon="alert">
                                {t('schedule.soundMissingBadge')}
                              </Badge>
                            ) : null}
                          </span>
                        </td>
                        <td className="text-center">
                          <Switch
                            checked={bell.enabled}
                            onChange={(checked) =>
                              runSafely(() => window.api.updateBell(schedule.id, { ...bell, enabled: checked }))
                            }
                          />
                        </td>
                        <td>
                          <div className="table__actions">
                            <IconButton
                              icon="arrowUp"
                              label={t('common.moveUp')}
                              size="sm"
                              disabled={index === 0}
                              onClick={() => runSafely(() => window.api.moveBell(schedule.id, bell.id, 'up'))}
                            />
                            <IconButton
                              icon="arrowDown"
                              label={t('common.moveDown')}
                              size="sm"
                              disabled={index === bells.length - 1}
                              onClick={() => runSafely(() => window.api.moveBell(schedule.id, bell.id, 'down'))}
                            />
                            <IconButton
                              icon="edit"
                              label={t('schedule.bellEdit')}
                              size="sm"
                              onClick={() => openEditBell(bell)}
                            />
                            <IconButton
                              icon="trash"
                              label={t('schedule.bellDelete')}
                              size="sm"
                              tone="danger"
                              onClick={() =>
                                confirm.request({
                                  title: t('schedule.bellDelete'),
                                  message: t('schedule.bellDeleteConfirm', { title: bell.title }),
                                  confirmLabel: t('common.delete'),
                                  cancelLabel: t('common.cancel'),
                                  tone: 'danger',
                                  onConfirm: () => runSafely(() => window.api.removeBell(schedule.id, bell.id))
                                })
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Notice icon="info">{t('schedule.sortedByTime')}</Notice>

      {dialog ? (
        <BellDialog
          lang={lang}
          scheduleId={schedule.id}
          draft={dialog}
          sounds={state.sounds}
          snapshot={snapshot}
          existingTimes={duplicateTimes(dialog.id)}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {nameDialog ? (
        <ScheduleNameDialog
          lang={lang}
          title={
            nameDialog.mode === 'create'
              ? t('schedule.profileNew')
              : t('schedule.profileRename')
          }
          initialValue={nameDialog.value}
          onClose={() => setNameDialog(null)}
          onSubmit={(name) => {
            if (nameDialog.mode === 'create') {
              runSafely(() => window.api.createSchedule(name))
            } else {
              runSafely(() => window.api.renameSchedule(schedule.id, name))
            }
          }}
        />
      ) : null}

      {confirm.dialog}
    </div>
  )
}

/** A sensible starting point when adding a bell: right after the last one. */
function suggestNextTime(bells: Bell[]): string {
  const last = bells.at(-1)
  if (!last) return '08:00'
  const [hours, minutes] = last.time.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, hours * 60 + minutes + 45)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}