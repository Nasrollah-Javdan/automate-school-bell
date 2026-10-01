import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { IconButton, Button } from './Button.js'
import { translate } from '../../../i18n/index.js'
import type { LanguageCode } from '../../../types/index.js'

export interface ModalProps {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  closeLabel?: string
  wide?: boolean
}

/**
 * Accessible dialog: Esc closes it, focus moves inside, and the rest of the
 * interface is not interactive while it is open.
 */
export function Modal({
  title,
  children,
  footer,
  onClose,
  closeLabel,
  wide
}: ModalProps): JSX.Element {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`modal${wide ? ' modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <IconButton icon="x" label={closeLabel ?? 'Close'} onClick={onClose} />
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  )
}

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  tone?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      closeLabel={cancelLabel}
      footer={
        <>
          <Button onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  )
}

export function useConfirm(): {
  request: (options: Omit<ConfirmDialogProps, 'onCancel'>) => void
  dialog: JSX.Element | null
} {
  const [pending, setPending] = useState<Omit<ConfirmDialogProps, 'onCancel'> | null>(null)

  const request = (options: Omit<ConfirmDialogProps, 'onCancel'>): void => setPending(options)
  const close = (): void => setPending(null)

  return {
    request,
    dialog: pending ? (
      <ConfirmDialog
        {...pending}
        onCancel={close}
        onConfirm={() => {
          pending.onConfirm()
          close()
        }}
      />
    ) : null
  }
}

export function defaultConfirmLabels(lang: LanguageCode): { confirm: string; cancel: string } {
  return { confirm: translate(lang, 'common.confirm'), cancel: translate(lang, 'common.cancel') }
}