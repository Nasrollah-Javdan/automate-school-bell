import { describe, expect, it } from 'vitest'
import { dayKeyOf, isFiredId, pruneFiredIds, MAX_FIRED_IDS } from '../src/shared/fired.js'
import { bellOccurrenceId } from '../src/utils/time.js'

describe('fired bell registry', () => {
  it('creates unique ids per bell and time', () => {
    const first = bellOccurrenceId('2026-09-27', '09:30', 'b1')
    const second = bellOccurrenceId('2026-09-27', '09:30', 'b2')
    const nextDay = bellOccurrenceId('2026-09-28', '09:30', 'b1')
    expect(first).not.toBe(second)
    expect(first).not.toBe(nextDay)
  })

  it('validates the id shape', () => {
    expect(isFiredId('2026-09-27_09:30_b1')).toBe(true)
    expect(isFiredId('2026-09-27_9:30_b1')).toBe(false)
    expect(isFiredId('garbage')).toBe(false)
    expect(dayKeyOf('2026-09-27_09:30_b1')).toBe('2026-09-27')
  })

  it('drops malformed ids', () => {
    const ids = ['2026-09-27_09:30_b1', 'nonsense', '', '2026-13-45_99:99_b2']
    pruneFiredIds(ids, new Date('2026-09-27T12:00:00'))
    expect(ids).toEqual(['2026-09-27_09:30_b1'])
  })

  it('drops ids older than the retention window', () => {
    const ids = ['2026-09-01_09:30_b1', '2026-09-25_09:30_b2']
    pruneFiredIds(ids, new Date('2026-09-27T12:00:00'))
    expect(ids).toEqual(['2026-09-25_09:30_b2'])
  })

  it('keeps at most the maximum number of ids', () => {
    const ids = Array.from({ length: MAX_FIRED_IDS + 250 }, (_, index) =>
      bellOccurrenceId('2026-09-27', '09:30', `b${index}`)
    )
    pruneFiredIds(ids, new Date('2026-09-27T12:00:00'))
    expect(ids).toHaveLength(MAX_FIRED_IDS)
    expect(ids.at(-1)).toContain(`b${MAX_FIRED_IDS + 249}`)
  })
})