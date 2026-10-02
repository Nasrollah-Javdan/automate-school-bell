import { useState, type JSX } from 'react'
import type { AppSnapshot, Holiday, JalaliDate, LanguageCode } from '../../types/index.js'
import { translate } from '../../i18n/index.js'
import { formatJalaliNumeric, jalaliKey, toGregorian, todayJalali } from '../../utils/jalali.js'
import { Button, IconButton } from '../components/ui/Button.js'
import { Badge, Card, CardBody, CardHeader } from '../components/ui/Card.js'
import { EmptyState, Notice, TextField } from '../components/ui/Form.js'
import { Modal, useConfirm } from '../components/ui/Modal.js'
import { JalaliDateField } from '../components/ui/JalaliDateField.js'
import { runSafely } from '../hooks/useAsyncAction.js'

function HolidayDialog({
  lang,
  existingKeys,
  onClose
}: {
  lang: LanguageCode
  existingKeys: string[]
  onClose: () => void
}): JSX.Element {
  const [date, setDate] = useState<JalaliDate | null>(null)
  const [title, setTitle] = useState('')
  const [touched, setTouched] = useState(false)
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)

  const duplicate = date ? existingKeys.includes(jalaliKey(date)) : false
  const titleError = touched && !title.trim() ? t('holidays.titleEmpty') : ''
  const canSave = Boolean(date) && title.trim().length > 0 && !duplicate

  const save = (): void => {
    setTouched(true)
    if (!canSave || !date) return
    runSafely(() => window.api.addHoliday({ jalali: date, title: title.trim() }))
    onClose()
  }

  return (
    <Modal
      title={t('holidays.add')}
      onClose={onClose}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={touched && !canSave}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <JalaliDateField
        label={t('holidays.dateLabel')}
        value={date}
        lang={lang}
        error={duplicate ? t('holidays.duplicate') : undefined}
        onChange={setDate}
      />
      <TextField
        label={t('holidays.titleLabel')}
        placeholder={t('holidays.titlePlaceholder')}
        value={title}
        error={titleError}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save()
        }}
      />
    </Modal>
  )
}

export function HolidaysPage({ lang, snapshot }: { lang: LanguageCode; snapshot: AppSnapshot }): JSX.Element {
  const { state } = snapshot
  const [adding, setAdding] = useState(false)
  const confirm = useConfirm()
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params)

  const todayKey = jalaliKey(todayJalali())
  const existingKeys = state.holidays.map((holiday) => jalaliKey(holiday.jalali))
  const nextHoliday = state.holidays.find((holiday) => jalaliKey(holiday.jalali) >= todayKey) ?? null

  /** Whole days from today (local midnight) to the holiday. */
  const daysUntil = (holiday: Holiday): number => {
    const g = toGregorian(holiday.jalali.year, holiday.jalali.month, holiday.jalali.day)
    const target = new Date(g.gy, g.gm - 1, g.gd).getTime()
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    return Math.round((target - startOfToday) / 86_400_000)
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('holidays.title')}</h1>
          <p className="page__subtitle">{t('holidays.subtitle')}</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
          {t('holidays.add')}
        </Button>
      </div>

      {nextHoliday ? (
        <Notice icon="calendar">
          {t('holidays.daysUntilNextHoliday', {
            title: nextHoliday.title,
            date: formatJalaliNumeric(nextHoliday.jalali, lang)
          })}
        </Notice>
      ) : null}

      <Card>
        <CardHeader title={t('holidays.title')} icon="calendar" />
        <CardBody flush>
          {state.holidays.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={t('holidays.empty')}
              hint={t('holidays.emptyHint')}
              action={
                <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                  {t('holidays.add')}
                </Button>
              }
            />
          ) : (
            state.holidays.map((holiday) => {
              const days = daysUntil(holiday)
              const isToday = jalaliKey(holiday.jalali) === todayKey

              return (
                <div key={holiday.id} className="holiday-row">
                  <span className="holiday-row__date">{formatJalaliNumeric(holiday.jalali, lang)}</span>
                  <span className="holiday-row__title">{holiday.title}</span>
                  {isToday ? (
                    <Badge tone="warn" icon="alert">
                      {t('holidays.today')}
                    </Badge>
                  ) : days > 0 ? (
                    <Badge tone="accent">{t('holidays.inDays', { count: days })}</Badge>
                  ) : days < 0 ? (
                    <Badge>{t('holidays.daysAgo', { count: Math.abs(days) })}</Badge>
                  ) : null}
                  <IconButton
                    icon="trash"
                    label={t('holidays.delete')}
                    size="sm"
                    tone="danger"
                    onClick={() =>
                      confirm.request({
                        title: t('holidays.delete'),
                        message: t('holidays.deleteConfirm', { title: holiday.title }),
                        confirmLabel: t('common.delete'),
                        cancelLabel: t('common.cancel'),
                        tone: 'danger',
                        onConfirm: () => runSafely(() => window.api.removeHoliday(holiday.id))
                      })
                    }
                  />
                </div>
              )
            })
          )}
        </CardBody>
      </Card>

      {adding ? (
        <HolidayDialog lang={lang} existingKeys={existingKeys} onClose={() => setAdding(false)} />
      ) : null}

      {confirm.dialog}
    </div>
  )
}
