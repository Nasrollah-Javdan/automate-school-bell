/**
 * Jalali (Solar Hijri) date conversion and formatting helpers.
 *
 * The conversion algorithm is the well known `jalali-js` implementation
 * (div/mod based, MIT licensed). It is accurate for Jalali years -61..3177,
 * which covers every realistic use case for a school bell application.
 */

import type { JalaliDate, Weekday } from '../types/index.js'

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178
]

const MIN_YEAR = BREAKS[0]
const MAX_YEAR = BREAKS[BREAKS.length - 1]

const div = (a: number, b: number): number => ~~(a / b)
const mod = (a: number, b: number): number => a - ~~(a / b) * b

interface JalCal {
  leap: number
  gy: number
  march: number
}

function jalCal(jy: number): JalCal {
  const bl = BREAKS.length
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0]
  let jump = 0

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    throw new RangeError(`Jalali year out of range: ${jy}`)
  }

  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }

  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4

  return { leap, gy, march }
}

/** Gregorian calendar day number (Julian Day Number at noon). */
function g2d(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

/** Julian Day Number to Gregorian date. */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

export function isJalaliYearSupported(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_YEAR && year < MAX_YEAR
}

/** Number of days in a Jalali month (1..12). */
export function jalaliMonthLength(year: number, month: number): number {
  if (month <= 6) return 31
  if (month <= 11) return 30
  return isLeapJalaliYear(year) ? 30 : 29
}

export function isLeapJalaliYear(year: number): boolean {
  if (!isJalaliYearSupported(year)) return false
  return jalCal(year).leap === 0
}

export function isValidJalaliDate(date: JalaliDate): boolean {
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return false
  if (!isJalaliYearSupported(date.year)) return false
  if (date.month < 1 || date.month > 12) return false
  if (date.day < 1) return false
  return date.day <= jalaliMonthLength(date.year, date.month)
}

/** Convert a Gregorian (local) date to Jalali. */
export function toJalali(gy: number, gm: number, gd: number): JalaliDate {
  let jy = gy - 621
  const r = jalCal(jy)
  const gdn = g2d(gy, gm, gd)
  const jdn1f = g2d(gy, 3, r.march)
  let k = gdn - jdn1f

  if (k >= 0) {
    if (k <= 185) return { year: jy, month: 1 + div(k, 31), day: mod(k, 31) + 1 }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }

  return { year: jy, month: 7 + div(k, 30), day: mod(k, 30) + 1 }
}

/** Convert a Jalali date to a Gregorian date. */
export function toGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  const r = jalCal(jy)
  const jdn = g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
  return d2g(jdn)
}

/** Stable string key for a Jalali date, used for holiday lookups. */
export function jalaliKey(date: JalaliDate): string {
  const mm = String(date.month).padStart(2, '0')
  const dd = String(date.day).padStart(2, '0')
  return `${date.year}-${mm}-${dd}`
}

/** `YYYY-MM-DD` (Gregorian, local calendar date) key for a JS date. */
export function isoDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromIsoDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) {
    return null
  }
  return date
}

/** Weekday index in the Iranian week order: 0 = Saturday … 6 = Friday. */
export function weekdayIndex(date: Date): Weekday {
  return ((date.getDay() + 1) % 7) as Weekday
}

/**
 * First cell offset (0 = Saturday) for a Jalali month grid,
 * so the calendar starts on Saturday.
 */
export function jalaliMonthGridStart(date: JalaliDate): number {
  const g = toGregorian(date.year, date.month, 1)
  return weekdayIndex(new Date(g.gy, g.gm - 1, g.gd))
}

/** All dates of a Jalali month as a flat grid of 6 weeks starting on Saturday. */
export function jalaliMonthMatrix(month: JalaliDate): (JalaliDate | null)[] {
  const length = jalaliMonthLength(month.year, month.month)
  const offset = jalaliMonthGridStart({ year: month.year, month: month.month, day: 1 })
  const cells: (JalaliDate | null)[] = []
  for (let i = 0; i < offset; i += 1) cells.push(null)
  for (let day = 1; day <= length; day += 1) {
    cells.push({ year: month.year, month: month.month, day })
  }
  while (cells.length < 42) cells.push(null)
  return cells
}

/** Today in Jalali, based on the local machine clock. */
export function todayJalali(now: Date = new Date()): JalaliDate {
  return toJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** Human friendly Jalali text, e.g. `شنبه، ۲۷ شهریور ۱۴۰۵` / `Saturday, 27 Shahrivar 1405`. */
export function formatJalali(date: Date, locale: 'fa' | 'en'): string {
  const fa = locale === 'fa'
  const calendarLocale = fa ? 'fa-IR-u-ca-persian' : 'en-GB-u-ca-persian'

  if (fa) {
    const value = new Intl.DateTimeFormat(calendarLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date)
    return toPersianDigits(value)
  }

  // English: build the parts ourselves so the calendar era marker (e.g. "AP")
  // never leaks into the interface.
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date)
  const month = new Intl.DateTimeFormat(calendarLocale, { month: 'long' }).format(date)
  const { year, day } = toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
  return `${weekday}, ${day} ${month} ${year}`
}

/** Short Jalali text, e.g. `۲۷ شهریور ۱۴۰۵` / `27 Shahrivar 1405`. */
export function formatJalaliShort(date: Date, locale: 'fa' | 'en'): string {
  const fa = locale === 'fa'
  const calendarLocale = fa ? 'fa-IR-u-ca-persian' : 'en-GB-u-ca-persian'

  if (fa) {
    const value = new Intl.DateTimeFormat(calendarLocale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date)
    return toPersianDigits(value)
  }

  const month = new Intl.DateTimeFormat(calendarLocale, { month: 'long' }).format(date)
  const { year, day } = toJalali(date.getFullYear(), date.getMonth() + 1, date.getDate())
  return `${day} ${month} ${year}`
}

/** Gregorian text, e.g. `18 September 2026`. */
export function formatGregorian(date: Date, locale: 'fa' | 'en'): string {
  const value = new Intl.DateTimeFormat(locale === 'fa' ? 'fa-IR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date)
  return locale === 'fa' ? toPersianDigits(value) : value
}

/** Format a Jalali date the way a school employee writes it: `1405/07/01`. */
export function formatJalaliNumeric(date: JalaliDate, locale: 'fa' | 'en'): string {
  const yyyy = String(date.year).padStart(4, '0')
  const mm = String(date.month).padStart(2, '0')
  const dd = String(date.day).padStart(2, '0')
  const value = `${yyyy}/${mm}/${dd}`
  return locale === 'fa' ? toPersianDigits(value) : value
}

/** Parse `1405/07/01`, `1405-7-1` or `۱۴۰۵/۰۷/۰۱`. */
export function parseJalaliNumeric(input: string): JalaliDate | null {
  const normalized = toLatinDigits(input).replace(/[-.]/g, '/').trim()
  const match = /^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized)
  if (!match) return null
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  return isValidJalaliDate(date) ? date : null
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

export function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]).replace(/[٠-٩]/g, (d) => PERSIAN_DIGITS[ARABIC_INDIC_DIGITS.indexOf(d)])
}

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
}