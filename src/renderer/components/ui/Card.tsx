import type { JSX, ReactNode } from 'react'
import type { LanguageCode, SystemMode } from '../../../types/index.js'
import { translate } from '../../../i18n/index.js'
import { Icon, type IconName } from '../Icon.js'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <section className={`card ${className}`}>{children}</section>
}

export function CardHeader({
  title,
  icon,
  actions
}: {
  title: string
  icon?: IconName
  actions?: ReactNode
}): JSX.Element {
  return (
    <header className="card__header">
      <h2 className="card__title">
        {icon ? <Icon name={icon} size={17} /> : null}
        {title}
      </h2>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  )
}

export function CardBody({ children, flush }: { children: ReactNode; flush?: boolean }): JSX.Element {
  return <div className={flush ? 'card__body card__body--flush' : 'card__body'}>{children}</div>
}

export function CardFooter({ children }: { children: ReactNode }): JSX.Element {
  return <footer className="card__footer">{children}</footer>
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger'

export function Badge({
  children,
  tone = 'neutral',
  icon
}: {
  children: ReactNode
  tone?: BadgeTone
  icon?: IconName
}): JSX.Element {
  const toneClass = tone === 'neutral' ? '' : ` badge--${tone}`
  return (
    <span className={`badge${toneClass}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  )
}

/** Big status indicator shown in the header and on the dashboard. */
export function StatusPill({
  mode,
  lang,
  size
}: {
  mode: SystemMode
  lang: LanguageCode
  size?: 'lg'
}): JSX.Element {
  return (
    <span className={`pill pill--${mode}${size === 'lg' ? ' pill--lg' : ''}`}>
      <span className="pill__dot" aria-hidden="true" />
      {translate(lang, `status.${mode}`)}
    </span>
  )
}
