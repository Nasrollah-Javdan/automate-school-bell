/**
 * Pure, synchronous "what happens today" logic.
 *
 * Both the scheduler (main process) and the dashboard (renderer) depend on this
 * module, so what the user sees is always exactly what the engine will do.
 */

import type { AppState, Bell, DayInfo, Holiday, ScheduleProfile, TodayBell, Weekday } from '../types/index.js'
import { isoDayKey, jalaliKey, todayJalali, weekdayIndex } from '../utils/jalali.js'
import { bellOccurrenceId, timeOnDate } from '../utils/time.js'

export interface DayPlan {
  date: Date
  /** Local `YYYY-MM-DD`. */
  dayKey: string
  weekday: Weekday
  /** Schedule in use today, or null when today is not an active weekday. */
  schedule: ScheduleProfile | null
  /** Enabled bells of the schedule, in time order. */
  bells: Bell[]
  holiday: Holiday | null
  weekdayActive: boolean
}

export function findSchedule(state: AppState, id: string): ScheduleProfile | null {
  return state.schedules.find((schedule) => schedule.id === id) ?? null
}

/** Holiday defined for the given date (dates are stored in Jalali). */
export function findHoliday(state: AppState, date: Date): Holiday | null {
  const key = jalaliKey(todayJalali(date))
  return state.holidays.find((holiday) => jalaliKey(holiday.jalali) === key) ?? null
}

/** Resolve everything the engine needs to know about one calendar day. */
export function resolveDayPlan(state: AppState, date: Date): DayPlan {
  const dayKey = isoDayKey(date)
  const weekday = weekdayIndex(date)
  const schedule = findSchedule(state, state.activeScheduleId)
  const weekdayActive = schedule ? schedule.activeWeekdays.includes(weekday) : false

  return {
    date,
    dayKey,
    weekday,
    schedule,
    bells: weekdayActive && schedule ? sortBells(schedule.bells.filter((bell) => bell.enabled)) : [],
    holiday: findHoliday(state, date),
    weekdayActive
  }
}

/** Bells are always kept in time order; identical times keep their relative order. */
export function sortBells(bells: readonly Bell[]): Bell[] {
  return [...bells].sort((a, b) => (a.time === b.time ? a.id.localeCompare(b.id) : a.time.localeCompare(b.time)))
}

/** The first bell that has not started yet. */
export function nextBellOf(plan: DayPlan, now: Date): Bell | null {
  for (const bell of plan.bells) {
    if (timeOnDate(now, bell.time).getTime() > now.getTime()) return bell
  }
  return null
}

/** Milliseconds until a bell's time today (negative when it already passed). */
export function msUntilBell(bell: Bell, now: Date): number {
  return timeOnDate(now, bell.time).getTime() - now.getTime()
}

export function isBellFired(state: AppState, dayKey: string, bell: Bell): boolean {
  return state.firedIds.includes(bellOccurrenceId(dayKey, bell.time, bell.id))
}

export interface TodayView {
  dayInfo: DayInfo
  todayBells: TodayBell[]
  nextBell: Bell | null
  isDayOver: boolean
}

export function buildTodayView(state: AppState, date: Date, now: Date = date): TodayView {
  const plan = resolveDayPlan(state, date)
  const kind: DayInfo['kind'] = plan.holiday ? 'holiday' : plan.weekdayActive ? 'normal' : 'inactiveWeekday'

  const nextBell = nextBellOf(plan, now)
  const nextTime = nextBell ? nextBell.time : null
  const nowTime = now.getTime()

  const todayBells: TodayBell[] = sortBells(plan.schedule?.bells ?? []).map((bell) => {
    const bellAt = timeOnDate(now, bell.time).getTime()
    let status: TodayBell['status']
    if (bellAt > nowTime) {
      status = bell.time === nextTime ? 'next' : 'upcoming'
    } else {
      status = isBellFired(state, plan.dayKey, bell) ? 'done' : 'skipped'
    }
    return {
      id: bell.id,
      time: bell.time,
      title: bell.title,
      note: bell.note,
      soundId: bell.soundId,
      enabled: bell.enabled,
      status
    }
  })

  return {
    dayInfo: {
      kind,
      holidayTitle: plan.holiday?.title ?? null,
      activeWeekdays: plan.schedule?.activeWeekdays ?? []
    },
    todayBells,
    nextBell,
    isDayOver: Boolean(plan.schedule && plan.weekdayActive && plan.bells.length > 0 && nextBell === null)
  }
}