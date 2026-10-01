import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.js'
import fa from '../src/i18n/fa.js'
import { MESSAGES, directionOf, translate, translator, weekdayName } from '../src/i18n/index.js'
import { ParseError, parseAppState, parseLogEntries, sanitizeBell, sanitizeSettings } from '../src/shared/validate.js'
import { createDefaultState } from '../src/shared/defaults.js'

describe('localization', () => {
  it('has exactly the same keys in both languages', () => {
    const enKeys = Object.keys(en).sort()
    const faKeys = Object.keys(fa).sort()
    expect(faKeys).toEqual(enKeys)
  })

  it('has no empty message', () => {
    for (const [key, value] of Object.entries(en)) {
      if (key === 'dashboard.bellStatus.upcoming') continue // intentionally blank
      expect(value.trim(), `en.${key}`).not.toBe('')
    }
    for (const [key, value] of Object.entries(fa)) {
      if (key === 'dashboard.bellStatus.upcoming') continue
      expect(value.trim(), `fa.${key}`).not.toBe('')
    }
  })

  it('uses the same placeholders in both languages', () => {
    const placeholders = (text: string): string[] => (text.match(/\{(\w+)\}/g) ?? []).sort()
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(placeholders(fa[key]), key).toEqual(placeholders(en[key]))
    }
  })

  it('interpolates parameters and converts digits for Persian', () => {
    expect(translate('en', 'schedule.profileBells', { count: 5 })).toBe('5 bells')
    expect(translate('fa', 'schedule.profileBells', { count: 5 })).toBe('۵ زنگ')
    expect(translate('fa', 'log.entry.log.bell.missed', { title: 'Break', time: '10:15' })).toContain('۱۰:۱۵')
    expect(translate('fa', 'sounds.fileMissingHint', { path: 'D:\\sounds\\1.wav' })).toContain('D:\\sounds\\1.wav')
  })

  it('falls back to English for an unknown key', () => {
    const missing = 'does.not.exist' as Parameters<typeof translate>[1]
    expect(translate('fa', missing)).toBe('does.not.exist')
  })

  it('reports the right text direction', () => {
    expect(directionOf('fa')).toBe('rtl')
    expect(directionOf('en')).toBe('ltr')
    expect(weekdayName('fa', 0)).toBe('شنبه')
    expect(weekdayName('en', 0)).toBe('Saturday')
  })

  it('exposes a curried translator', () => {
    const t = translator('en')
    expect(t('common.save')).toBe('Save')
    expect(Object.keys(MESSAGES)).toEqual(['en', 'fa'])
  })
})

describe('state validation', () => {
  it('keeps a valid state untouched', () => {
    const state = createDefaultState('fa')
    const parsed = parseAppState(state)
    expect(parsed.recovered).toBe(false)
    expect(parsed.value.schedules).toHaveLength(1)
    expect(parsed.value.settings.language).toBe('fa')
  })

  it('recovers from an empty file', () => {
    const parsed = parseAppState({})
    expect(parsed.recovered).toBe(true)
    expect(parsed.value.schedules).toHaveLength(1)
  })

  it('recovers from garbage input', () => {
    expect(parseAppState(null).recovered).toBe(true)
    expect(parseAppState('nope').recovered).toBe(true)
    expect(parseAppState(42).recovered).toBe(true)
  })

  it('refuses a backup from a newer version', () => {
    expect(() => parseAppState({ version: 999, settings: {} })).toThrow(ParseError)
  })

  it('drops bells with an invalid time', () => {
    expect(sanitizeBell({ time: '99:99', title: 'x' })).toBeNull()
    expect(sanitizeBell({ time: '08:30', title: '  ' })?.title).toBe('—')
    expect(sanitizeBell({ time: '08:30', title: 'First bell' })?.time).toBe('08:30')
  })

  it('clamps settings and fixes unknown references', () => {
    const settings = sanitizeSettings(
      { volume: 999, uiScale: 133, theme: 'neon', language: 'de', missedGraceMinutes: 0 },
      'en'
    )
    expect(settings.volume).toBe(100)
    expect(settings.uiScale).toBe(100)
    expect(settings.theme).toBe('system')
    expect(settings.language).toBe('en')
    expect(settings.missedGraceMinutes).toBe(1)
  })

  it('clears sound references that no longer exist', () => {
    const state = createDefaultState('en')
    state.schedules[0].bells[0].soundId = 'ghost'
    const parsed = parseAppState(state)
    expect(parsed.value.schedules[0].bells[0].soundId).toBeNull()
  })

  it('points the active schedule at an existing schedule', () => {
    const state = createDefaultState('en')
    state.activeScheduleId = 'missing'
    const parsed = parseAppState(state)
    expect(parsed.value.activeScheduleId).toBe(parsed.value.schedules[0].id)
  })

  it('parses log entries safely', () => {
    const entries = parseLogEntries([
      { id: 'l1', at: 1, level: 'info', code: 'log.app.started', params: {} },
      { id: 'l2', at: 2, level: 'huh', code: 'log.bell.played', params: { title: 'x' } },
      { id: 'l3', at: 3, level: 'info', code: 'not.a.code', params: {} },
      null,
      'nope'
    ])
    expect(entries).toHaveLength(2)
    expect(entries[0].code).toBe('log.app.started')
    expect(entries[1].level).toBe('info')
  })
})