import type { MessageKey, MessageParams } from '../i18n/index.js'

/**
 * Errors that carry a translation key, so the user always sees a message in
 * their own language instead of a technical string.
 */
export class AppError extends Error {
  readonly code: MessageKey
  readonly params: MessageParams | undefined

  constructor(code: MessageKey, params?: MessageParams) {
    super(code)
    this.name = 'AppError'
    this.code = code
    this.params = params
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export const ok = <T>(data: T): { ok: true; data: T } => ({ ok: true, data })
export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
