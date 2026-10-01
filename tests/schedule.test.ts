import { describe, expect, it } from 'vitest'
import type { AppState, Bell, Holiday, ScheduleProfile, Sound } from '../src/types/index.js'
import { buildTodayView, findHoliday, nextBellOf, resolveDayPlan, sortBells } from '../src/shared/today.js'
import { bellOccurrenceId, formatClockTime, formatCountdown, isValidTime, minutesToTime, timeToMinutes } from '../src/utils/time.js'

const bell = (id: string, time: string, extra: Partial<Bell> = {}): Bell => ({
  id,
  time,
  title: `Bell ${id}`,
  soundId: null,
  enabled: true,
  note: '',
  ...extra
})

const makeState = (partial: Partial<AppState> = {}): AppState => {
  const schedule: ScheduleProfile = {
    id: 's1',
    name: 'Regular',
    bells: [bell('b1', '08:00'), bell('b2', '09:30'), bell('b3', '10:15')],
    activeWeekdays: [0, 1, 2, 3, 4]
  }
  const sounds: Sound[] = []
  const holidays: Holiday[] = []
  return {
    version: 1,
    settings: {
      language: 'en',
      theme: 'system',
      uiScale: 100,
      startWithWindows: false,
      startMinimized: false,
      minimizeToTray: true,
      closeToTray: true,
      volume: 80,
      defaultSoundId: null,
      missedBellPolicy: 'ignore',
      missedGraceMinutes: 10,
      activeScheduleId: 's1'
    },
    schedules: [schedule],
    activeScheduleId: 's1',
    sounds,
    holidays,
    systemMode: 'active',
    firedIds: [],
    ...partial
  }
}

/** 2026-09-27 is a Sunday (weekday index 1 → active in the default schedule). */
const SUNDAY = new Date(2026, 8, 27, 9, 0, 0)
const FRIDAY = new Date(2026, 9, 2, 9, 0, 0)

describe('day plan', () => {
  it('sorts bells by time', () => {
    const sorted = sortBells([bell('a', '10:00'), bell('b', '08:00'), bell('c', '09:30')])
    expect(sorted.map((item) => item.time)).toEqual(['08:00', '09:30', '10:00'])
  })

  it('resolves the active schedule for an active weekday', () => {
    const plan = resolveDayPlan(makeState(), SUNDAY)
    expect(plan.weekdayActive).toBe(true)
    expect(plan.bells).toHaveLength(3)
    expect(plan.holiday).toBeNull()
  })

  it('has no bells on an inactive weekday', () => {
    const plan = resolveDayPlan(makeState(), FRIDAY)
    expect(plan.weekdayActive).toBe(false)
    expect(plan.bells).toHaveLength(0)
  })

  it('skips disabled bells', () => {
    const state = makeState()
    state.schedules[0].bells[0].enabled = false
    const plan = resolveDayPlan(state, SUNDAY)
    expect(plan.bells.map((item) => item.id)).toEqual(['b2', 'b3'])
  })

  it('detects a holiday regardless of weekday', () => {
    const state = makeState({
      holidays: [{ id: 'h1', jalali: { year: 1405, month: 7, day: 5 }, title: 'Closed' }]
    })
    const plan = resolveDayPlan(state, SUNDAY)
    expect(plan.holiday?.title).toBe('Closed')
    expect(findHoliday(state, SUNDAY)?.id).toBe('h1')
  })

  it('finds the next upcoming bell', () => {
    const plan = resolveDayPlan(makeState(), SUNDAY)
    expect(nextBellOf(plan, new Date(2026, 8, 27, 9, 0, 0))?.id).toBe('b2')
    expect(nextBellOf(plan, new Date(2026, 8, 27, 7, 59, 0))?.id).toBe('b1')
    expect(nextBellOf(plan, new Date(2026, 8, 27, 23, 0, 0))).toBeNull()
  })
})

describe('today view', () => {
  it('marks the next bell and completed bells', () => {
    const state = makeState()
    state.firedIds.push(bellOccurrenceId('2026-09-27', '08:00', 'b1'))

    const view = buildTodayView(state, SUNDAY, new Date(2026, 8, 27, 9, 0, 0))
    expect(view.todayBells.map((item) => item.status)).toEqual(['done', 'next', 'upcoming'])
    expect(view.nextBell?.id).toBe('b2')
    expect(view.isDayOver).toBe(false)
  })

  it('marks a past bell that never played as skipped', () => {
    const view = buildTodayView(makeState(), SUNDAY, new Date(2026, 8, 27, 8, 30, 0))
    expect(view.todayBells[0].status).toBe('skipped')
    expect(view.todayBells[1].status).toBe('next')
  })

  it('reports the end of the day', () => {
    const view = buildTodayView(makeState(), SUNDAY, new Date(2026, 8, 27, 23, 0, 0))
    expect(view.nextBell).toBeNull()
    expect(view.isDayOver).toBe(true)
  })

  it('reports holiday days', () => {
    const state = makeState({
      holidays: [{ id: 'h1', jalali: { year: 1405, month: 7, day: 5 }, title: 'Closed' }]
    })
    const view = buildTodayView(state, SUNDAY, new Date(2026, 8, 27, 9, 0, 0))
    expect(view.dayInfo.kind).toBe('holiday')
    expect(view.dayInfo.holidayTitle).toBe('Closed')
  })

  it('reports inactive weekdays', () => {
    const view = buildTodayView(makeState(), FRIDAY, FRIDAY)
    expect(view.dayInfo.kind).toBe('inactiveWeekday')
    expect(view.isDayOver).toBe(false)
  })
})

describe('time helpers', () => {
  it('validates HH:mm', () => {
    expect(isValidTime('08:30')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('8:30')).toBe(false)
    expect(isValidTime('08:60')).toBe(false)
  })

  it('converts between time strings and minutes', () => {
    expect(timeToMinutes('09:45')).toBe(585)
    expect(minutesToTime(585)).toBe('09:45')
  })

  it('formats the clock per language', () => {
    expect(formatClockTime('09:45', 'fa')).toBe('۰۹:۴۵')
    expect(formatClockTime('09:45', 'en')).toBe('9:45 AM')
    expect(formatClockTime('12:00', 'en')).toBe('12:00 PM')
    expect(formatClockTime('00:30', 'en')).toBe('12:30 AM')
  })

  it('formats a countdown', () => {
    expect(formatCountdown(12 * 60 * 1000 + 46 * 1000, 'en')).toBe('00:12:46')
    expect(formatCountdown(-5000, 'en')).toBe('00:00:00')
    expect(formatCountdown(1000, 'fa')).toBe('۰۰:۰۰:۰۱')
  })

  it('builds unique occurrence ids', () => {
    expect(bellOccurrenceId('2026-09-27', '09:30', 'bell2')).toBe('2026-09-27_09:30_bell2')
  })
})