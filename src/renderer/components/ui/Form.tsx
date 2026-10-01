import { useState, type ChangeEvent, type InputHTMLAttributes, type JSX, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Icon } from '../Icon.js'

/* ------------------------------------------------------------------ Field */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- TextField */

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string
  hint?: string
  error?: string
  variant?: 'default' | 'time'
  icon?: ReactNode
}

export function TextField({
  label,
  hint,
  error,
  variant = 'default',
  icon,
  id,
  required,
  ...rest
}: TextFieldProps): JSX.Element {
  const inputId = id ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} required={required}>
      <div className={icon ? 'input-group' : undefined}>
        {icon}
        <input
          id={inputId}
          className={`input${variant === 'time' ? ' input--time' : ''}${error ? ' input--error' : ''}`}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      </div>
    </Field>
  )
}

/* ------------------------------------------------------------------ Select */

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export interface SelectFieldProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label?: string
  hint?: string
  value: T
  options: SelectOption<T>[]
  onValueChange: (value: T) => void
  includeEmptyOption?: string
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  onValueChange,
  includeEmptyOption,
  id,
  ...rest
}: SelectFieldProps<T>): JSX.Element {
  const selectId = id ?? `select-${label?.replace(/\s+/g, '-').toLowerCase() ?? 'field'}`

  const select = (
    <select
      id={selectId}
      className="select"
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onValueChange(event.target.value as T)}
      {...rest}
    >
      {includeEmptyOption ? <option value="">{includeEmptyOption}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )

  if (!label) return select

  return (
    <Field label={label} htmlFor={selectId} hint={hint}>
      {select}
    </Field>
  )
}

/* ------------------------------------------------------------------ Switch */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  id?: string
}): JSX.Element {
  const inputId = id ?? `switch-${label?.replace(/\s+/g, '-').toLowerCase() ?? 'field'}`
  return (
    <label className={`switch${disabled ? ' switch--disabled' : ''}`} htmlFor={inputId}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch__control" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </label>
  )
}

/* ------------------------------------------------------------------ Slider */

/**
 * Slider with a local draft value: the interface stays responsive while
 * dragging and the (more expensive) save only runs on release.
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onCommit,
  ariaLabel,
  disabled
}: {
  value: number
  min?: number
  max?: number
  step?: number
  /** Called when the user releases the slider — used to persist settings. */
  onCommit?: (value: number) => void
  ariaLabel: string
  disabled?: boolean
}): JSX.Element {
  const [draft, setDraft] = useState<number | null>(null)
  const current = draft ?? value

  const commit = (next: number): void => {
    setDraft(null)
    if (next !== value) onCommit?.(next)
  }

  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(Number(event.target.value))}
        onPointerUp={() => commit(current)}
        onKeyUp={() => commit(current)}
        onBlur={() => commit(current)}
      />
      <span className="slider__value mono-num">
        {current}
        {max === 100 ? '%' : ''}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------- Segmented */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
}): JSX.Element {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented__item${option.value === value ? ' segmented__item--active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------- Setting row */

export function SettingRow({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="setting">
      <div className="setting__text">
        <div className="setting__title">{title}</div>
        {hint ? <div className="setting__hint">{hint}</div> : null}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------ Notice/Empty */

export function Notice({
  tone = 'info',
  icon = 'info',
  children
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success'
  icon?: Parameters<typeof Icon>[0]['name']
  children: ReactNode
}): JSX.Element {
  const toneClass = tone === 'info' ? '' : ` notice--${tone}`
  return (
    <div className={`notice${toneClass}`} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="notice__icon">
        <Icon name={icon} size={16} />
      </span>
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action
}: {
  icon: Parameters<typeof Icon>[0]['name']
  title: string
  hint?: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <div className="empty__title">{title}</div>
      {hint ? <p className="empty__hint">{hint}</p> : null}
      {action}
    </div>
  )
}

export function Spinner({ label }: { label?: string }): JSX.Element {
  return (
    <div className="row" style={{ justifyContent: 'center', padding: 'var(--sp-6)' }}>
      <span className="spinner" aria-hidden="true" />
      {label ? <span className="text-2 text-sm">{label}</span> : null}
    </div>
  )
}