import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react'
import { Icon, type IconName } from '../Icon.js'

type Variant = 'default' | 'primary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconName
  block?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  block,
  className = '',
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} {...rest}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  /** Visible text for screen readers; also shown as a tooltip. */
  label: string
  variant?: Variant
  size?: Size
  tone?: 'default' | 'danger'
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  tone = 'default',
  className = '',
  ...rest
}: IconButtonProps): JSX.Element {
  const classes = [
    'btn',
    'btn--icon',
    variant !== 'default' ? `btn--${variant}` : '',
    size !== 'md' ? `btn--${size}` : '',
    tone === 'danger' ? 'btn--danger' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className="tooltip-anchor">
      <button type="button" className={classes} aria-label={label} title={label} {...rest}>
        <Icon name={icon} size={size === 'sm' ? 15 : 17} />
      </button>
      <span className="tooltip" role="presentation">
        {label}
      </span>
    </span>
  )
}

export function ButtonRow({ children }: { children: ReactNode }): JSX.Element {
  return <div className="btn-group">{children}</div>
}
