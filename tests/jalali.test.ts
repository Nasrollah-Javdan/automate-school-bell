import { describe, expect, it } from 'vitest'
import {
  formatJalaliNumeric,
  isJalaliYearSupported,
  isLeapJalaliYear,
  isValidJalaliDate,
  isoDayKey,
  jalaliKey,
  jalaliMonthLength,
  jalaliMonthMatrix,
  parseJalaliNumeric,
  toGregorian,
  toJalali,
  toLatinDigits,
  toPersianDigits,
  weekdayIndex
} from '../src/utils/jalali.js'

describe('jalali conversion', () => {
  it('converts a known Gregorian date to Jalali', () => {
    // 2026-09-27 → 5 Mehr 1405
    expect(toJalali(2026, 9, 27)).toEqual({ year: 1405, month: 7, day: 5 })
    // 2026-10-01 → 9 Mehr 1405
    expect(toJalali(2026, 10, 1)).toEqual({ year: 1405, month: 7, day: 9 })
    // 2024-03-20 → 1 Farvardin 1403
    expect(toJalali(2024, 3, 20)).toEqual({ year: 1403, month: 1, day: 1 })
  })

  it('converts back to Gregorian', () => {
    expect(toGregorian(1405, 7, 5)).toEqual({ gy: 2026, gm: 9, gd: 27 })
    expect(toGregorian(1403, 1, 1)).toEqual({ gy: 2024, gm: 3, gd: 20 })
  })

  it('round trips every day of a full year', () => {
    for (let day = 1; day <= 365; day += 1) {
      const jalali = toJalali(2026, 1, 1)
      void jalali
      const start = new Date(2026, 0, day)
      const back = toJalali(start.getFullYear(), start.getMonth() + 1, start.getDate())
      const gregorian = toGregorian(back.year, back.month, back.day)
      expect([gregorian.gy, gregorian.gm, gregorian.gd]).toEqual([
        start.getFullYear(),
        start.getMonth() + 1,
        start.getDate()
      ])
    }
  })

  it('knows leap years and month lengths', () => {
    expect(isLeapJalaliYear(1403)).toBe(true)
    expect(isLeapJalaliYear(1404)).toBe(false)
    expect(jalaliMonthLength(1404, 12)).toBe(29)
    expect(jalaliMonthLength(1403, 12)).toBe(30)
    expect(jalaliMonthLength(1404, 1)).toBe(31)
    expect(jalaliMonthLength(1404, 7)).toBe(30)
  })

  it('validates dates', () => {
    expect(isValidJalaliDate({ year: 1405, month: 7, day: 9 })).toBe(true)
    expect(isValidJalaliDate({ year: 1405, month: 13, day: 1 })).toBe(false)
    expect(isValidJalaliDate({ year: 1404, month: 12, day: 30 })).toBe(false)
    expect(isValidJalaliDate({ year: 1403, month: 12, day: 30 })).toBe(true)
    expect(isValidJalaliDate({ year: 9999, month: 1, day: 1 })).toBe(false)
    expect(isJalaliYearSupported(1405)).toBe(true)
    expect(isJalaliYearSupported(-100)).toBe(false)
  })
})

describe('jalali formatting and parsing', () => {
  it('formats and parses numeric dates', () => {
    const date = { year: 1405, month: 7, day: 1 }
    expect(formatJalaliNumeric(date, 'en')).toBe('1405/07/01')
    expect(formatJalaliNumeric(date, 'fa')).toBe('۱۴۰۵/۰۷/۰۱')
    expect(parseJalaliNumeric('1405/7/1')).toEqual(date)
    expect(parseJalaliNumeric('1405-07-01')).toEqual(date)
    expect(parseJalaliNumeric('۱۴۰۵/۰۷/۰۱')).toEqual(date)
    expect(parseJalaliNumeric('1405/13/01')).toBeNull()
    expect(parseJalaliNumeric('nonsense')).toBeNull()
  })

  it('creates stable keys', () => {
    expect(jalaliKey({ year: 1405, month: 7, day: 1 })).toBe('1405-07-01')
    expect(isoDayKey(new Date(2026, 8, 27))).toBe('2026-09-27')
  })

  it('converts digits', () => {
    expect(toPersianDigits('1405/07/01')).toBe('۱۴۰۵/۰۷/۰۱')
    expect(toLatinDigits('۱۴۰۵')).toBe('1405')
  })

  it('starts month grids on Saturday', () => {
    // 1 Mehr 1405 (2026-09-23) is a Wednesday → Saturday-first offset 4
    const matrix = jalaliMonthMatrix({ year: 1405, month: 7, day: 1 })
    expect(matrix).toHaveLength(42)
    expect(matrix.slice(0, 4).every((cell) => cell === null)).toBe(true)
    expect(matrix[4]).toEqual({ year: 1405, month: 7, day: 1 })
  })
})

describe('weekday index', () => {
  it('uses the Iranian week order', () => {
    expect(weekdayIndex(new Date(2026, 9, 3))).toBe(0) // Saturday
    expect(weekdayIndex(new Date(2026, 9, 4))).toBe(1) // Sunday
    expect(weekdayIndex(new Date(2026, 9, 9))).toBe(6) // Friday
  })
})
