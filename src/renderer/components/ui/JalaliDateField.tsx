import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { JalaliDate, LanguageCode } from '../../../types/index.js'
import {
  formatJalaliNumeric,
  isValidJalaliDate,
  jalaliKey,
  jalaliMonthLength,
  jalaliMonthMatrix,
  parseJalaliNumeric,
  todayJalali
} from '../../../utils/jalali.js'
import { digits } from '../../../utils/time.js'
import { translate, weekdayName } from '../../../i18n/index.js'
import { Field } from './Form.js'
import { Button, IconButton } from './Button.js'

const MONTHS_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند'
]

const MONTHS_EN = [
  'Farvardin',
  'Ordibehesht',
  'Khordad',
  'Tir',
  'Mordad',
  'Shahrivar',
  'Mehr',
  'Aban',
  'Azar',
  'Dey',
  'Bahman',
  'Esfand'
]

/**
 * Jalali date input with a small month calendar.
 *
 * Accepts what a Persian user actually types (Persian or Latin digits,
 * `-` or `/` or `.` separators) and validates the result against the real
 * Jalali calendar rules.
 */
export function JalaliDateField({
  label,
  value,
  onChange,
  lang,
  error,
  hint,
  disabled
}: {
  label: string
  value: JalaliDate | null
  onChange: (value: JalaliDate | null) => void
  lang: LanguageCode
  error?: string
  hint?: string
  disabled?: boolean
}): JSX.Element {
  const [text, setText] = useState(() => (value ? formatJalaliNumeric(value, 'fa') : ''))
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<JalaliDate>(() => value ?? todayJalali())
  const wrapRef = useRef<HTMLDivElement>(null)
  const today = useMemo(() => todayJalali(), [])
  const months = lang === 'fa' ? MONTHS_FA : MONTHS_EN
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)

  const matrix = useMemo(() => jalaliMonthMatrix(view), [view])

  const shiftMonth = (delta: number): void => {
    setView((current) => {
      let month = current.month + delta
      let year = current.year
      if (month > 12) {
        month = 1
        year += 1
      }
      if (month < 1) {
        month = 12
        year -= 1
      }
      const day = Math.min(current.day, jalaliMonthLength(year, month))
      return { year, month, day }
    })
  }

  const applyText = (next: string): void => {
    setText(next)
    if (!next.trim()) {
      onChange(null)
      return
    }
    const parsed = parseJalaliNumeric(next)
    onChange(parsed)
    if (parsed) setView(parsed)
  }

  const choose = (date: JalaliDate): void => {
    onChange(date)
    setText(formatJalaliNumeric(date, 'fa'))
    setOpen(false)
  }

  const monthLabel = `${months[view.month - 1]} ${digits(view.year, lang)}`
  const prevIcon = lang === 'fa' ? 'chevronRight' : 'chevronLeft'
  const nextIcon = lang === 'fa' ? 'chevronLeft' : 'chevronRight'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <Field label={label} hint={error ? undefined : hint} error={error} required>
      <div className="datefield" ref={wrapRef}>
        <div className="input-group">
          <input
            className={`input${error ? ' input--error' : ''}`}
            value={text}
            inputMode="numeric"
            placeholder={t('holidays.datePlaceholder')}
            disabled={disabled}
            onChange={(event) => applyText(event.target.value)}
            onFocus={() => setOpen(true)}
            aria-expanded={open}
          />
          <IconButton
            icon="calendar"
            label={t('holidays.pickDate')}
            variant="outline"
            disabled={disabled}
            onClick={() => setOpen((current) => !current)}
          />
        </div>

        {open ? (
          <div className="calendar" role="dialog" aria-label={t('holidays.pickDate')}>
            <div className="calendar__header">
              <IconButton
                icon={prevIcon}
                label={t('holidays.monthPrev')}
                size="sm"
                onClick={() => shiftMonth(-1)}
              />
              <span className="calendar__title">{monthLabel}</span>
              <IconButton
                icon={nextIcon}
                label={t('holidays.monthNext')}
                size="sm"
                onClick={() => shiftMonth(1)}
              />
            </div>

            <div className="calendar__weekdays">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <span key={day} className="calendar__weekday">
                  {weekdayName(lang, day as 0, true)}
                </span>
              ))}
            </div>

            <div className="calendar__grid">
              {matrix.map((date, index) => {
                if (!date) return <span key={`empty-${index}`} />
                const isSelected = value ? jalaliKey(value) === jalaliKey(date) : false
                const isToday = jalaliKey(today) === jalaliKey(date)
                return (
                  <button
                    key={jalaliKey(date)}
                    type="button"
                    className={[
                      'calendar__day',
                      isSelected ? 'calendar__day--selected' : '',
                      isToday ? 'calendar__day--today' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => choose(date)}
                  >
                    {digits(date.day, lang)}
                  </button>
                )
              })}
            </div>

            <div className="calendar__footer">
              <Button size="sm" variant="ghost" onClick={() => choose(today)}>
                {t('common.today')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  )
}

/** Exported for tests: a date is only accepted when the calendar allows it. */
export const isSelectableDate = isValidJalaliDate
