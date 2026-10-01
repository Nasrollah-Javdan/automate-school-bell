import type { JSX } from 'react'
import type { Weekday } from '../../../types/index.js'
import { WEEKDAYS } from '../../../types/index.js'
import { translate, weekdayName } from '../../../i18n/index.js'

/**
 * Saturday → Friday day picker.
 * Icons/text stay in the right order in both languages because the week order
 * itself never changes — only the direction of the layout does.
 */
export function WeekdayPicker({
  value,
  onChange,
  lang,
  today,
  allowEmpty = false
}: {
  value: Weekday[]
  onChange: (days: Weekday[]) => void
  lang: 'fa' | 'en'
  today?: Weekday
  allowEmpty?: boolean
}): JSX.Element {
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)
  const selected = new Set(value)

  const toggle = (day: Weekday): void => {
    const next = new Set(selected)
    if (next.has(day)) {
      if (!allowEmpty && next.size === 1) return
      next.delete(day)
    } else {
      next.add(day)
    }
    onChange(WEEKDAYS.filter((item) => next.has(item)))
  }

  const allSelected = selected.size === WEEKDAYS.length

  return (
    <div className="stack-sm">
      <div className="weekdays">
        {WEEKDAYS.map((day) => (
          <button
            key={day}
            type="button"
            className={[
              'weekday-chip',
              selected.has(day) ? 'weekday-chip--active' : '',
              today === day ? 'weekday-chip--today' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={selected.has(day)}
            title={weekdayName(lang, day)}
            onClick={() => toggle(day)}
          >
            {weekdayName(lang, day, true)}
          </button>
        ))}
      </div>
      <div className="row-between">
        <span className="text-xs text-3">
          {selected.size === 0
            ? t('weekday.none')
            : `${translate(lang, 'schedule.days')}: ${selected.size}`}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => onChange(allSelected ? [] : [...WEEKDAYS])}
        >
          {allSelected ? t('common.none') : t('weekday.allDays')}
        </button>
      </div>
    </div>
  )
}