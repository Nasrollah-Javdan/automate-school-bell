import type { LanguageCode, Weekday } from '../types/index.js'
import { isoDayKey, toPersianDigits } from './jalali.js'

export const pad2 = (value: number): string => String(value).padStart(2, '0')

/** Localized digits for a numeric string. */
export const digits = (value: string | number, lang: LanguageCode): string =>
  lang === 'fa' ? toPersianDigits(String(value)) : String(value)

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time)
}

/** Minutes since midnight for an `HH:mm` string. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':')
  return Number(h) * 60 + Number(m)
}

/** `HH:mm` for a minutes-since-midnight value. */
export function minutesToTime(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`
}

/** A Date for today at the given `HH:mm` (local time). */
export function timeOnDate(date: Date, time: string): Date {
  const result = new Date(date.getTime())
  result.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0)
  return result
}

/**
 * Unique id for one bell occurrence, e.g. `2026-09-27_09:30_b1a2b3`.
 * Persisting these ids is what prevents a bell from playing twice.
 */
export function bellOccurrenceId(dayKey: string, time: string, bellId: string): string {
  return `${dayKey}_${time}_${bellId}`
}

/** Split `HH:mm` into parts for display. */
export function splitTime(time: string): { hour: string; minute: string } {
  return { hour: time.slice(0, 2), minute: time.slice(3, 5) }
}

/**
 * Format a clock time for the given language:
 * fa → `۰۹:۴۵` (24h) · en → `9:45 AM` (12h)
 */
export function formatClockTime(time: string, lang: LanguageCode): string {
  if (!isValidTime(time)) return time
  const [h, m] = time.split(':').map(Number)
  if (lang === 'fa') return toPersianDigits(`${pad2(h)}:${pad2(m)}`)

  const period = h < 12 ? 'AM' : 'PM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${pad2(m)} ${period}`
}

/** The big dashboard clock, e.g. `09:32:14` / `۰۹:۳۲:۱۴`. */
export function formatClockTimeWithSeconds(date: Date, lang: LanguageCode, showSeconds = true): string {
  const h = pad2(date.getHours())
  const m = pad2(date.getMinutes())
  const s = pad2(date.getSeconds())
  const value = showSeconds ? `${h}:${m}:${s}` : `${h}:${m}`
  return lang === 'fa' ? toPersianDigits(value) : value
}

/**
 * Countdown text `HH:MM:SS`. Uses `—:—` style placeholders when the time is
 * invalid, and never goes negative.
 */
export function formatCountdown(ms: number, lang: LanguageCode): string {
  const safe = Math.max(0, Math.floor(ms / 1000))
  const totalMinutes = Math.floor(safe / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const seconds = safe % 60
  const value = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
  return lang === 'fa' ? toPersianDigits(value) : value
}

/** Compact duration for sound metadata, e.g. `0:04`. */
export function formatDuration(seconds: number, lang: LanguageCode): string {
  const total = Math.max(0, Math.round(seconds))
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return digits(`${mm}:${pad2(ss)}`, lang)
}

/** "today" / "tomorrow" / "N days ago" relative day label (localized by caller). */
export function startOfDay(date: Date): Date {
  const result = new Date(date.getTime())
  result.setHours(0, 0, 0, 0)
  return result
}

export function isSameDay(a: Date, b: Date): boolean {
  return isoDayKey(a) === isoDayKey(b)
}

/** Whole minutes between two dates (positive when `to` is in the future). */
export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60000)
}

export function msUntil(target: Date, now: Date = new Date()): number {
  return target.getTime() - now.getTime()
}

/** Weekday helpers (0 = Saturday … 6 = Friday). */
export const WEEKDAY_ORDER: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

/** Default active days: Saturday → Wednesday (پنجشنبه/جمعه are weekend). */
export const DEFAULT_ACTIVE_WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4]

export function includesWeekday(days: readonly Weekday[], day: Weekday): boolean {
  return days.includes(day)
}