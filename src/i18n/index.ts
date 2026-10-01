import type { LanguageCode, Direction, LogCode, Weekday } from '../types/index.js'
import { toPersianDigits } from '../utils/jalali.js'
import en from './en.js'
import type { Messages } from './en.js'
import fa from './fa.js'

export type MessageKey = keyof Messages
export type MessageParams = Record<string, string | number>

export const MESSAGES: Record<LanguageCode, Messages> = { en, fa }
export const LANGUAGES: readonly LanguageCode[] = ['fa', 'en']
export const DEFAULT_LANGUAGE: LanguageCode = 'fa'

export const isLanguage = (value: unknown): value is LanguageCode =>
  value === 'fa' || value === 'en'

export const directionOf = (lang: LanguageCode): Direction => (lang === 'fa' ? 'rtl' : 'ltr')

/** Locale for `Intl` — Persian users expect the Iranian calendar and digits. */
export const intlLocale = (lang: LanguageCode): string => (lang === 'fa' ? 'fa-IR' : 'en-GB')

/**
 * Translate `key` for `lang`. Missing keys fall back to English and then to the
 * key itself, so a typo can never crash or blank out the interface.
 */
export function translate(lang: LanguageCode, key: MessageKey, params?: MessageParams): string {
  const catalog = MESSAGES[lang] ?? MESSAGES[DEFAULT_LANGUAGE]
  const raw = catalog[key] ?? MESSAGES.en[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? formatParam(lang, params[name]) : match
  )
}

/**
 * Numbers inside Persian text use Persian digits. Only plain numbers are
 * converted, so file paths and titles stay untouched.
 */
function formatParam(lang: LanguageCode, value: string | number): string {
  if (lang !== 'fa') return String(value)
  if (typeof value === 'number') return toPersianDigits(String(value))
  return /^[\p{N}:/.\- ]+$/u.test(value) ? toPersianDigits(value) : value
}

/** Curried translator: `const t = translator('fa'); t('common.save')` */
export const translator =
  (lang: LanguageCode) =>
  (key: MessageKey, params?: MessageParams): string =>
    translate(lang, key, params)

export const weekdayKey = (day: Weekday, short = false): MessageKey =>
  `weekday.${short ? 'short.' : ''}${day}` as MessageKey

export const weekdayName = (lang: LanguageCode, day: Weekday, short = false): string =>
  translate(lang, weekdayKey(day, short))

export const statusKey = (mode: 'active' | 'paused' | 'disabled'): MessageKey =>
  `status.${mode}` as MessageKey

/** Log entries store a code + params so they stay readable in both languages. */
export const logEntryKey = (code: LogCode): MessageKey => `log.entry.${code}` as MessageKey

export const logEntryText = (lang: LanguageCode, code: LogCode, params: MessageParams): string =>
  translate(lang, logEntryKey(code), params)