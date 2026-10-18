import { type ComponentProps, type ReactNode, useId } from 'react'
import { cx } from '@/lib/cx'
import styles from './Field.module.css'

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v6M12 17h.01" strokeLinecap="round" />
    </svg>
  )
}

/** Mensaje de error de un campo. Su id va en aria-describedby del control. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} className={styles.error}>
      <AlertIcon />
      {children}
    </span>
  )
}

/** Resumen al inicio de un formulario: "Revisa 1 campo antes de continuar." */
export function FormErrorSummary({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className={styles.summary}>
      {children}
    </div>
  )
}

export interface ControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  className: string
}

interface FormFieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string
  optional?: boolean
  className?: string
  /** Pinta el control con los atributos de accesibilidad ya enlazados. */
  children: (control: ControlProps) => ReactNode
}

/** Etiqueta visible + control + pista + error, enlazados con aria-describedby y aria-invalid (sec. 28). */
export function FormField({ label, hint, error, optional, className, children }: FormFieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (opcional)</span>}
      </label>
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, className: styles.control })}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}

type FieldBase = { label: ReactNode; hint?: ReactNode; error?: string; optional?: boolean; fieldClassName?: string }

export function TextField({ label, hint, error, optional, fieldClassName, ...input }: FieldBase & ComponentProps<'input'>) {
  return (
    <FormField label={label} hint={hint} error={error} optional={optional} className={fieldClassName}>
      {(control) => <input {...input} {...control} className={cx(control.className, input.className)} />}
    </FormField>
  )
}

export function Textarea({ label, hint, error, optional, fieldClassName, ...rest }: FieldBase & ComponentProps<'textarea'>) {
  return (
    <FormField label={label} hint={hint} error={error} optional={optional} className={fieldClassName}>
      {(control) => <textarea {...rest} {...control} className={cx(control.className, rest.className)} />}
    </FormField>
  )
}

export function Select({ label, hint, error, optional, fieldClassName, children, ...rest }: FieldBase & ComponentProps<'select'>) {
  return (
    <FormField label={label} hint={hint} error={error} optional={optional} className={fieldClassName}>
      {(control) => (
        <select {...rest} {...control} className={cx(control.className, rest.className)}>
          {children}
        </select>
      )}
    </FormField>
  )
}

type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; error?: string }

export function Checkbox({ label, error, className, ...rest }: CheckboxProps) {
  const id = useId()
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={className}>
      <label className={styles.check}>
        <input type="checkbox" {...rest} aria-invalid={error ? true : undefined} aria-describedby={errorId} />
        <span>{label}</span>
      </label>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}

interface RadioGroupProps<T extends string> {
  legend: ReactNode
  name: string
  value: T | undefined
  options: Array<{ value: T; label: ReactNode; disabled?: boolean }>
  onChange: (value: T) => void
  error?: string
  className?: string
}

export function RadioGroup<T extends string>({ legend, name, value, options, onChange, error, className }: RadioGroupProps<T>) {
  const id = useId()
  const errorId = error ? `${id}-error` : undefined
  return (
    <fieldset className={cx(styles.fieldset, className)} aria-describedby={errorId}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className={styles.check}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  )
}
